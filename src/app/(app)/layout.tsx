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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" width={32} height={32} className="size-8 rounded-lg" />
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
