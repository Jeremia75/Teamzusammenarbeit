import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadWorkspaces } from "@/lib/queries";
import { signOut } from "./actions";
import { SidebarProjects } from "@/components/sidebar-projects";
import { NotificationPrompt } from "@/components/notification-prompt";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [workspaces, { data: notify }] = await Promise.all([
    loadWorkspaces(),
    supabase.from("notification_settings").select("asked_at").eq("user_id", user?.id ?? "").maybeSingle(),
  ]);

  return (
    <div className="min-h-screen flex flex-wrap md:flex-nowrap items-stretch">
      <nav
        aria-label="Hauptnavigation"
        className="flex-[1_1_260px] md:flex-[0_0_260px] bg-(--c-surface) border-r border-(--c-line) px-4 py-5 flex flex-col gap-6 md:sticky md:top-0 md:h-screen md:overflow-y-auto md:overscroll-contain"
      >
        <Link href="/" className="flex items-center gap-2.5 px-1 min-h-11">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" width={32} height={32} className="size-8 rounded-lg ring-1 ring-(--c-line)" />
          <span className="font-extrabold text-[17px] tracking-tight">Projektraum</span>
        </Link>

        <SidebarProjects workspaces={workspaces} />

        <div className="flex flex-col gap-2 border-t border-(--c-line-soft) pt-4">
          <Link
            href="/hilfe"
            className="flex items-center gap-2.5 min-h-11 px-2 rounded-lg text-sm font-semibold text-(--c-text-2) hover:bg-(--c-bg) hover:text-(--c-ink)"
          >
            <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9.5" />
              <path d="M9.3 9.2a2.8 2.8 0 0 1 5.4 1c0 1.9-2.7 2.4-2.7 4" />
              <circle cx="12" cy="17.6" r="0.6" fill="currentColor" />
            </svg>
            Hilfe
          </Link>
          <Link
            href="/einstellungen"
            className="flex items-center gap-2.5 min-h-11 px-2 rounded-lg text-sm font-semibold text-(--c-text-2) hover:bg-(--c-bg) hover:text-(--c-ink)"
          >
            <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9" />
              <path d="M10.3 20a1.9 1.9 0 0 0 3.4 0" />
            </svg>
            Benachrichtigungen
          </Link>
          <ThemeToggle />
          <span className="text-sm text-(--c-muted) px-1 truncate">{user?.email}</span>
          <form action={signOut}>
            <button type="submit" className="w-full min-h-11 rounded-lg border border-(--c-line) text-sm font-semibold hover:bg-(--c-bg)">
              Abmelden
            </button>
          </form>
        </div>
      </nav>

      <main className="flex-[999_1_560px] min-w-0">{children}</main>
      {user && <NotificationPrompt userId={user.id} email={user.email ?? ""} needed={!notify?.asked_at} />}
    </div>
  );
}
