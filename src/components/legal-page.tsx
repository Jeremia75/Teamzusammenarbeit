import Link from "next/link";
import { missing } from "@/lib/legal";

/** Rahmen für Impressum und Datenschutz – öffentlich, ohne Seitenleiste */
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-(--c-bg) px-4 py-8">
      <article className="legal mx-auto max-w-2xl bg-(--c-surface) border border-(--c-line) rounded-2xl p-6 sm:p-8 flex flex-col gap-4 text-[15px] leading-relaxed text-(--c-text-2)">
        <Link href="/" className="self-start text-sm font-semibold text-(--c-muted) hover:text-(--c-ink) hover:underline underline-offset-4">
          ← Projektraum
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight text-(--c-ink)">{title}</h1>
        {children}
        <p className="pt-4 border-t border-(--c-line-soft) text-sm">
          <Link href="/impressum" className="underline underline-offset-2">Impressum</Link>
          {" · "}
          <Link href="/datenschutz" className="underline underline-offset-2">Datenschutzerklärung</Link>
        </p>
      </article>
    </main>
  );
}

export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-extrabold text-(--c-ink) pt-2">{children}</h2>;
}

/** Ein Wert aus LEGAL – noch nicht ausgefüllte Angaben gelb markiert */
export function V({ v }: { v: string }) {
  return missing(v) ? <mark className="rounded px-1 bg-yellow-200 text-black">{v}</mark> : <>{v}</>;
}
