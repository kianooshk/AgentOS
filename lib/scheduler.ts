import { db, now, type Agent } from "./db";
import { runAgent } from "./runner";

const PERIOD_MS: Record<string, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

let busy = false;

export async function tick(): Promise<number> {
  if (busy) return 0;
  busy = true;
  let started = 0;
  try {
    const agents = db().prepare("SELECT * FROM agents WHERE active = 1 AND schedule != 'none'").all() as Agent[];
    const t = Date.now();
    for (const a of agents) {
      const last = a.last_scheduled_at ? Date.parse(a.last_scheduled_at) : 0;
      if (t - last < PERIOD_MS[a.schedule]) continue;
      db().prepare("UPDATE agents SET last_scheduled_at = ? WHERE id = ?").run(now(), a.id);
      started++;
      await runAgent(a.id, a.schedule_input || "Run your scheduled task.", "schedule");
    }
  } finally {
    busy = false;
  }
  return started;
}

declare global {
  // eslint-disable-next-line no-var
  var __agentosScheduler: NodeJS.Timeout | undefined;
}

export function startScheduler() {
  if (process.env.AGENTOS_SCHEDULER === "0" || globalThis.__agentosScheduler) return;
  globalThis.__agentosScheduler = setInterval(() => void tick().catch(console.error), 60_000);
}
