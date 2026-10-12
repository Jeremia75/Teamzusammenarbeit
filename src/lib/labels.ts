import type { TaskPriority, TaskStatus } from "@/lib/database.types";

export const STATUSES: { id: TaskStatus; label: string; color: string }[] = [
  { id: "todo", label: "Offen", color: "#8A94A0" },
  { id: "doing", label: "In Arbeit", color: "#1F5FBF" },
  { id: "review", label: "Zur Prüfung", color: "#B4561C" },
  { id: "done", label: "Erledigt", color: "#0E7C66" },
];

export const PRIORITIES: { id: TaskPriority; label: string; bg: string; fg: string }[] = [
  { id: "high", label: "Hoch", bg: "#FDE8E1", fg: "#9A3412" },
  { id: "medium", label: "Mittel", bg: "#FEF3C7", fg: "#854D0E" },
  { id: "low", label: "Niedrig", bg: "#E6EEF7", fg: "#1E4F8A" },
];

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
