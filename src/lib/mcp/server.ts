// Minimaler MCP-Server (Model Context Protocol, "Streamable HTTP", zustandslos).
// Jede Anfrage bringt den Zugangsschlüssel der Person mit (OAuth über Supabase Auth).

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { INSTRUCTIONS, TOOLS, ToolError, type Ctx } from "@/lib/mcp/tools";

const VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

type RpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };
type RpcResponse = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string } };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
};

export const supabaseAuthServer = () => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`;
export const resourceUrl = (origin: string) => `${origin}/api/mcp`;
export const metadataUrl = (origin: string) => `${origin}/.well-known/oauth-protected-resource/api/mcp`;

export function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS, ...extra } });
}

export const preflight = () => new Response(null, { status: 204, headers: CORS });

function unauthorized(origin: string, invalid: boolean) {
  const challenge = `Bearer resource_metadata="${metadataUrl(origin)}"` + (invalid ? `, error="invalid_token", error_description="Anmeldung abgelaufen oder ungültig"` : "");
  return json({ error: invalid ? "invalid_token" : "unauthorized", error_description: "Bitte mit Projektraum anmelden." }, 401, {
    "WWW-Authenticate": challenge,
  });
}

/** Zugangsschlüssel prüfen und einen Datenbank-Zugang mit den Rechten der Person bauen */
async function authenticate(req: Request): Promise<Omit<Ctx, "appUrl"> | null> {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  if (!m) return null;
  const token = m[1];
  const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  return { db, userId: data.user.id };
}

async function handle(ctx: Ctx, r: RpcRequest): Promise<RpcResponse | null> {
  const id = r.id ?? null;
  const ok = (result: unknown): RpcResponse => ({ jsonrpc: "2.0", id, result });
  const fail = (code: number, message: string): RpcResponse => ({ jsonrpc: "2.0", id, error: { code, message } });
  if (r.id === undefined) return null; // Benachrichtigung – keine Antwort

  switch (r.method) {
    case "initialize": {
      const wanted = String(r.params?.protocolVersion ?? "");
      return ok({
        protocolVersion: VERSIONS.includes(wanted) ? wanted : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "projektraum", title: "Projektraum", version: "1.0.0" },
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({
        tools: TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations: { title, ...annotations } })),
      });
    case "tools/call": {
      const name = String(r.params?.name ?? "");
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return fail(-32602, `Unbekanntes Werkzeug: ${name}`);
      const args = r.params?.arguments;
      if (args !== undefined && (typeof args !== "object" || args === null || Array.isArray(args))) return fail(-32602, "arguments muss ein Objekt sein");
      try {
        const result = await tool.run(ctx, (args as Record<string, unknown>) ?? {});
        return ok({ content: [{ type: "text", text: JSON.stringify(result, null, 1) }], structuredContent: result, isError: false });
      } catch (e) {
        const msg = e instanceof ToolError ? e.message : "Unerwarteter Fehler in Projektraum. Bitte später nochmal versuchen.";
        if (!(e instanceof ToolError)) console.error("MCP-Werkzeug", name, e);
        return ok({ content: [{ type: "text", text: msg }], isError: true });
      }
    }
    default:
      return fail(-32601, `Unbekannte Methode: ${r.method}`);
  }
}

export async function mcpPost(req: Request) {
  const origin = new URL(req.url).origin;
  const auth = await authenticate(req);
  if (!auth) return unauthorized(origin, !!req.headers.get("authorization"));

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Ungültiges JSON" } }, 400);
  }
  const list = Array.isArray(body) ? body : [body];
  if (!list.length || list.some((x) => !x || typeof x !== "object" || (x as RpcRequest).jsonrpc !== "2.0" || typeof (x as RpcRequest).method !== "string")) {
    // Antworten des Clients (ohne method) brauchen wir nicht
    if (list.every((x) => x && typeof x === "object" && "jsonrpc" in x && !("method" in x))) return new Response(null, { status: 202, headers: CORS });
    return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Ungültige Anfrage" } }, 400);
  }
  if (list.length > 20) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Zu viele Anfragen auf einmal" } }, 400);

  const ctx: Ctx = { ...auth, appUrl: origin };
  const out = (await Promise.all(list.map((r) => handle(ctx, r as RpcRequest)))).filter((x): x is RpcResponse => !!x);
  if (!out.length) return new Response(null, { status: 202, headers: CORS });
  return json(Array.isArray(body) ? out : out[0]);
}

/** Ohne Sitzungen gibt es keinen Ereignis-Strom */
export const mcpNotAllowed = () => json({ error: "Nur POST wird unterstützt" }, 405, { Allow: "POST, OPTIONS" });
