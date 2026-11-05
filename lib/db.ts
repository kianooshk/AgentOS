import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

export type Schedule = "none" | "hourly" | "daily" | "weekly";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface Org {
  id: string;
  name: string;
  created_at: string;
}

export interface Agent {
  id: string;
  org_id: string;
  parent_id: string | null;
  name: string;
  subtitle: string;
  system_prompt: string;
  model: string;
  effort: Effort;
  active: number;
  schedule: Schedule;
  schedule_input: string;
  last_scheduled_at: string | null;
  tools: string;
  webhook_key: string;
  created_at: string;
}

export interface AgentWithLinks extends Omit<Agent, "tools"> {
  tools: string[];
  kb_ids: string[];
  linked_ids: string[];
}

export interface RunStep {
  tool: string;
  input: unknown;
  ok: boolean;
  result: string;
}

export interface KbDoc {
  id: string;
  org_id: string;
  title: string;
  content: string;
  created_at: string;
}

export interface Run {
  id: string;
  agent_id: string;
  trigger: "manual" | "schedule" | "agent" | "webhook";
  input: string;
  output: string;
  status: "running" | "ok" | "error";
  error: string | null;
  input_tokens: number;
  output_tokens: number;
  steps: string;
  started_at: string;
  finished_at: string | null;
}

const DB_PATH = process.env.AGENTOS_DB ?? path.join(process.cwd(), "data", "agentos.db");

declare global {
  // eslint-disable-next-line no-var
  var __agentosDb: Database.Database | undefined;
}

function addColumn(db: Database.Database, table: string, column: string, type: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some(c => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

function open(): Database.Database {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS orgs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      parent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      subtitle TEXT NOT NULL DEFAULT '',
      system_prompt TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL,
      effort TEXT NOT NULL DEFAULT 'medium',
      active INTEGER NOT NULL DEFAULT 1,
      schedule TEXT NOT NULL DEFAULT 'none',
      schedule_input TEXT NOT NULL DEFAULT '',
      last_scheduled_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kb (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agent_kb (
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      kb_id TEXT NOT NULL REFERENCES kb(id) ON DELETE CASCADE,
      PRIMARY KEY (agent_id, kb_id)
    );
    CREATE TABLE IF NOT EXISTS agent_links (
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      target_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      PRIMARY KEY (agent_id, target_id)
    );
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      trigger TEXT NOT NULL,
      input TEXT NOT NULL,
      output TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      error TEXT,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL,
      finished_at TEXT
    );
    CREATE INDEX IF NOT EXISTS runs_agent ON runs(agent_id, started_at DESC);
  `);
  addColumn(db, "agents", "tools", "TEXT NOT NULL DEFAULT '[]'");
  addColumn(db, "agents", "webhook_key", "TEXT NOT NULL DEFAULT ''");
  addColumn(db, "runs", "steps", "TEXT NOT NULL DEFAULT '[]'");
  const missing = db.prepare("SELECT id FROM agents WHERE webhook_key = ''").all() as { id: string }[];
  for (const r of missing) db.prepare("UPDATE agents SET webhook_key = ? WHERE id = ?").run(newKey(), r.id);
  return db;
}

export function db(): Database.Database {
  if (!globalThis.__agentosDb) globalThis.__agentosDb = open();
  return globalThis.__agentosDb;
}

export const now = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();
export const newKey = () => randomBytes(24).toString("hex");

function parseList(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function getAgent(id: string): AgentWithLinks | null {
  const a = db().prepare("SELECT * FROM agents WHERE id = ?").get(id) as Agent | undefined;
  if (!a) return null;
  const kb_ids = (db().prepare("SELECT kb_id FROM agent_kb WHERE agent_id = ?").all(id) as { kb_id: string }[]).map(r => r.kb_id);
  const linked_ids = (db().prepare("SELECT target_id FROM agent_links WHERE agent_id = ?").all(id) as { target_id: string }[]).map(r => r.target_id);
  return { ...a, tools: parseList(a.tools), kb_ids, linked_ids };
}

export function listAgents(orgId: string): AgentWithLinks[] {
  const rows = db().prepare("SELECT id FROM agents WHERE org_id = ? ORDER BY created_at").all(orgId) as { id: string }[];
  return rows.map(r => getAgent(r.id)!).filter(Boolean);
}
