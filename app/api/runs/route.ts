import { db, type Run } from "@/lib/db";
import { bad, ok } from "@/lib/http";

export const runtime = "nodejs";

export function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const agent = sp.get("agent");
  if (!agent) return bad("agent is required");
  const limit = Math.min(Number(sp.get("limit")) || 20, 100);
  return ok(db().prepare("SELECT * FROM runs WHERE agent_id = ? ORDER BY started_at DESC LIMIT ?").all(agent, limit) as Run[]);
}
