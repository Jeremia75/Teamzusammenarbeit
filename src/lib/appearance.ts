// Eigene Darstellung: aus 12 Grundfarben und ein paar Formeinstellungen werden
// alle Farb-Tokens der App abgeleitet. Läuft auf dem Server (erstes Zeichnen)
// und im Browser (Live-Vorschau beim Einstellen).

export type ColorKey = "bg" | "side" | "col" | "surf" | "text" | "muted" | "line" | "acc" | "todo" | "doing" | "review" | "done";

export type Appearance = {
  colors: Record<ColorKey, string>;
  radius: number; // 0–22 px, Ecken der Karten
  border: "fein" | "keiner" | "dick";
  font: "sans" | "rund" | "serif";
  density: "kompakt" | "normal" | "luftig";
  tilt: boolean; // Karten leicht schief wie auf einer Pinnwand
  dim: number; // 0–90 %, wie stark das Hintergrundbild abgeschwächt wird
};

export const COLOR_FIELDS: { key: ColorKey; label: string; hint: string }[] = [
  { key: "bg", label: "Seitenhintergrund", hint: "Fläche hinter allem" },
  { key: "side", label: "Seitenleiste", hint: "Leiste links" },
  { key: "col", label: "Spalten", hint: "Hintergrund der Rubriken" },
  { key: "surf", label: "Karten", hint: "Aufgaben, Projekte, Fenster" },
  { key: "text", label: "Schrift", hint: "Haupttext" },
  { key: "muted", label: "Schrift leise", hint: "Nebeninfos, Datum" },
  { key: "line", label: "Linien", hint: "Rahmen und Trennlinien" },
  { key: "acc", label: "Akzentfarbe", hint: "Links, Auswahl, Reiter" },
  { key: "todo", label: "Offen", hint: "Status-Farbe" },
  { key: "doing", label: "In Arbeit", hint: "Status-Farbe" },
  { key: "review", label: "Zur Prüfung", hint: "Status-Farbe" },
  { key: "done", label: "Erledigt", hint: "Status-Farbe" },
];

const base = { radius: 12, border: "fein", font: "sans", density: "normal", tilt: false, dim: 35 } as const;

export const PRESETS: { id: string; label: string; value: Appearance }[] = [
  {
    id: "hell",
    label: "Hell",
    value: { ...base, colors: { bg: "#F2F4F5", side: "#FFFFFF", col: "#E8EBEE", surf: "#FFFFFF", text: "#16191D", muted: "#5A626B", line: "#DDE1E5", acc: "#1F5FBF", todo: "#8A94A0", doing: "#1F5FBF", review: "#B4561C", done: "#0E7C66" } },
  },
  {
    id: "dunkel",
    label: "Dunkel",
    value: { ...base, colors: { bg: "#0F1216", side: "#181C21", col: "#13171B", surf: "#181C21", text: "#E8EBEE", muted: "#969FA9", line: "#2C333A", acc: "#6FA3F5", todo: "#7D8792", doing: "#4C8DF0", review: "#E0884A", done: "#2DB592" } },
  },
  {
    id: "modern",
    label: "Modern",
    value: { ...base, radius: 16, density: "luftig", colors: { bg: "#FAFAFB", side: "#FFFFFF", col: "#F3F2F8", surf: "#FFFFFF", text: "#1C1A29", muted: "#6B6880", line: "#E9E8F0", acc: "#6D5BD0", todo: "#A3A1B5", doing: "#6D5BD0", review: "#C2701F", done: "#2E9E7E" } },
  },
  {
    id: "jung",
    label: "Jung",
    value: { ...base, radius: 18, border: "dick", font: "rund", colors: { bg: "#FFF8EE", side: "#2B2D6E", col: "#FFEFD9", surf: "#FFFFFF", text: "#2B2D6E", muted: "#5B5D95", line: "#2B2D6E", acc: "#D6336C", todo: "#9A9CC9", doing: "#3D8BFF", review: "#FF9F1C", done: "#16A88A" } },
  },
  {
    id: "oldschool",
    label: "Oldschool",
    value: { ...base, radius: 2, font: "serif", tilt: true, colors: { bg: "#EFE6D2", side: "#3B3227", col: "#E6DAC0", surf: "#FFFDF6", text: "#3B3227", muted: "#5F523E", line: "#CDBE9E", acc: "#B23A2B", todo: "#9C8F78", doing: "#3E6A8A", review: "#B5651D", done: "#5B7F3A" } },
  },
  {
    id: "bild",
    label: "Mit Bild",
    value: { ...base, border: "keiner", dim: 30, colors: { bg: "#F2F4F5", side: "#FFFFFF", col: "#FFFFFF", surf: "#FFFFFF", text: "#16191D", muted: "#4E5660", line: "#DDE1E5", acc: "#1F5FBF", todo: "#8A94A0", doing: "#1F5FBF", review: "#B4561C", done: "#0E7C66" } },
  },
];

