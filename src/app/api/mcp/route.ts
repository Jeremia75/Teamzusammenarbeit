import { mcpNotAllowed, mcpPost, preflight } from "@/lib/mcp/server";

// Projektraum-Konnektor für KI-Assistenten (z. B. Claude)
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = (req: Request) => mcpPost(req);
export const GET = () => mcpNotAllowed();
export const DELETE = () => mcpNotAllowed();
export const OPTIONS = () => preflight();
