import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 flex flex-col gap-4">
      <h1 className="text-2xl font-extrabold tracking-tight">Nicht gefunden</h1>
      <p className="text-[#3E4650]">
        Dieses Projekt gibt es nicht, oder du hast keinen Zugriff darauf. Falls es ein Projekt deines Teams ist, bitte
        einen Admin, dich zum passenden Bereich hinzuzufügen.
      </p>
      <Link href="/" className="self-start min-h-11 px-5 rounded-lg bg-[#16191D] text-white font-bold flex items-center">
        Zur Übersicht
      </Link>
    </div>
  );
}
