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
    <div className="min-h-screen flex flex-wrap items-stretch">
      <nav
        aria-label="Hauptnavigation"
        className="flex-[1_1_260px] bg-white border-r border-[#DDE1E5] px-4 py-5 flex flex-col gap-6"
      >
        <Link href="/" className="flex items-center gap-2.5 px-1 min-h-11">
          <span aria-hidden className="size-8 rounded-lg bg-[#16191D] flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="7" height="16" rx="1.5" />
              <rect x="14" y="4" width="7" height="10" rx="1.5" />
            </svg>
          </span>
          <span className="font-extrabold text-[17px] tracking-tight">Projektraum</span>
        </Link>

        <SidebarProjects workspaces={workspaces} />

        <div className="mt-auto flex flex-col gap-2 border-t border-[#EEF1F4] pt-4">
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
