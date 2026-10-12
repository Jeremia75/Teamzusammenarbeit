import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md flex flex-col gap-4">
        <h1 className="text-2xl font-extrabold tracking-tight">Seite nicht gefunden</h1>
        <p className="text-[#3E4650]">Diese Adresse gibt es in Projektraum nicht.</p>
        <Link href="/" className="self-start min-h-11 px-5 rounded-lg bg-[#16191D] text-white font-bold flex items-center">
          Zur Übersicht
        </Link>
      </div>
    </main>
  );
}
