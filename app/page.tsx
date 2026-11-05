"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AgentWithLinks, KbDoc, Org, Run, RunStep } from "@/lib/db";
import { TOOL_LABELS, TOOL_NAMES } from "@/lib/toolNames";

type Draft = Omit<AgentWithLinks, "id" | "org_id" | "created_at" | "last_scheduled_at"> & { id?: string };

const EMPTY: Draft = {
  name: "",
  subtitle: "",
  system_prompt: "",
  model: "claude-opus-5-5",
  effort: "medium",
  active: 1,
  schedule: "none",
  schedule_input: "",
  parent_id: null,
  tools: [],
  webhook_key: "",
  kb_ids: [],
  linked_ids: [],
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

export default function Home() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState("");
  const [tab, setTab] = useState<"agents" | "kb">("agents");
  const [agents, setAgents] = useState<AgentWithLinks[]>([]);
  const [kb, setKb] = useState<KbDoc[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const guard = useCallback(async (fn: () => Promise<void>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const loadOrgs = useCallback(
    () =>
      guard(async () => {
        const list = await api<Org[]>("/api/orgs");
        setOrgs(list);
        setOrgId(cur => (list.some(o => o.id === cur) ? cur : list[0]?.id ?? ""));
      }),
    [guard],
  );

  const loadOrg = useCallback(
    () =>
      guard(async () => {
        if (!orgId) return setAgents([]), setKb([]);
        const [a, k] = await Promise.all([api<AgentWithLinks[]>(`/api/agents?org=${orgId}`), api<KbDoc[]>(`/api/kb?org=${orgId}`)]);
        setAgents(a);
        setKb(k);
      }),
    [guard, orgId],
  );

  const loadRuns = useCallback(
    (id?: string) => guard(async () => setRuns(id ? await api<Run[]>(`/api/runs?agent=${id}`) : [])),
    [guard],
  );

  useEffect(() => void loadOrgs(), [loadOrgs]);
  useEffect(() => {
    setDraft(null);
    void loadOrg();
  }, [loadOrg]);
  useEffect(() => void loadRuns(draft?.id), [draft?.id, loadRuns]);

  const createOrg = () =>
    guard(async () => {
      const name = prompt("Organization name");
      if (!name) return;
      const org = await api<Org>("/api/orgs", { method: "POST", body: JSON.stringify({ name }) });
      await loadOrgs();
      setOrgId(org.id);
    });

  const deleteOrg = () =>
    guard(async () => {
      const org = orgs.find(o => o.id === orgId);
      if (!org || !confirm(`Delete "${org.name}" with all its agents, runs and documents?`)) return;
      await api(`/api/orgs/${orgId}`, { method: "DELETE" });
      await loadOrgs();
    });

  const saveAgent = () =>
    guard(async () => {
      if (!draft) return;
      const payload = JSON.stringify({ ...draft, org_id: orgId });
      const saved = draft.id
        ? await api<AgentWithLinks>(`/api/agents/${draft.id}`, { method: "PUT", body: payload })
        : await api<AgentWithLinks>("/api/agents", { method: "POST", body: payload });
      setDraft(saved);
      await loadOrg();
    });

  const deleteAgent = () =>
    guard(async () => {
      if (!draft?.id || !confirm(`Delete agent "${draft.name}" and its runs?`)) return;
      await api(`/api/agents/${draft.id}`, { method: "DELETE" });
      setDraft(null);
      await loadOrg();
    });

  const run = () =>
    guard(async () => {
      if (!draft?.id || !input.trim()) return;
      setBusy(true);
      try {
        await api<Run>(`/api/agents/${draft.id}/run`, { method: "POST", body: JSON.stringify({ input }) });
        setInput("");
        await loadRuns(draft.id);
      } finally {
        setBusy(false);
      }
    });

  const newWebhookKey = () =>
    guard(async () => {
      if (!draft?.id || !confirm("Make a new webhook key? The old key stops working.")) return;
      const saved = await api<AgentWithLinks>(`/api/agents/${draft.id}`, { method: "PUT", body: JSON.stringify({ new_webhook_key: true }) });
      setDraft(d => (d ? { ...d, webhook_key: saved.webhook_key } : d));
    });

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft(d => (d ? { ...d, [k]: v } : d));
  const toggle = (k: "kb_ids" | "linked_ids" | "tools", id: string) =>
    setDraft(d => (d ? { ...d, [k]: d[k].includes(id) ? d[k].filter(x => x !== id) : [...d[k], id] } : d));

  return (
    <>
      <header className="top">
        <span className="brand">AgentOS Lite</span>
        <select value={orgId} onChange={e => setOrgId(e.target.value)} aria-label="Organization">
          {!orgs.length && <option value="">No organizations</option>}
          {orgs.map(o => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <button onClick={createOrg}>New org</button>
        {orgId && (
          <button className="danger" onClick={deleteOrg}>
            Delete org
          </button>
        )}
        <nav className="tabs">
          <button className={tab === "agents" ? "on" : ""} onClick={() => setTab("agents")}>
            Agents
          </button>
          <button className={tab === "kb" ? "on" : ""} onClick={() => setTab("kb")}>
            Knowledge base
          </button>
        </nav>
      </header>

      {error && <div className="err" style={{ padding: "0 16px" }}>{error}</div>}

      {!orgId ? (
        <div className="content empty">Create an organization to start.</div>
      ) : tab === "kb" ? (
        <KnowledgeBase orgId={orgId} docs={kb} reload={loadOrg} guard={guard} />
      ) : (
        <div className="main">
          <aside className="side">
            <button className="primary" onClick={() => setDraft({ ...EMPTY })}>
              New agent
            </button>
            <Tree agents={agents} parent={null} selected={draft?.id} onPick={a => setDraft(a)} />
          </aside>
          <section className="content">
            {!draft ? (
              <div className="empty">Pick an agent, or make a new one.</div>
            ) : (
              <>
                <AgentForm draft={draft} agents={agents} kb={kb} set={set} toggle={toggle} />
                <div className="actions" style={{ marginBottom: 14 }}>
                  <button className="primary" onClick={saveAgent} disabled={!draft.name.trim()}>
                    Save
                  </button>
                  {draft.id && (
                    <button className="danger" onClick={deleteAgent}>
                      Delete
                    </button>
                  )}
                </div>
                {draft.id && (
                  <div className="card">
                    <h3>Inbound webhook</h3>
                    <div className="meta">POST a JSON body like {'{"input": "..."}'} to run this agent.</div>
                    <label>URL</label>
                    <input readOnly value={`${typeof window === "undefined" ? "" : window.location.origin}/api/hooks/${draft.id}`} />
                    <label>Header X-AgentOS-Key</label>
                    <input readOnly type="password" value={draft.webhook_key} onFocus={e => (e.target.type = "text")} onBlur={e => (e.target.type = "password")} />
                    <div className="actions">
                      <button onClick={newWebhookKey}>New key</button>
                    </div>
                  </div>
                )}
                {draft.id && (
                  <div className="card">
                    <h3>Run</h3>
                    <textarea value={input} onChange={e => setInput(e.target.value)} placeholder="What should the agent do?" />
                    <div className="actions">
                      <button className="primary" onClick={run} disabled={busy || !input.trim()}>
                        {busy ? "Running…" : "Run"}
                      </button>
                      <button onClick={() => loadRuns(draft.id)}>Refresh</button>
                    </div>
                    <h3 style={{ marginTop: 16 }}>Recent runs</h3>
                    {!runs.length && <div className="empty">No runs yet.</div>}
                    {runs.map(r => (
                      <div key={r.id} className="run">
                        <div className="meta">
                          <span className={`st-${r.status}`}>{r.status}</span>
                          <span>{r.trigger}</span>
                          <span>{new Date(r.started_at).toLocaleString()}</span>
                          <span>
                            {r.input_tokens} in / {r.output_tokens} out
                          </span>
                        </div>
                        <pre style={{ color: "var(--muted)" }}>{r.input}</pre>
                        <Steps json={r.steps} />
                        {r.error ? <pre className="st-error">{r.error}</pre> : <pre>{r.output}</pre>}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function Steps({ json }: { json: string }) {
  let steps: RunStep[] = [];
  try {
    steps = JSON.parse(json || "[]");
  } catch {
    return null;
  }
  if (!steps.length) return null;
  return (
    <details>
      <summary className="meta">{steps.length} tool call(s)</summary>
      {steps.map((s, i) => (
        <pre key={i} className={s.ok ? "" : "st-error"}>
          {s.tool} {JSON.stringify(s.input)}
          {"\n→ "}
          {s.result}
        </pre>
      ))}
    </details>
  );
}

function Tree({
  agents,
  parent,
  selected,
  onPick,
}: {
  agents: AgentWithLinks[];
  parent: string | null;
  selected?: string;
  onPick: (a: AgentWithLinks) => void;
}) {
  const ids = useMemo(() => new Set(agents.map(a => a.id)), [agents]);
  const kids = agents.filter(a => (parent === null ? !a.parent_id || !ids.has(a.parent_id) : a.parent_id === parent));
  if (!kids.length) return null;
  return (
    <ul className="tree">
      {kids.map(a => (
        <li key={a.id}>
          <div className={`node ${selected === a.id ? "sel" : ""}`} onClick={() => onPick(a)}>
            <span className={`dot ${a.active ? "on" : ""}`} />
            {a.name}
          </div>
          <Tree agents={agents} parent={a.id} selected={selected} onPick={onPick} />
        </li>
      ))}
    </ul>
  );
}

function AgentForm({
  draft,
  agents,
  kb,
  set,
  toggle,
}: {
  draft: Draft;
  agents: AgentWithLinks[];
  kb: KbDoc[];
  set: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  toggle: (k: "kb_ids" | "linked_ids" | "tools", id: string) => void;
}) {
  const others = agents.filter(a => a.id !== draft.id);
  return (
    <div className="card">
      <h3>{draft.id ? draft.name || "Agent" : "New agent"}</h3>
      <div className="row">
        <div>
          <label>Name</label>
          <input value={draft.name} onChange={e => set("name", e.target.value)} />
        </div>
        <div>
          <label>Subtitle</label>
          <input value={draft.subtitle} onChange={e => set("subtitle", e.target.value)} />
        </div>
        <div>
          <label>Parent</label>
          <select value={draft.parent_id ?? ""} onChange={e => set("parent_id", e.target.value || null)}>
            <option value="">None (top level)</option>
            {others.map(a => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label>System prompt</label>
      <textarea rows={8} value={draft.system_prompt} onChange={e => set("system_prompt", e.target.value)} />
      <div className="row">
        <div>
          <label>Model</label>
          <input value={draft.model} onChange={e => set("model", e.target.value)} />
        </div>
        <div>
          <label>Effort</label>
          <select value={draft.effort} onChange={e => set("effort", e.target.value as Draft["effort"])}>
            {["low", "medium", "high", "xhigh", "max"].map(v => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Status</label>
          <select value={draft.active} onChange={e => set("active", Number(e.target.value))}>
            <option value={1}>Active</option>
            <option value={0}>Sleep</option>
          </select>
        </div>
        <div>
          <label>Schedule</label>
          <select value={draft.schedule} onChange={e => set("schedule", e.target.value as Draft["schedule"])}>
            {["none", "hourly", "daily", "weekly"].map(v => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </div>
      </div>
      {draft.schedule !== "none" && (
        <>
          <label>Scheduled input</label>
          <input
            value={draft.schedule_input}
            placeholder="Run your scheduled task."
            onChange={e => set("schedule_input", e.target.value)}
          />
        </>
      )}
      <label>Tools</label>
      <div className="checks">
        {TOOL_NAMES.map(t => (
          <label key={t}>
            <input type="checkbox" checked={draft.tools.includes(t)} onChange={() => toggle("tools", t)} />
            {TOOL_LABELS[t]}
          </label>
        ))}
      </div>
      <label>Knowledge base</label>
      <div className="checks">
        {!kb.length && <span className="meta">No documents in this org.</span>}
        {kb.map(d => (
          <label key={d.id}>
            <input type="checkbox" checked={draft.kb_ids.includes(d.id)} onChange={() => toggle("kb_ids", d.id)} />
            {d.title}
          </label>
        ))}
      </div>
      <label>Connected agents (call with $(Agent Name) in the reply)</label>
      <div className="checks">
        {!others.length && <span className="meta">No other agents.</span>}
        {others.map(a => (
          <label key={a.id}>
            <input type="checkbox" checked={draft.linked_ids.includes(a.id)} onChange={() => toggle("linked_ids", a.id)} />
            {a.name}
          </label>
        ))}
      </div>
    </div>
  );
}

function KnowledgeBase({
  orgId,
  docs,
  reload,
  guard,
}: {
  orgId: string;
  docs: KbDoc[];
  reload: () => Promise<void>;
  guard: (fn: () => Promise<void>) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const add = () =>
    guard(async () => {
      await api("/api/kb", { method: "POST", body: JSON.stringify({ org_id: orgId, title, content }) });
      setTitle("");
      setContent("");
      await reload();
    });

  const remove = (d: KbDoc) =>
    guard(async () => {
      if (!confirm(`Delete "${d.title}"?`)) return;
      await api(`/api/kb/${d.id}`, { method: "DELETE" });
      await reload();
    });

  const upload = async (file?: File) => {
    if (!file) return;
    setTitle(file.name);
    setContent(await file.text());
  };

  return (
    <div className="content">
      <div className="card">
        <h3>Add document</h3>
        <label>Title</label>
        <input value={title} onChange={e => setTitle(e.target.value)} />
        <label>Content</label>
        <textarea rows={8} value={content} onChange={e => setContent(e.target.value)} />
        <label>Or load a text file</label>
        <input type="file" accept=".txt,.md,.csv,.json" onChange={e => upload(e.target.files?.[0])} />
        <div className="actions">
          <button className="primary" onClick={add} disabled={!title.trim() || !content.trim()}>
            Add
          </button>
        </div>
      </div>
      {!docs.length && <div className="empty">No documents yet.</div>}
      {docs.map(d => (
        <div key={d.id} className="card">
          <h3>{d.title}</h3>
          <div className="meta">
            <span>{new Date(d.created_at).toLocaleString()}</span>
            <span>{d.content.length.toLocaleString()} chars</span>
          </div>
          <pre>{d.content.length > 600 ? d.content.slice(0, 600) + "…" : d.content}</pre>
          <div className="actions">
            <button className="danger" onClick={() => remove(d)}>
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
