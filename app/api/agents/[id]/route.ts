import { db, getAgent, newKey } from "@/lib/db";
import { saveLinks, validate, type AgentInput } from "@/lib/agentInput";
import { bad, body, ok } from "@/lib/http";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

const FIELDS = ["name", "subtitle", "system_prompt", "model", "effort", "schedule", "schedule_input", "parent_id"] as const;

export async function GET(_req: Request, { params }: Ctx) {
  const a = getAgent((await params).id);
  return a ? ok(a) : bad("Agent not found", 404);
}

export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!getAgent(id)) return bad("Agent not found", 404);
  const input = await body<AgentInput>(req);
  const err = validate(input);
  if (err) return bad(err);
  if (input.parent_id === id) return bad("An agent cannot be its own parent");
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const f of FIELDS) {
    if (input[f] !== undefined) {
      sets.push(`${f} = ?`);
      vals.push(typeof input[f] === "string" && f === "name" ? (input[f] as string).trim() : input[f]);
    }
  }
  if (input.tools !== undefined) {
    sets.push("tools = ?");
    vals.push(JSON.stringify(input.tools));
  }
  if ((input as { new_webhook_key?: boolean }).new_webhook_key) {
    sets.push("webhook_key = ?");
    vals.push(newKey());
  }
  if (input.active !== undefined) {
    sets.push("active = ?");
    vals.push(input.active ? 1 : 0);
  }
  const d = db();
  d.transaction(() => {
    if (sets.length) d.prepare(`UPDATE agents SET ${sets.join(", ")} WHERE id = ?`).run(...vals, id);
    saveLinks(id, input);
  })();
  return ok(getAgent(id));
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const r = db().prepare("DELETE FROM agents WHERE id = ?").run(id);
  return r.changes ? ok({ deleted: id }) : bad("Agent not found", 404);
}