// ------------------------------------------------------------- Farbrechnen
const HEX = /^#[0-9a-fA-F]{6}$/;
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c: number[]) => "#" + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");

/** p = Anteil von a (0–1) */
export function mix(a: string, b: string, p: number): string {
  const A = rgb(a);
  const B = rgb(b);
  return toHex(A.map((v, i) => v * p + B[i] * (1 - p)));
}

export function luminance(h: string): number {
  const [r, g, b] = rgb(h).map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Gut lesbare Schriftfarbe auf einer Fläche */
export function readableOn(bg: string): string {
  return contrast("#FFFFFF", bg) >= contrast("#16191D", bg) ? "#FFFFFF" : "#16191D";
}

/** Mischt fg schrittweise Richtung toward, bis der Kontrast zu bg reicht */
export function ensureContrast(fg: string, bg: string, toward: string, min = 4.6): string {
  for (let p = 1; p >= 0; p -= 0.05) {
    const c = mix(fg, toward, p);
    if (contrast(c, bg) >= min) return c;
  }
  return toward;
}

export const isDarkDesign = (a: Appearance) => luminance(a.colors.surf) < 0.2;

/** Ungültige oder fehlende Werte durch Standard ersetzen – Daten aus der Datenbank sind nicht vertrauenswürdig */
export function sanitize(raw: unknown): Appearance | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<Appearance> & { colors?: Record<string, unknown> };
  const d = PRESETS[0].value;
  const colors = { ...d.colors };
  for (const f of COLOR_FIELDS) {
    const v = r.colors?.[f.key];
    if (typeof v === "string" && HEX.test(v)) colors[f.key] = v.toUpperCase();
  }
  const num = (v: unknown, lo: number, hi: number, def: number) => (typeof v === "number" && v >= lo && v <= hi ? Math.round(v) : def);
  return {
    colors,
    radius: num(r.radius, 0, 22, d.radius),
    border: r.border === "keiner" || r.border === "dick" ? r.border : "fein",
    font: r.font === "rund" || r.font === "serif" ? r.font : "sans",
    density: r.density === "kompakt" || r.density === "luftig" ? r.density : "normal",
    tilt: r.tilt === true,
    dim: num(r.dim, 0, 90, d.dim),
  };
}

// ------------------------------------------------------------- Tokens
const FIXED = {
  light: {
    "--c-danger": "#9A3412", "--c-on-danger": "#FFFFFF", "--c-danger-soft": "#FDE8E1",
    "--c-success": "#0E7C66", "--c-success-ink": "#0B5E4E", "--c-success-soft": "#DDF2EC",
    "--prio-high-bg": "#FDE8E1", "--prio-high-fg": "#9A3412", "--prio-mid-bg": "#FEF3C7", "--prio-mid-fg": "#854D0E",
  },
  dark: {
    "--c-danger": "#F0937A", "--c-on-danger": "#1A0D08", "--c-danger-soft": "#3A1F18",
    "--c-success": "#2FB894", "--c-success-ink": "#6ED6BC", "--c-success-soft": "#11302A",
    "--prio-high-bg": "#3A1F18", "--prio-high-fg": "#F4A88F", "--prio-mid-bg": "#352B10", "--prio-mid-fg": "#F0CF7A",
  },
};

