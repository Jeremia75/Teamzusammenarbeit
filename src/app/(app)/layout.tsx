import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadWorkspaces } from "@/lib/queries";
import { signOut } from "./actions";
import { SidebarProjects } from "@/components/sidebar-projects";
import { NotificationPrompt } from "@/components/notification-prompt";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/notification-bell";
import { SearchButton } from "@/components/search";
import { AppearanceProvider, type BgImage } from "@/components/appearance-provider";
import { sanitize } from "@/lib/appearance";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const todayIso = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Vienna" }).format(new Date());
  const [workspaces, { data: notify }, { data: look }, { count: dueCount }] = await Promise.all([
    loadWorkspaces(),
    supabase.from("notification_settings").select("asked_at").eq("user_id", user?.id ?? "").maybeSingle(),
    supabase.from("appearance_settings").select("settings, image_path").eq("user_id", user?.id ?? "").maybeSingle(),
    // Für "Meine Woche": eigene offene Aufgaben, die heute oder früher fällig sind
    supabase
      .from("tasks")
      .select("id, task_assignees!inner(user_id)", { count: "exact", head: true })
      .eq("task_assignees.user_id", user?.id ?? "")
      .neq("status", "done")
      .lte("due_date", todayIso),
  ]);

  // Eigenes Hintergrundbild: privat gespeichert, Link gilt eine Woche
  let image: BgImage | null = null;
  if (look?.image_path) {
    const { data } = await supabase.storage.from("hintergruende").createSignedUrl(look.image_path, 60 * 60 * 24 * 7);
    if (data?.signedUrl) image = { path: look.image_path, url: data.signedUrl };
  }

  return (
    <AppearanceProvider initial={sanitize(look?.settings)} initialImage={image}>
    <div className="min-h-screen flex flex-wrap md:flex-nowrap items-stretch">
      <nav
        aria-label="Hauptnavigation"
        className="pr-side flex-[1_1_260px] md:flex-[0_0_260px] bg-(--c-surface) border-r border-(--c-line) px-4 py-5 flex flex-col gap-6 md:sticky md:top-0 md:h-screen md:overflow-y-auto md:overscroll-contain"
      >
        <Link href="/" className="flex items-center gap-2.5 px-1 min-h-11">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" width={32} height={32} className="size-8 rounded-lg ring-1 ring-(--c-line)" />
          <span className="font-extrabold text-[17px] tracking-tight">Projektraum</span>
        </Link>

        <div className="flex flex-col gap-1 -mt-2">
          <SearchButton />
          <Link
            href="/woche"
            className="flex items-center gap-2.5 min-h-11 px-2 rounded-lg text-sm font-bold text-(--c-ink) hover:bg-(--c-bg)"
          >
            <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
              <path d="M3.5 10h17M8 3v4M16 3v4M8.5 15l2 2 4-4" />
            </svg>
            <span className="flex-1">Meine Woche</span>
            {!!dueCount && (
              <span className="min-w-6 h-6 px-1.5 rounded-full bg-(--c-danger) text-(--c-on-danger) text-xs font-bold flex items-center justify-center" title="Heute oder früher fällig">
                {dueCount}
                <span className="sr-only"> heute oder früher fällig</span>
              </span>
            )}
          </Link>
          <NotificationBell userId={user?.id ?? ""} />
        </div>

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
            E-Mail &amp; Kalender
          </Link>
          <Link
            href="/papierkorb"
            className="flex items-center gap-2.5 min-h-11 px-2 rounded-lg text-sm font-semibold text-(--c-text-2) hover:bg-(--c-bg) hover:text-(--c-ink)"
          >
            <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2l1-12M9 7V4.5h6V7" />
            </svg>
            Papierkorb
          </Link>
          <Link
            href="/ki"
            className="flex items-center gap-2.5 min-h-11 px-2 rounded-lg text-sm font-semibold text-(--c-text-2) hover:bg-(--c-bg) hover:text-(--c-ink)"
          >
            <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3.5l1.8 4.7 4.7 1.8-4.7 1.8L12 16.5l-1.8-4.7L5.5 10l4.7-1.8z" />
              <path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
            </svg>
            KI-Assistent
          </Link>
          <Link
            href="/darstellung"
            className="flex items-center gap-2.5 min-h-11 px-2 rounded-lg text-sm font-semibold text-(--c-text-2) hover:bg-(--c-bg) hover:text-(--c-ink)"
          >
            <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 21a9 9 0 1 1 9-9c0 2.5-2 3.5-4 3.5h-1.6a1.6 1.6 0 0 0-1.1 2.8c.6.6.4 2.7-2.3 2.7Z" />
              <circle cx="7.5" cy="11" r="1" fill="currentColor" />
              <circle cx="11" cy="7" r="1" fill="currentColor" />
              <circle cx="16" cy="8.5" r="1" fill="currentColor" />
            </svg>
            Darstellung
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
    </AppearanceProvider>
  );
}
