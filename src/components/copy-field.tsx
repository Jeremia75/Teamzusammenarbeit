"use client";

import { useState } from "react";

/** Text zum Kopieren mit Knopf */
export function CopyField({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <span className="mt-2 flex gap-2">
      <input
        readOnly
        value={value}
        aria-label={label}
        onFocus={(e) => e.currentTarget.select()}
        className="flex-1 min-w-0 h-11 rounded-lg border border-(--c-line) bg-(--c-bg) px-3 font-mono text-[13px] text-(--c-ink)"
      />
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setDone(true);
            setTimeout(() => setDone(false), 2000);
          } catch {}
        }}
        className="h-11 px-4 rounded-lg bg-(--c-ink) text-(--c-on-ink) text-sm font-bold shrink-0"
      >
        {done ? "Kopiert ✓" : "Kopieren"}
      </button>
    </span>
  );
}
