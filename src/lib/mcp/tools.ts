// Werkzeuge, die eine KI (z. B. Claude) über den Projektraum-Konnektor nutzen kann.
// Alle Abfragen laufen mit dem Zugangsschlüssel der angemeldeten Person –
// die Datenbank-Regeln (RLS) gelten also genauso wie in der App. Löschen ist bewusst nicht möglich.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, TaskPriority, TaskRecurrence, TaskStatus } from "@/lib/database.types";

export type Db = SupabaseClient<Database>;
export type Ctx = { db: Db; userId: string; appUrl: string };

type JsonSchema = Record<string, unknown>;
export type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  annotations: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
  run: (ctx: Ctx, args: Record<string, unknown>) => Promise<unknown>;
};

/** Fehler, die der KI (und damit dem Menschen) verständlich gezeigt werden */
export class ToolError extends Error {}

const STATUS: Record<TaskStatus, string> = { todo: "Offen", doing: "In Arbeit", review: "Zur Prüfung", done: "Erledigt" };
const PRIO: Record<TaskPriority, string> = { high: "Hoch", medium: "Mittel", low: "Niedrig" };
const RECUR: TaskRecurrence[] = ["daily", "weekly", "biweekly", "monthly", "yearly"];
const PROJECT_COLORS = ["#1F5FBF", "#0E7C66", "#6B4FB3", "#B4561C", "#8A6A12", "#B0336B"];

// ---------- kleine Prüfhelfer ----------

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

function uuid(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (!isUuid(v)) throw new ToolError(`"${key}" muss eine gültige ID sein (aus list_projects bzw. list_tasks).`);
  return v;
}

function text(v: unknown, key: string, max: number, required = false): string | undefined {
  if (v === undefined || v === null || v === "") {
    if (required) throw new ToolError(`"${key}" fehlt.`);
    return undefined;
  }
  if (typeof v !== "string") throw new ToolError(`"${key}" muss Text sein.`);
  const s = v.trim();
  if (required && !s) throw new ToolError(`"${key}" darf nicht leer sein.`);
  if (s.length > max) throw new ToolError(`"${key}" ist zu lang (höchstens ${max} Zeichen).`);
  return s;
}

function date(v: unknown, key: string): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(Date.parse(v + "T00:00:00Z")))
    throw new ToolError(`"${key}" muss ein Datum im Format JJJJ-MM-TT sein, z. B. 2026-10-20.`);
  return v;
}

function oneOf<T extends string>(v: unknown, key: string, allowed: readonly T[]): T | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string" || !allowed.includes(v as T)) throw new ToolError(`"${key}" muss einer dieser Werte sein: ${allowed.join(", ")}.`);
  return v as T;
}

function strList(v: unknown, key: string, maxItems: number, maxLen: number): string[] | undefined {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v)) throw new ToolError(`"${key}" muss eine Liste sein.`);
  if (v.length > maxItems) throw new ToolError(`"${key}": höchstens ${maxItems} Einträge.`);
  return v.map((x, i) => text(x, `${key}[${i}]`, maxLen, true)!);
}

function dbError(e: { message: string } | null, what: string) {
  if (e) throw new ToolError(`${what} hat nicht geklappt: ${e.message}`);
}

const todayVienna = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Vienna" }).format(new Date());

// ---------- gemeinsame Abfragen ----------

type Member = { id: string; name: string };

async function projectInfo(ctx: Ctx, projectId: string) {
  const { data, error } = await ctx.db
    .from("projects")
    .select("id, name, workspace_id, archived_at, workspaces(name)")
    .eq("id", projectId)
    .maybeSingle();
  dbError(error, "Projekt laden");
  if (!data) throw new ToolError("Dieses Projekt gibt es nicht, oder du hast keinen Zugriff darauf.");
  return data;
}

/** Rolle im Bereich (wie in der Datenbank): Admins der Firma dürfen immer bearbeiten */
async function roleIn(ctx: Ctx, workspaceId: string): Promise<"editor" | "commenter" | "viewer"> {
  const { data: ws } = await ctx.db.from("workspaces").select("organization_id").eq("id", workspaceId).maybeSingle();
  const [{ data: org }, { data: wm }] = await Promise.all([
    ctx.db.from("organization_members").select("role").eq("organization_id", ws?.organization_id ?? "").eq("user_id", ctx.userId).maybeSingle(),
    ctx.db.from("workspace_members").select("role").eq("workspace_id", workspaceId).eq("user_id", ctx.userId).maybeSingle(),
  ]);
  if (org?.role === "owner" || org?.role === "admin") return "editor";
  return wm?.role ?? "viewer";
}

