import { db, type Effort, type Schedule } from "./db";
import { TOOL_NAMES } from "./toolNames";

const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];
const SCHEDULES: Schedule[] = ["none", "hourly", "daily", "weekly"];

export interface AgentInput {
  name?: string;
  subtitle?: string;
  system_prompt?: string;
  model?: string;
  effort?: string;
  active?: boolean | number;
  schedule?: string;
  schedule_input?: string;
  parent_id?: string | null;
  kb_ids?: string[];
  linked_ids?: string[];
  tools?: string[];
}

export function validate(input: AgentInput): string | null {
  if (input.name !== undefined && !input.name.trim()) return "Name is required";
  if (input.effort !== undefined && !EFFORTS.includes(input.effort as Effort)) return "Bad effort";
  if (input.tools !== undefined && (!Array.isArray(input.tools) || input.tools.some(t => !TOOL_NAMES.includes(t as never)))) return "Bad tools";
  if (input.schedule !== undefined && !SCHEDULES.includes(input.schedule as Schedule)) return "Bad schedule";
  return null;
}

export function saveLinks(agentId: string, input: AgentInput) {
  const d = db();
  if (input.kb_ids) {
    d.prepare("DELETE FROM agent_kb WHERE agent_id = ?").run(agentId);
    const ins = d.prepare("INSERT OR IGNORE INTO agent_kb (agent_id, kb_id) VALUES (?, ?)");
    for (const k of input.kb_ids) ins.run(agentId, k);
  }
  if (input.linked_ids) {
    d.prepare("DELETE FROM agent_links WHERE agent_id = ?").run(agentId);
    const ins = d.prepare("INSERT OR IGNORE INTO agent_links (agent_id, target_id) VALUES (?, ?)");
    for (const t of input.linked_ids) if (t !== agentId) ins.run(agentId, t);
  }
}
