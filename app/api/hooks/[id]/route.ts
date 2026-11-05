import { timingSafeEqual } from "node:crypto";
import { getAgent } from "@/lib/db";
import { bad, ok } from "@/lib/http";
import { runAgent } from "@/lib/runner";

export const runtime = "nodejs";
export const maxDuration = 600;

const MAX_BODY = 200_000;

function sameKey(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Inbound webhook. POST /api/hooks/<agent id> with header `X-AgentOS-Key: <webhook key>`.
 * A JSON body with an "input" string runs the agent on that string; any other body is passed as is.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = getAgent(id);
  const key = req.headers.get("x-agentos-key") ?? "";
  if (!agent || !agent.webhook_key || !sameKey(key, agent.webhook_key)) return bad("Not found", 404);
  if (!agent.active) return bad("Agent is asleep", 409);

  const raw = await req.text();
  if (raw.length > MAX_BODY) return bad("Body is too large", 413);
  let input = raw.trim();
  try {
    const json = JSON.parse(raw);
    if (json && typeof json.input === "string") input = json.input.trim();
  } catch {
    // not JSON: use the raw text
  }
  if (!input) return bad("Body is empty");

  const run = await runAgent(id, input, "webhook");
  return ok({ id: run.id, status: run.status, output: run.output, error: run.error });
}
