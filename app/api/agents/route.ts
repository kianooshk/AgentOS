import { db, getAgent, listAgents, newId, newKey, now } from "@/lib/db";
import { saveLinks, validate, type AgentInput } from "@/lib/agentInput";
import { bad, body, ok } from "@/lib/http";

export const runtime = "nodejs";

export function GET(req: Request) {
  const org = new URL(req.url).searchParams.get("org");
  if (!org) return bad("org is required");
  return ok(listAgents(org));
}

export async function POST(req: Request) {
  const input = await body<AgentInput & { org_id: string }>(req);
  if (!input.org_id) return bad("org_id is required");
  if (!input.name) return bad("Name is required");
  const err = validate(input);
  if (err) return bad(err);
  const id = newId();
  const d = db();
  d.transaction(() => {
    d.prepare(
      `INSERT INTO agents (id, org_id, parent_id, name, subtitle, system_prompt, model, effort, active, schedule, schedule_input, tools, webhook_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.org_id,
      input.parent_id ?? null,
      input.name!.trim(),
      input.subtitle ?? "",
      input.system_prompt ?? "",
      input.model || process.env.AGENTOS_MODEL || "claude-opus-5-5",
      input.effort ?? "medium",
      input.active === false || input.active === 0 ? 0 : 1,
      input.schedule ?? "none",
      input.schedule_input ?? "",
      JSON.stringify(input.tools ?? []),
      newKey(),
      now(),
    );
    saveLinks(id, input);
  })();
  return ok(getAgent(id), 201);
}