async function requireRole(ctx: Ctx, workspaceId: string, need: "edit" | "comment") {
  const r = await roleIn(ctx, workspaceId);
  if (r === "editor" || (need === "comment" && r === "commenter")) return;
  throw new ToolError(
    r === "commenter"
      ? "In diesem Bereich darfst du nur kommentieren, aber nichts anlegen oder ändern. Ein Admin deiner Firma kann dir mehr Rechte geben."
      : "In diesem Bereich darfst du nur ansehen. Ein Admin deiner Firma kann dir mehr Rechte geben.",
  );
}

async function taskWorkspace(ctx: Ctx, taskId: string) {
  const { data } = await ctx.db.from("tasks").select("projects(workspace_id)").eq("id", taskId).maybeSingle();
  if (!data?.projects) throw new ToolError("Diese Aufgabe gibt es nicht, oder du hast keinen Zugriff darauf.");
  return data.projects.workspace_id;
}

async function membersOf(ctx: Ctx, workspaceIds: string[]): Promise<Map<string, Member[]>> {
  const out = new Map<string, Member[]>();
  if (!workspaceIds.length) return out;
  const { data: wm, error } = await ctx.db.from("workspace_members").select("workspace_id, user_id").in("workspace_id", workspaceIds);
  dbError(error, "Mitglieder laden");
  const ids = [...new Set([ctx.userId, ...(wm ?? []).map((m) => m.user_id)])];
  const { data: profiles } = await ctx.db.from("profiles").select("id, display_name").in("id", ids);
  const name = new Map((profiles ?? []).map((p) => [p.id, p.display_name || "Unbenannt"]));
  for (const w of workspaceIds) {
    const list = (wm ?? []).filter((m) => m.workspace_id === w).map((m) => ({ id: m.user_id, name: name.get(m.user_id) ?? "Unbenannt" }));
    // Private Bereiche haben oft keine Einträge – dann ist man selbst das einzige Mitglied
    if (!list.some((m) => m.id === ctx.userId)) list.unshift({ id: ctx.userId, name: name.get(ctx.userId) ?? "Ich" });
    out.set(w, list);
  }
  return out;
}

/** Namen (oder "ich") in Personen-IDs übersetzen – nur Mitglieder des Bereichs */
function resolvePeople(ctx: Ctx, names: string[], members: Member[]): string[] {
  const ids: string[] = [];
  for (const raw of names) {
    const n = raw.toLowerCase();
    if (["ich", "mir", "mich", "me", "myself", "self"].includes(n)) {
      ids.push(ctx.userId);
      continue;
    }
    if (isUuid(raw) && members.some((m) => m.id === raw)) {
      ids.push(raw);
      continue;
    }
    const exact = members.filter((m) => m.name.toLowerCase() === n);
    const partial = exact.length ? exact : members.filter((m) => m.name.toLowerCase().split(/\s+/).some((p) => p === n) || m.name.toLowerCase().includes(n));
    if (partial.length === 1) ids.push(partial[0].id);
    else if (partial.length > 1)
      throw new ToolError(`"${raw}" passt auf mehrere Personen (${partial.map((m) => m.name).join(", ")}). Bitte genauer angeben.`);
    else
      throw new ToolError(
        `"${raw}" ist in diesem Bereich nicht Mitglied. Mögliche Personen: ${members.map((m) => m.name).join(", ")}. Neue Personen lädt man in der App ein.`,
      );
  }
  return [...new Set(ids)];
}

