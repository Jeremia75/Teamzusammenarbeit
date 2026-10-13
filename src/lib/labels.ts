import type { TaskPriority, TaskRecurrence, TaskStatus } from "@/lib/database.types";

export const STATUSES: { id: TaskStatus; label: string; color: string }[] = [
  { id: "todo", label: "Offen", color: "var(--st-todo)" },
  { id: "doing", label: "In Arbeit", color: "var(--st-doing)" },
  { id: "review", label: "Zur Prüfung", color: "var(--st-review)" },
  { id: "done", label: "Erledigt", color: "var(--st-done)" },
];

export const PRIORITIES: { id: TaskPriority; label: string; bg: string; fg: string }[] = [
  { id: "high", label: "Hoch", bg: "var(--prio-high-bg)", fg: "var(--prio-high-fg)" },
  { id: "medium", label: "Mittel", bg: "var(--prio-mid-bg)", fg: "var(--prio-mid-fg)" },
  { id: "low", label: "Niedrig", bg: "var(--prio-low-bg)", fg: "var(--prio-low-fg)" },
];

export const RECURRENCES: { id: TaskRecurrence; label: string }[] = [
  { id: "daily", label: "Täglich" },
  { id: "weekly", label: "Wöchentlich" },
  { id: "biweekly", label: "Alle 2 Wochen" },
  { id: "monthly", label: "Monatlich" },
  { id: "yearly", label: "Jährlich" },
];

export function recurrenceLabel(id: TaskRecurrence | null) {
  return RECURRENCES.find((r) => r.id === id)?.label ?? "";
}

/** Helle Hintergrundtönung je Status für Karten in der Rubriken-Ansicht */
export const STATUS_TINT: Record<TaskStatus, string> = {
  todo: "var(--tint-todo)",
  doing: "var(--tint-doing)",
  review: "var(--tint-review)",
  done: "var(--tint-done)",
};

export const PROJECT_COLORS = ["#1F5FBF", "#0E7C66", "#6B4FB3", "#B4561C", "#8A6A12", "#B0336B"];

export function statusOf(id: TaskStatus) {
  return STATUSES.find((s) => s.id === id)!;
}

export function priorityOf(id: TaskPriority) {
  return PRIORITIES.find((p) => p.id === id)!;
}

/** "2026-10-18" → "18. Okt." */
export function formatDate(d: string | null) {
  if (!d) return "";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("de-AT", { day: "numeric", month: "short" });
}

export function isOverdue(d: string | null, status: TaskStatus) {
  if (!d || status === "done") return false;
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return d < iso;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
