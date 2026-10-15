import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NotificationForm } from "@/components/notification-form";
import { CalendarSubscribe } from "@/components/calendar-subscribe";

export const metadata = { title: "Benachrichtigungen · Projektraum" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: settings } = await supabase.from("notification_settings").select("*").eq("user_id", user.id).maybeSingle();

  return (
    <div className="px-4 sm:px-7 py-6 flex flex-col gap-6 max-w-2xl">
      <header data-panel className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold tracking-tight">Benachrichtigungen</h1>
        <p className="text-(--c-text-2)">
          Lege fest, ob und wann Projektraum dir E-Mails zu deinen Aufgaben schickt, und hol dir deine Termine in den Kalender. Mehr dazu in der{" "}
          <Link href="/hilfe#benachrichtigungen" className="font-semibold text-(--c-accent) underline underline-offset-4">
            Hilfe
          </Link>
          .
        </p>
      </header>
      <section aria-label="E-Mail-Einstellungen" className="bg-(--c-surface) border border-(--c-line) rounded-xl p-5 sm:p-6">
        <NotificationForm
          userId={user.id}
          email={user.email ?? ""}
          initial={settings?.asked_at ? settings : null}
        />
      </section>
      <div id="kalender">
        <CalendarSubscribe />
      </div>
    </div>
  );
}