async function sectionId(ctx: Ctx, projectId: string, name: string | undefined, cache: Map<string, string>): Promise<string | null | undefined> {
  if (name === undefined) return undefined;
  if (!name) return null;
  const key = name.toLowerCase();
  if (cache.has(key)) return cache.get(key)!;
  const { data: list, error } = await ctx.db.from("sections").select("id, name, position").eq("project_id", projectId).order("position");
  dbError(error, "Rubriken laden");
  const found = (list ?? []).find((s) => s.name.toLowerCase() === key);
  if (found) {
    cache.set(key, found.id);
    return found.id;
  }
  const position = (list ?? []).reduce((m, s) => Math.max(m, s.position), 0) + 1;
  const { data, error: e2 } = await ctx.db.from("sections").insert({ project_id: projectId, name, position }).select("id").single();
  dbError(e2, `Rubrik "${name}" anlegen`);
  cache.set(key, data!.id);
  return data!.id;
}

async function milestoneId(ctx: Ctx, projectId: string, name: string | undefined): Promise<string | null | undefined> {
  if (name === undefined) return undefined;
  if (!name) return null;
  const { data, error } = await ctx.db.from("milestones").select("id, name").eq("project_id", projectId);
  dbError(error, "Meilensteine laden");
  const m = (data ?? []).find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!m) throw new ToolError(`Meilenstein "${name}" gibt es in diesem Projekt nicht. Vorhanden: ${(data ?? []).map((x) => x.name).join(", ") || "keine"}.`);
  return m.id;
}

const link = (ctx: Ctx, projectId: string) => `${ctx.appUrl}/p/${projectId}`;

// ---------- Schemas ----------

const taskFields: Record<string, JsonSchema> = {
  description: { type: "string", description: "Beschreibung, Details, Notizen (optional)" },
  start_date: { type: ["string", "null"], description: "Beginn JJJJ-MM-TT (für den Zeitplan), null entfernt das Datum. Darf nicht nach der Fälligkeit liegen." },
  due_date: { type: ["string", "null"], description: "Fälligkeitsdatum JJJJ-MM-TT, null entfernt das Datum" },
  priority: { type: "string", enum: ["low", "medium", "high"], description: "Priorität: low = Niedrig, medium = Mittel, high = Hoch" },
  status: { type: "string", enum: ["todo", "doing", "review", "done"], description: "todo = Offen, doing = In Arbeit, review = Zur Prüfung, done = Erledigt" },
  section: { type: "string", description: "Name der Rubrik (Board-Spalte) im Projekt. Gibt es sie noch nicht, wird sie angelegt. Leerer Text = keine Rubrik." },
  milestone: { type: "string", description: "Name eines vorhandenen Meilensteins im Projekt. Leerer Text = kein Meilenstein." },
  assignees: {
    type: "array",
    items: { type: "string" },
    description: 'Verantwortliche: Namen von Mitgliedern des Bereichs (siehe list_projects) oder "ich".',
  },
  recurrence: { type: ["string", "null"], enum: ["daily", "weekly", "biweekly", "monthly", "yearly", null], description: "Wiederholung; null = keine" },
};

// ---------- Werkzeuge ----------