/** Alle Tokens für den Hauptbereich der App */
export function appTokens(a: Appearance, hasImage = false): Record<string, string> {
  const c = a.colors;
  const dark = isDarkDesign(a);
  const tint = (col: string) => mix(col, c.surf, dark ? 0.16 : 0.08);
  const accentInk = mix(c.acc, c.text, 0.6);
  const tok: Record<string, string> = {
    ...(dark ? FIXED.dark : FIXED.light),
    "--c-bg": c.bg,
    "--c-surface": c.surf,
    "--c-ink": c.text,
    "--c-on-ink": readableOn(c.text),
    "--c-ink-2": mix(c.text, c.surf, 0.9),
    "--c-text-2": ensureContrast(mix(c.text, c.muted, 0.45), c.col, c.text),
    "--c-muted": c.muted,
    "--c-line": c.line,
    "--c-line-soft": mix(c.line, c.surf, 0.5),
    "--c-line-strong": mix(c.line, c.text, 0.82),
    "--c-line-hover": mix(c.line, c.text, 0.5),
    "--c-hover": mix(c.text, c.surf, dark ? 0.06 : 0.035),
    "--c-col": c.col,
    "--c-col-2": mix(c.text, c.col, 0.03),
    "--c-col-drop": mix(c.acc, c.col, 0.14),
    "--c-col-hover": mix(c.text, c.col, 0.04),
    "--c-col-btn-hover": mix(c.text, c.col, 0.08),
    "--c-track": mix(c.text, c.col, 0.12),
    // Akzent wird auch als Linkfarbe genutzt: bei Bedarf so weit nachdunkeln/aufhellen, dass er lesbar bleibt
    "--c-accent": ensureContrast(ensureContrast(c.acc, c.surf, c.text), c.bg, c.text),
    "--c-accent-soft": mix(c.acc, c.surf, dark ? 0.16 : 0.1),
    "--c-accent-soft-2": mix(c.acc, c.surf, dark ? 0.26 : 0.18),
    "--c-accent-line": mix(c.acc, c.surf, dark ? 0.38 : 0.3),
    "--c-accent-line-2": mix(c.acc, c.surf, dark ? 0.48 : 0.4),
    "--c-accent-ink": ensureContrast(accentInk, mix(c.acc, c.surf, dark ? 0.16 : 0.1), c.text),
    "--prio-low-bg": mix(c.acc, c.surf, dark ? 0.18 : 0.1),
    "--prio-low-fg": accentInk,
    "--c-review": c.review,
    "--c-todo": c.todo,
    "--c-tint-review": tint(c.review),
    "--c-tint-done": tint(c.done),
    "--tint-todo": c.surf,
    "--tint-doing": tint(c.doing),
    "--tint-review": tint(c.review),
    "--tint-done": tint(c.done),
    "--st-todo": c.todo,
    "--st-doing": c.doing,
    "--st-review": c.review,
    "--st-done": c.done,
    "--st-todo-ink": ensureContrast(c.todo, c.surf, c.text),
    "--st-doing-ink": ensureContrast(c.doing, tint(c.doing), c.text),
    "--st-review-ink": ensureContrast(c.review, tint(c.review), c.text),
    "--st-done-ink": ensureContrast(c.done, tint(c.done), c.text),
    // Form: Tailwind-Radien und -Abstände umstellen
    "--radius-md": `${Math.round(a.radius * 0.5)}px`,
    "--radius-lg": `${Math.round(a.radius * 0.7)}px`,
    "--radius-xl": `${a.radius}px`,
    "--radius-2xl": `${Math.round(a.radius * 1.35)}px`,
    "--spacing": { kompakt: "0.215rem", normal: "0.25rem", luftig: "0.28rem" }[a.density],
    "--app-font": { sans: '"Segoe UI Variable", "Segoe UI", system-ui, sans-serif', rund: 'Nunito, "Segoe UI", system-ui, sans-serif', serif: 'Georgia, "Times New Roman", serif' }[a.font],
  };
  if (hasImage) {
    // Durchscheinende Flächen, damit das Bild zu sehen ist
    tok["--c-col"] = `color-mix(in srgb, ${c.col} 80%, transparent)`;
    tok["--c-col-drop"] = `color-mix(in srgb, ${mix(c.acc, c.col, 0.14)} 85%, transparent)`;
  }
  return tok;
}

/** Tokens für die Seitenleiste – eigene Farbe, Schrift passt sich an */
export function sideTokens(a: Appearance, hasImage = false): Record<string, string> {
  const s = a.colors.side;
  const ink = luminance(s) > 0.4 ? (contrast(a.colors.text, s) >= 7 ? a.colors.text : "#16191D") : contrast(a.colors.text, s) >= 7 ? a.colors.text : "#F2F4F5";
  const acc = ensureContrast(a.colors.acc, s, ink);
  return {
    "--c-surface": hasImage ? `color-mix(in srgb, ${s} 88%, transparent)` : s,
    "--c-ink": ink,
    "--c-on-ink": s,
    "--c-ink-2": mix(ink, s, 0.9),
    "--c-text-2": ensureContrast(mix(ink, s, 0.82), s, ink),
    "--c-muted": ensureContrast(mix(ink, s, 0.68), s, ink),
    "--c-line": mix(ink, s, 0.16),
    "--c-line-soft": mix(ink, s, 0.1),
    "--c-line-strong": mix(ink, s, 0.25),
    "--c-line-hover": mix(ink, s, 0.4),
    "--c-hover": mix(ink, s, 0.08),
    "--c-bg": mix(ink, s, 0.06),
    "--c-accent": acc,
    "--c-accent-soft": mix(acc, s, 0.16),
  };
}

const css = (sel: string, tok: Record<string, string>) => `${sel}{${Object.entries(tok).map(([k, v]) => `${k}:${v}`).join(";")}}`;

/** Fertiges CSS für eine eigene Darstellung */
export function appearanceCss(a: Appearance, imageUrl: string | null): string {
  const hasImage = !!imageUrl;
  const dark = isDarkDesign(a);
  const [r, g, b] = rgb(a.colors.bg);
  const veil = `rgba(${r},${g},${b},${a.dim / 100})`;
  const bgRule = hasImage
    ? `background:linear-gradient(${veil},${veil}),url("${imageUrl!.replace(/["\\]/g, "")}") center/cover fixed no-repeat;`
    : `background:${a.colors.bg};`;
  return [
    css(".pr-scope", appTokens(a, hasImage)),
    `.pr-scope{${bgRule}color:var(--c-ink);font-family:var(--app-font);color-scheme:${dark ? "dark" : "light"}}`,
    css(".pr-scope .pr-side", sideTokens(a, hasImage)),
    `.pr-scope .pr-side{color:var(--c-ink)}`,
  ].join("\n");
}
