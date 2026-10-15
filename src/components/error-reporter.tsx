"use client";

// Meldet Fehler im Browser an Projektraum (Tabelle app_errors). Gleiche Fehler zählt die Datenbank zusammen;
// hier wird zusätzlich gebremst, damit eine Fehlerschleife nicht hunderte Meldungen schickt.

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

const IGNORE = [/ResizeObserver loop/i, /chrome-extension:|moz-extension:|safari-extension:/i, /Script error\.?$/i, /Load failed|Failed to fetch|NetworkError/i, /AbortError/i];

export function reportError(message: string, detail = "") {
  if (typeof window === "undefined" || IGNORE.some((r) => r.test(message) || r.test(detail))) return;
  const w = window as unknown as { __prSent?: number };
  w.__prSent = (w.__prSent ?? 0) + 1;
  if (w.__prSent > 10) return; // höchstens 10 Meldungen pro Seitenaufruf
  createClient()
    .rpc("report_error", { src: "browser", msg: message.slice(0, 1000), detail: detail.slice(0, 4000), page: location.pathname + location.search, agent: navigator.userAgent })
    .then(() => {});
}

export function ErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => reportError((e.message || String(e.error)).replace(/^Uncaught (Error: )?/, ""), (e.error as Error | undefined)?.stack ?? `${e.filename}:${e.lineno}`);
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason as Error | undefined;
      reportError(r?.message ?? String(e.reason), r?.stack ?? "");
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
