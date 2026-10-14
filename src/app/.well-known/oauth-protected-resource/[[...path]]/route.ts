import { json, preflight, resourceUrl, supabaseAuthServer } from "@/lib/mcp/server";

// Beschreibt für KI-Apps, wo man sich für den Konnektor anmeldet (RFC 9728)
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const origin = new URL(req.url).origin;
  return json(
    {
      resource: resourceUrl(origin),
      authorization_servers: [supabaseAuthServer()],
      bearer_methods_supported: ["header"],
      resource_name: "Projektraum",
      resource_documentation: `${origin}/hilfe#ki`,
    },
    200,
    { "Cache-Control": "public, max-age=300" },
  );
}

export const OPTIONS = () => preflight();
