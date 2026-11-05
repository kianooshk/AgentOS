import { getAgent } from "@/lib/db";
import { bad, body, ok } from "@/lib/http";
import { runAgent } from "@/lib/runner";

export const runtime = "nodejs";
export const maxDuration = 600;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getAgent(id)) return bad("Agent not found", 404);
  const { input } = await body<{ input: string }>(req);
  if (!input?.trim()) return bad("Input is required");
  return ok(await runAgent(id, input.trim(), "manual"));
}
