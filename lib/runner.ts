import Anthropic from "@anthropic-ai/sdk";
import { db, getAgent, newId, now, type AgentWithLinks, type KbDoc, type Run, type RunStep } from "./db";
import { runTool, toolDefs } from "./tools";

const MAX_DEPTH = 3;
const MARKER = /\$\(([^)]+)\)/g;

let client: Anthropic | null = null;
const claude = () => (client ??= new Anthropic());

function buildSystem(agent: AgentWithLinks): string {
  const parts = [agent.system_prompt.trim()];
  if (agent.kb_ids.length) {
    const q = `SELECT * FROM kb WHERE id IN (${agent.kb_ids.map(() => "?").join(",")})`;
    const docs = db().prepare(q).all(...agent.kb_ids) as KbDoc[];
    for (const d of docs) parts.push(`<document title="${d.title.replace(/"/g, "'")}">\n${d.content}\n</document>`);
  }
  if (agent.linked_ids.length) {
    const names = agent.linked_ids.map(id => getAgent(id)?.name).filter(Boolean);
    parts.push(
      `You can hand part of the work to these agents: ${names.join(", ")}. ` +
        `To do so, write $(Agent Name) in your reply. That marker is replaced by the agent's answer to the user's request.`,
    );
  }
  return parts.filter(Boolean).join("\n\n");
}

const MAX_TURNS = 20;

async function callClaude(agent: AgentWithLinks, input: string, steps: RunStep[]) {
  const tools = toolDefs(agent.tools);
  const system = buildSystem(agent) || undefined;
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: input }];
  const usage = { input_tokens: 0, output_tokens: 0 };
  let jsonRetries = 0;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let msg: Anthropic.Beta.BetaMessage;
    try {
      msg = await claude()
        .beta.messages.stream({
          model: agent.model,
          max_tokens: 64000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: agent.effort },
          system,
          tools: tools.length ? tools : undefined,
          messages,
        })
        .finalMessage();
      jsonRetries = 0;
    } catch (e) {
      // With eager input streaming, a tool input that is not valid JSON rejects here. Retry that turn only.
      if (e instanceof Anthropic.APIError || jsonRetries++ >= 2) throw e;
      continue;
    }
    usage.input_tokens += msg.usage.input_tokens;
    usage.output_tokens += msg.usage.output_tokens;

    if (msg.stop_reason === "refusal") {
      throw new Error(`Declined by the model${msg.stop_details?.category ? ` (${msg.stop_details.category})` : ""}.`);
    }
    const toolUses = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (msg.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: msg.content });
      continue;
    }
    if (msg.stop_reason === "max_tokens" && toolUses.length) throw new Error("A tool input was cut off at max_tokens.");
    if (msg.stop_reason !== "tool_use" || !toolUses.length) {
      const text = msg.content.map(b => (b.type === "text" ? b.text : "")).join("").trim();
      return { text, usage };
    }

    messages.push({ role: "assistant", content: msg.content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const t of toolUses) {
      const out = await runTool(t.name, t.input, agent.tools);
      steps.push({ tool: t.name, input: t.input, ok: out.ok, result: out.text.slice(0, 2000) });
      results.push({ type: "tool_result", tool_use_id: t.id, content: out.text, is_error: !out.ok || undefined });
    }
    messages.push({ role: "user", content: results });
  }
  throw new Error(`Stopped after ${MAX_TURNS} turns.`);
}

async function resolveMarkers(agent: AgentWithLinks, text: string, input: string, depth: number): Promise<string> {
  if (depth >= MAX_DEPTH || !agent.linked_ids.length) return text;
  const linked = agent.linked_ids.map(id => getAgent(id)).filter((a): a is AgentWithLinks => !!a);
  const byName = new Map(linked.map(a => [a.name.toLowerCase(), a]));
  const replies = new Map<string, string>();
  for (const [, name] of text.matchAll(MARKER)) {
    const key = name.trim().toLowerCase();
    const target = byName.get(key);
    if (!target || replies.has(key)) continue;
    const run = await runAgent(target.id, input, "agent", depth + 1);
    replies.set(key, run.status === "ok" ? run.output : `[${target.name} failed: ${run.error}]`);
  }
  return text.replace(MARKER, (m, name: string) => replies.get(name.trim().toLowerCase()) ?? m);
}

export async function runAgent(agentId: string, input: string, trigger: Run["trigger"] = "manual", depth = 0): Promise<Run> {
  const agent = getAgent(agentId);
  if (!agent) throw new Error("Agent not found");
  const id = newId();
  db()
    .prepare("INSERT INTO runs (id, agent_id, trigger, input, status, started_at) VALUES (?, ?, ?, ?, 'running', ?)")
    .run(id, agentId, trigger, input, now());
  const steps: RunStep[] = [];
  try {
    const { text, usage } = await callClaude(agent, input, steps);
    const output = await resolveMarkers(agent, text, input, depth);
    db()
      .prepare("UPDATE runs SET status='ok', output=?, input_tokens=?, output_tokens=?, steps=?, finished_at=? WHERE id=?")
      .run(output, usage.input_tokens, usage.output_tokens, JSON.stringify(steps), now(), id);
  } catch (e) {
    const msg = e instanceof Anthropic.APIError ? `${e.status ?? ""} ${e.message}`.trim() : e instanceof Error ? e.message : String(e);
    db().prepare("UPDATE runs SET status='error', error=?, steps=?, finished_at=? WHERE id=?").run(msg, JSON.stringify(steps), now(), id);
  }
  return db().prepare("SELECT * FROM runs WHERE id = ?").get(id) as Run;
}