export const TOOLS: Tool[] = [
  {
    name: "list_projects",
    title: "Projekte anzeigen",
    description:
      "Zeigt alle Bereiche (z. B. Privat, Firma) mit ihren Projekten, Rubriken, Meilensteinen und Mitgliedern, auf die die angemeldete Person Zugriff hat. Zuerst aufrufen, um IDs und Namen zu erfahren. Enthält auch das heutige Datum.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async run(ctx) {
      const { data, error } = await ctx.db
        .from("workspaces")
        .select("id, name, organizations(name, is_personal), projects(id, name, description, archived_at, sections(name, position), milestones(name, due_date, position))")
        .order("created_at");
      dbError(error, "Projekte laden");
      const ws = data ?? [];
      const members = await membersOf(ctx, ws.map((w) => w.id));
      const { data: me } = await ctx.db.from("profiles").select("display_name").eq("id", ctx.userId).maybeSingle();
      const roles = await Promise.all(ws.map((w) => roleIn(ctx, w.id)));
      const ROLE = { editor: "bearbeiten", commenter: "nur kommentieren", viewer: "nur ansehen" } as const;
      return {
        heute: todayVienna(),
        angemeldet_als: me?.display_name ?? "",
        bereiche: ws.map((w, i) => ({
          id: w.id,
          name: w.name,
          organisation: w.organizations?.is_personal ? "Privat" : w.organizations?.name,
          deine_rechte: ROLE[roles[i]],
          mitglieder: (members.get(w.id) ?? []).map((m) => m.name),
          projekte: (w.projects ?? [])
            .filter((p) => !p.archived_at)
            .map((p) => ({
              id: p.id,
              name: p.name,
              beschreibung: p.description || undefined,
              rubriken: (p.sections ?? []).sort((a, b) => a.position - b.position).map((s) => s.name),
              meilensteine: (p.milestones ?? [])
                .sort((a, b) => a.position - b.position)
                .map((m) => (m.due_date ? `${m.name} (bis ${m.due_date})` : m.name)),
              link: link(ctx, p.id),
            })),
        })),
      };
    },
  },

  {
    name: "list_tasks",
    title: "Aufgaben anzeigen",
    description:
      "Listet Aufgaben auf, z. B. alle offenen Aufgaben eines Projekts, alles, was mir zugeteilt ist, oder was bis zu einem Datum fällig ist. Ohne Angaben: alle nicht erledigten Hauptaufgaben aus allen Projekten.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "Nur dieses Projekt (ID aus list_projects)" },
        assigned_to_me: { type: "boolean", description: "Nur Aufgaben, für die ich verantwortlich bin" },
        status: { type: "array", items: { type: "string", enum: ["todo", "doing", "review", "done"] }, description: "Nur diese Zustände. Standard: alle außer erledigt." },
        due_before: { type: "string", description: "Nur Aufgaben, die spätestens an diesem Tag fällig sind (JJJJ-MM-TT)" },
        search: { type: "string", description: "Suchbegriff im Titel" },
        include_subtasks: { type: "boolean", description: "Unteraufgaben mit auflisten (Standard: nein)" },
        limit: { type: "integer", minimum: 1, maximum: 200, description: "Höchstens so viele (Standard 100)" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async run(ctx, a) {
      const statuses = (Array.isArray(a.status) ? a.status : []).map((s, i) => oneOf(s, `status[${i}]`, ["todo", "doing", "review", "done"] as const)!);
      const due = date(a.due_before, "due_before");
      const search = text(a.search, "search", 100);
      const limit = typeof a.limit === "number" ? Math.min(200, Math.max(1, Math.floor(a.limit))) : 100;

      let q = ctx.db
        .from("tasks")
        .select("id, title, status, priority, start_date, due_date, parent_id, recurrence, project_id, projects!inner(name, archived_at), sections(name), milestones(name), task_assignees(user_id)")
        .is("projects.archived_at", null)
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("position")
        .limit(limit + 1);
      if (a.project_id !== undefined) q = q.eq("project_id", uuid(a, "project_id"));
      if (statuses.length) q = q.in("status", statuses);
      else q = q.neq("status", "done");
      if (due) q = q.lte("due_date", due);
      if (search) q = q.ilike("title", `%${search.replace(/[%_\\]/g, (c) => "\\" + c)}%`);
      if (!a.include_subtasks) q = q.is("parent_id", null);
      const { data, error } = await q;
      dbError(error, "Aufgaben laden");
      let rows = data ?? [];
      if (a.assigned_to_me) rows = rows.filter((t) => t.task_assignees.some((x) => x.user_id === ctx.userId));

      const people = [...new Set(rows.flatMap((t) => t.task_assignees.map((x) => x.user_id)))];
      const { data: profiles } = people.length ? await ctx.db.from("profiles").select("id, display_name").in("id", people) : { data: [] };
      const name = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
      const today = todayVienna();
      return {
        heute: today,
        anzahl: Math.min(rows.length, limit),
        weitere_vorhanden: rows.length > limit,
        aufgaben: rows.slice(0, limit).map((t) => ({
          id: t.id,
          titel: t.title,
          projekt: t.projects?.name,
          project_id: t.project_id,
          status: STATUS[t.status],
          prioritaet: PRIO[t.priority],
          beginn: t.start_date ?? undefined,
          faellig: t.due_date ?? undefined,
          ueberfaellig: t.due_date && t.status !== "done" && t.due_date < today ? true : undefined,
          rubrik: t.sections?.name,
          meilenstein: t.milestones?.name,
          verantwortlich: t.task_assignees.map((x) => name.get(x.user_id) ?? "?"),
          unteraufgabe_von: t.parent_id ?? undefined,
          wiederholung: t.recurrence ?? undefined,
        })),
      };
    },
  },

  {
    name: "get_task",
    title: "Aufgabe im Detail",
    description: "Zeigt eine Aufgabe mit Beschreibung, Unteraufgaben, Kommentaren, Links und Dateinamen.",
    inputSchema: {
      type: "object",
      properties: { task_id: { type: "string", description: "ID der Aufgabe" } },
      required: ["task_id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    async run(ctx, a) {
      const id = uuid(a, "task_id");
      const { data: t, error } = await ctx.db
        .from("tasks")
        .select("*, projects(name), sections(name), milestones(name), task_assignees(user_id)")
        .eq("id", id)
        .maybeSingle();
      dbError(error, "Aufgabe laden");
      if (!t) throw new ToolError("Diese Aufgabe gibt es nicht, oder du hast keinen Zugriff darauf.");
      const [{ data: subs }, { data: comments }, { data: att }] = await Promise.all([
        ctx.db.from("tasks").select("id, title, status").eq("parent_id", id).order("position"),
        ctx.db.from("comments").select("author_id, body, created_at").eq("task_id", id).order("created_at", { ascending: false }).limit(30),
        ctx.db.from("task_attachments").select("kind, name, url, size").eq("task_id", id).order("created_at"),
      ]);
      const [{ data: waits }, { data: blocks }] = await Promise.all([
        ctx.db.from("task_dependencies").select("depends_on, tasks!task_dependencies_depends_on_fkey(title, status)").eq("task_id", id),
        ctx.db.from("task_dependencies").select("task_id, tasks!task_dependencies_task_id_fkey(title, status)").eq("depends_on", id),
      ]);
      const ids = [...new Set([...t.task_assignees.map((x) => x.user_id), ...(comments ?? []).map((c) => c.author_id)])];
      const { data: profiles } = ids.length ? await ctx.db.from("profiles").select("id, display_name").in("id", ids) : { data: [] };
      const name = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
      return {
        id: t.id,
        titel: t.title,
        projekt: t.projects?.name,
        project_id: t.project_id,
        link: link(ctx, t.project_id),
        status: STATUS[t.status],
        prioritaet: PRIO[t.priority],
        beginn: t.start_date ?? undefined,
        faellig: t.due_date ?? undefined,
        rubrik: t.sections?.name,
        meilenstein: t.milestones?.name,
        wiederholung: t.recurrence ?? undefined,
        verantwortlich: t.task_assignees.map((x) => name.get(x.user_id) ?? "?"),
        beschreibung: t.description || undefined,
        unteraufgabe_von: t.parent_id ?? undefined,
        unteraufgaben: (subs ?? []).map((s) => ({ id: s.id, titel: s.title, erledigt: s.status === "done" })),
        kommentare: (comments ?? []).reverse().map((c) => ({ von: name.get(c.author_id) ?? "?", am: c.created_at.slice(0, 16).replace("T", " "), text: c.body })),
        wartet_auf: (waits ?? []).map((w) => (w.tasks ? `${w.tasks.title} (${STATUS[w.tasks.status]})` : null)).filter(Boolean),
        darauf_warten: (blocks ?? []).map((w) => (w.tasks ? w.tasks.title : null)).filter(Boolean),
        anhaenge: (att ?? []).map((x) => (x.kind === "link" ? { link: x.name, url: x.url } : { datei: x.name, groesse_bytes: x.size })),
      };
    },
  },

  {
    name: "create_tasks",
    title: "Aufgaben anlegen",
    description:
      "Legt eine oder mehrere Aufgaben in einem Projekt an (bis zu 50 auf einmal), auf Wunsch mit Unteraufgaben, Beginn und Fälligkeit, Priorität, Rubrik, Meilenstein und Verantwortlichen. Vorher list_projects aufrufen, um die project_id und die Namen der Mitglieder zu kennen.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "ID des Projekts (aus list_projects)" },
        tasks: {
          type: "array",
          minItems: 1,
          maxItems: 50,
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Kurzer, klarer Titel" },
              ...taskFields,
              subtasks: { type: "array", items: { type: "string" }, description: "Titel von Unteraufgaben (Checkliste)" },
            },
            required: ["title"],
            additionalProperties: false,
          },
        },
      },
      required: ["project_id", "tasks"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    async run(ctx, a) {
      const projectId = uuid(a, "project_id");
      const p = await projectInfo(ctx, projectId);
      if (p.archived_at) throw new ToolError("Das Projekt ist archiviert.");
      await requireRole(ctx, p.workspace_id, "edit");
      if (!Array.isArray(a.tasks) || a.tasks.length === 0) throw new ToolError('"tasks" muss mindestens eine Aufgabe enthalten.');
      if (a.tasks.length > 50) throw new ToolError("Höchstens 50 Aufgaben auf einmal.");
      const members = (await membersOf(ctx, [p.workspace_id])).get(p.workspace_id) ?? [];

      // Erst alles prüfen, dann anlegen – damit nicht die Hälfte angelegt wird
      const secCache = new Map<string, string>();
      const plan = [];
      for (const [i, raw] of (a.tasks as unknown[]).entries()) {
        if (!raw || typeof raw !== "object") throw new ToolError(`Aufgabe ${i + 1} ist ungültig.`);
        const t = raw as Record<string, unknown>;
        const k = (f: string) => `tasks[${i}].${f}`;
        plan.push({
          title: text(t.title, k("title"), 300, true)!,
          description: text(t.description, k("description"), 20000) ?? "",
          due_date: date(t.due_date, k("due_date")) ?? null,
          start_date: date(t.start_date, k("start_date")) ?? null,
          priority: oneOf(t.priority, k("priority"), ["low", "medium", "high"] as const) ?? "medium",
          status: oneOf(t.status, k("status"), ["todo", "doing", "review", "done"] as const) ?? "todo",
          recurrence: t.recurrence === null ? null : (oneOf(t.recurrence, k("recurrence"), RECUR) ?? null),
          sectionName: text(t.section, k("section"), 80),
          milestoneName: text(t.milestone, k("milestone"), 200),
          assignees: resolvePeople(ctx, strList(t.assignees, k("assignees"), 20, 120) ?? [], members),
          subtasks: strList(t.subtasks, k("subtasks"), 50, 300) ?? [],
        });
      }
      for (const t of plan)
        if (t.start_date && t.due_date && t.start_date > t.due_date)
          throw new ToolError(`"${t.title}": Der Beginn (${t.start_date}) liegt nach der Fälligkeit (${t.due_date}).`);
      const msIds = new Map<string, string | null>();
      for (const t of plan)
        if (t.milestoneName !== undefined && !msIds.has(t.milestoneName.toLowerCase()))
          msIds.set(t.milestoneName.toLowerCase(), (await milestoneId(ctx, projectId, t.milestoneName)) ?? null);

      const { data: last } = await ctx.db.from("tasks").select("position").eq("project_id", projectId).order("position", { ascending: false }).limit(1);
      let pos = (last?.[0]?.position ?? 0) + 1;

      const created = [];
      for (const t of plan) {
        const section_id = (await sectionId(ctx, projectId, t.sectionName, secCache)) ?? null;
        const { data: row, error } = await ctx.db
          .from("tasks")
          .insert({
            project_id: projectId,
            title: t.title,
            description: t.description,
            due_date: t.due_date,
            start_date: t.start_date,
            priority: t.priority,
            status: t.status,
            recurrence: t.recurrence,
            section_id,
            milestone_id: t.milestoneName !== undefined ? msIds.get(t.milestoneName.toLowerCase()) ?? null : null,
            position: pos++,
            created_by: ctx.userId,
          })
          .select("id")
          .single();
        dbError(error, `Aufgabe "${t.title}" anlegen`);
        if (t.assignees.length) {
          const { error: e } = await ctx.db.from("task_assignees").insert(t.assignees.map((user_id) => ({ task_id: row!.id, user_id })));
          dbError(e, `Verantwortliche für "${t.title}" eintragen`);
        }
        if (t.subtasks.length) {
          const { error: e } = await ctx.db
            .from("tasks")
            .insert(t.subtasks.map((title, j) => ({ project_id: projectId, parent_id: row!.id, title, position: j + 1, created_by: ctx.userId })));
          dbError(e, `Unteraufgaben für "${t.title}" anlegen`);
        }
        created.push({ id: row!.id, titel: t.title, unteraufgaben: t.subtasks.length || undefined });
      }
      return { ok: true, projekt: p.name, angelegt: created.length, aufgaben: created, link: link(ctx, projectId) };
    },
  },

  {
    name: "update_task",
    title: "Aufgabe ändern",
    description:
      "Ändert eine bestehende Aufgabe: Titel, Beschreibung, Status (z. B. erledigt), Priorität, Fälligkeit, Rubrik, Meilenstein, Verantwortliche oder Wiederholung. Nur die angegebenen Felder werden geändert. Verantwortliche werden durch die neue Liste ersetzt.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "ID der Aufgabe" },
        title: { type: "string" },
        ...taskFields,
      },
      required: ["task_id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async run(ctx, a) {
      const id = uuid(a, "task_id");
      const { data: t, error } = await ctx.db.from("tasks").select("id, title, project_id, task_assignees(user_id)").eq("id", id).maybeSingle();
      dbError(error, "Aufgabe laden");
      if (!t) throw new ToolError("Diese Aufgabe gibt es nicht, oder du hast keinen Zugriff darauf.");
      const p = await projectInfo(ctx, t.project_id);
      await requireRole(ctx, p.workspace_id, "edit");

      const patch: Database["public"]["Tables"]["tasks"]["Update"] = {};
      const title = text(a.title, "title", 300);
      if (title) patch.title = title;
      if (a.description !== undefined) patch.description = text(a.description, "description", 20000) ?? "";
      const due = date(a.due_date, "due_date");
      if (due !== undefined) patch.due_date = due;
      const start = date(a.start_date, "start_date");
      if (start !== undefined) patch.start_date = start;
      const prio = oneOf(a.priority, "priority", ["low", "medium", "high"] as const);
      if (prio) patch.priority = prio;
      const st = oneOf(a.status, "status", ["todo", "doing", "review", "done"] as const);
      if (st) patch.status = st;
      if (a.recurrence !== undefined) patch.recurrence = a.recurrence === null ? null : (oneOf(a.recurrence, "recurrence", RECUR) ?? null);
      if (a.section !== undefined) patch.section_id = (await sectionId(ctx, t.project_id, text(a.section, "section", 80) ?? "", new Map())) ?? null;
      if (a.milestone !== undefined) patch.milestone_id = (await milestoneId(ctx, t.project_id, text(a.milestone, "milestone", 200) ?? "")) ?? null;

      let assignees: string[] | undefined;
      if (a.assignees !== undefined) {
        const members = (await membersOf(ctx, [p.workspace_id])).get(p.workspace_id) ?? [];
        assignees = resolvePeople(ctx, strList(a.assignees, "assignees", 20, 120) ?? [], members);
      }
      if (!Object.keys(patch).length && !assignees) throw new ToolError("Es wurde nichts zum Ändern angegeben.");
      if (patch.start_date !== undefined || patch.due_date !== undefined) {
        const { data: cur } = await ctx.db.from("tasks").select("start_date, due_date").eq("id", id).single();
        const s0 = patch.start_date !== undefined ? patch.start_date : cur?.start_date;
        const d0 = patch.due_date !== undefined ? patch.due_date : cur?.due_date;
        if (s0 && d0 && s0 > d0) throw new ToolError(`Der Beginn (${s0}) liegt nach der Fälligkeit (${d0}).`);
      }

      if (Object.keys(patch).length) {
        const { error: e } = await ctx.db.from("tasks").update(patch).eq("id", id);
        dbError(e, "Aufgabe ändern");
      }
      if (assignees) {
        const before = t.task_assignees.map((x) => x.user_id);
        const remove = before.filter((u) => !assignees!.includes(u));
        const add = assignees.filter((u) => !before.includes(u));
        if (remove.length) {
          const { error: e } = await ctx.db.from("task_assignees").delete().eq("task_id", id).in("user_id", remove);
          dbError(e, "Verantwortliche ändern");
        }
        if (add.length) {
          const { error: e } = await ctx.db.from("task_assignees").insert(add.map((user_id) => ({ task_id: id, user_id })));
          dbError(e, "Verantwortliche ändern");
        }
      }
      return {
        ok: true,
        titel: patch.title ?? t.title,
        geaendert: [...Object.keys(patch).map((f) => f.replace(/_id$/, "")), ...(assignees ? ["assignees"] : [])],
        hinweis: st === "done" ? "Bei wiederkehrenden Aufgaben legt Projektraum die nächste automatisch an." : undefined,
        link: link(ctx, t.project_id),
      };
    },
  },

  {
    name: "add_comment",
    title: "Kommentar schreiben",
    description: "Schreibt einen Kommentar zu einer Aufgabe – im Namen der angemeldeten Person.",
    inputSchema: {
      type: "object",
      properties: { task_id: { type: "string" }, text: { type: "string", description: "Kommentartext" } },
      required: ["task_id", "text"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    async run(ctx, a) {
      const id = uuid(a, "task_id");
      const body = text(a.text, "text", 5000, true)!;
      await requireRole(ctx, await taskWorkspace(ctx, id), "comment");
      const { error } = await ctx.db.from("comments").insert({ task_id: id, body, author_id: ctx.userId });
      dbError(error, "Kommentar speichern");
      return { ok: true };
    },
  },

  {
    name: "add_link",
    title: "Link anhängen",
    description: "Hängt einen Link (z. B. zu einem Dokument in OneDrive oder Google Drive) an eine Aufgabe.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        url: { type: "string", description: "Adresse, beginnt mit https://" },
        name: { type: "string", description: "Kurzer Name für den Link (optional)" },
      },
      required: ["task_id", "url"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    async run(ctx, a) {
      const id = uuid(a, "task_id");
      let url = text(a.url, "url", 2000, true)!;
      if (!/^https?:\/\//i.test(url)) url = "https://" + url;
      let host: string;
      try {
        if (/\s/.test(url)) throw new Error();
        host = new URL(url).hostname;
        if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host)) throw new Error();
      } catch {
        throw new ToolError("Das ist kein gültiger Link.");
      }
      const name = (text(a.name, "name", 200) || host.replace(/^www\./, "")).slice(0, 200);
      await requireRole(ctx, await taskWorkspace(ctx, id), "edit");
      const { error } = await ctx.db.from("task_attachments").insert({ task_id: id, kind: "link", name, url });
      dbError(error, "Link speichern");
      return { ok: true, name };
    },
  },

  {
    name: "create_project",
    title: "Projekt anlegen",
    description: "Legt in einem Bereich ein neues Projekt an. Danach können mit create_tasks Aufgaben hinein.",
    inputSchema: {
      type: "object",
      properties: {
        workspace_id: { type: "string", description: "ID des Bereichs (aus list_projects)" },
        name: { type: "string" },
        description: { type: "string" },
      },
      required: ["workspace_id", "name"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    async run(ctx, a) {
      const ws = uuid(a, "workspace_id");
      await requireRole(ctx, ws, "edit");
      const name = text(a.name, "name", 120, true)!;
      const { data: existing } = await ctx.db.from("projects").select("position, color").eq("workspace_id", ws).is("section_id", null);
      const position = (existing ?? []).reduce((m, p) => Math.max(m, p.position), 0) + 1;
      const color = PROJECT_COLORS[(existing ?? []).length % PROJECT_COLORS.length];
      const { data, error } = await ctx.db
        .from("projects")
        .insert({ workspace_id: ws, name, description: text(a.description, "description", 5000) ?? "", color, position, created_by: ctx.userId })
        .select("id")
        .single();
      dbError(error, "Projekt anlegen");
      return { ok: true, project_id: data!.id, name, link: link(ctx, data!.id) };
    },
  },
];

export const INSTRUCTIONS = `Projektraum ist eine Aufgabenverwaltung (ähnlich Trello/Asana) mit Bereichen, Projekten, Rubriken (Board-Spalten), Meilensteinen und Aufgaben mit Unteraufgaben.
- Rufe zuerst list_projects auf, um IDs, Mitglieder und das heutige Datum zu kennen.
- Wenn nicht klar ist, in welches Projekt etwas gehört, frag nach, statt zu raten.
- Formuliere Aufgabentitel kurz und handlungsorientiert ("Angebot an Firma X schicken"); Details gehören in die Beschreibung.
- Lege Verantwortliche nur fest, wenn die Person es sagt oder es eindeutig ist.
- Löschen ist über diese Schnittstelle nicht möglich – dafür die App verwenden.
- Antworte auf Deutsch, wenn die Person Deutsch schreibt, und nenne am Ende den Link zum Projekt.`;
