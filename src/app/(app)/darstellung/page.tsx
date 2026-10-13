import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppearanceEditor } from "@/components/appearance-editor";

export const metadata = { title: "Darstellung · Projektraum" };

export default async function AppearancePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="px-4 sm:px-7 pt-6 flex flex-col gap-5 max-w-4xl">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold tracking-tight">Darstellung</h1>
        <p className="text-(--c-text-2)">
          Stell Projektraum so ein, wie es dir gefällt. Die Einstellungen gelten nur für dich, auf allen deinen Geräten. Mehr dazu in der{" "}
          <Link href="/hilfe#darstellung" className="font-semibold text-(--c-accent) underline underline-offset-4">
            Hilfe
          </Link>
          .
        </p>
      </header>
      <AppearanceEditor userId={user.id} />
    </div>
  );
}
