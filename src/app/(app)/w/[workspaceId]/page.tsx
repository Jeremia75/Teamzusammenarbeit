import { notFound } from "next/navigation";
import { loadOverview } from "@/lib/queries";
import { WorkspaceOverview } from "@/components/workspace-overview";
import { StatusLegend } from "@/components/status-bar";

// Ein einzelner Bereich (z. B. "Privat" oder "PYR · Beruflich") mit allen Projekten als Kacheln
export default async function WorkspacePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const { userId, workspaces, stats, membersOf, isAdmin } = await loadOverview();
  const ws = workspaces.find((w) => w.id === workspaceId);
  if (!ws) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-7 py-8 flex flex-col gap-6">
      <div className="flex justify-end">
        <StatusLegend />
      </div>
      <WorkspaceOverview
        ws={ws}
        stats={stats}
        members={membersOf(ws.id)}
        currentUserId={userId}
        canManage={!ws.isPersonal && isAdmin(ws.organizationId)}
      />
    </div>
  );
}
