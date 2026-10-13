import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadWorkspaces } from "@/lib/queries";
import { signOut } from "./actions";
import { SidebarProjects } from "@/components/sidebar-projects";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const workspaces = await loadWorkspaces();

  return (
    <div className="min-h-screen flex flex-wrap md:flex-nowrap items-stretch">
      <nav
        aria-label="Hauptnavigation"
        className="flex-[1_1_260px] md:flex-[0_0_260px] bg-white border-r border-[#DDE1E5] px-4 py-5 flex flex-col gap-6 md:sticky md:top-0 md:h-screen md:overflow-y-auto md:overscroll-contain"
      >
        <Link href="/" className="flex items-center gap-2.5 px-1 min-h-11">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" width={32} height={32} className="size-8 rounded-lg" />
          <span className="font-extrabold text-[17px] tracking-tight">Projektraum</span>
        </Link>

        <SidebarProjects workspaces={workspaces} />

        <div className="flex flex-col gap-2 border-t border-[#EEF1F4] pt-4">
          <Link
            href="/hilfe"
            className="flex items-center gap-2.5 min-h-11 px-2 rounded-lg text-sm font-semibold text-[#3E4650] hover:bg-[#F2F4F5] hover:text-[#16191D]"
          >
            <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9.5" />
              <path d="M9.3 9.2a2.8 2.8 0 0 1 5.4 1c0 1.9-2.7 2.4-2.7 4" />
              <circle cx="12" cy="17.6" r="0.6" fill="currentColor" />
            </svg>
            Hilfe
          </Link>
          <span className="text-sm text-[#5A626B] px-1 truncate">{user?.email}</span>
          <form action={signOut}>
            <button type="submit" className="w-full min-h-11 rounded-lg border border-[#DDE1E5] text-sm font-semibold hover:bg-[#F2F4F5]">
              Abmelden
            </button>
          </form>
        </div>
      </nav>

      <main className="flex-[999_1_560px] min-w-0">{children}</main>
    </div>
  );
}
