"use client";

// Wird angezeigt, wenn auf einer Seite etwas schiefgeht. Der Fehler wird automatisch gemeldet.

import Link from "next/link";
import { useEffect } from "react";
import { reportError } from "@/components/error-reporter";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportError(error.message || "Seitenfehler", (error.stack ?? "") + (error.digest ? `\nDigest: ${error.digest}` : ""));
  }, [error]);
  return (
    <div className="mx-auto max-w-xl px-4 py-16 flex flex-col gap-4">
      <h1 className="text-2xl font-extrabold">Da ist etwas schiefgegangen</h1>
      <p className="text-(--c-text-2)">Der Fehler wurde automatisch gemeldet. Versuch es noch einmal – meistens hilft das schon.</p>
      <div className="flex gap-3">
        <button type="button" onClick={reset} className="h-11 px-5 rounded-lg bg-(--c-ink) text-(--c-on-ink) font-bold">
          Nochmal versuchen
        </button>
        <Link href="/" className="h-11 px-4 rounded-lg border border-(--c-line) font-semibold inline-flex items-center">
          Zur Übersicht
        </Link>
      </div>
    </div>
  );
}
