import type Anthropic from "@anthropic-ai/sdk";
import dns from "node:dns/promises";
import net from "node:net";
import nodemailer from "nodemailer";

import { TOOL_NAMES, type ToolName } from "./toolNames";

export { TOOL_NAMES };

const MAX_RESULT = 100_000;
const TIMEOUT_MS = 30_000;

type Schema = Anthropic.Beta.BetaTool["input_schema"];

const DEFS: Record<ToolName, { description: string; input_schema: Schema }> = {
  http_request: {
    description:
      "Send an HTTP request to a public URL and get back the status code and response body. Use it to call APIs.",
    input_schema: {
      type: "object",
      properties: {
        method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
        url: { type: "string", description: "Full http or https URL" },
        headers: { type: "object", additionalProperties: { type: "string" } },
        body: { type: "string", description: "Request body, for example a JSON string" },
      },
      required: ["method", "url"],
      additionalProperties: false,
    },
  },
  fetch_url: {
    description: "Read a public web page and get back its text, without HTML tags.",
    input_schema: {
      type: "object",
      properties: { url: { type: "string", description: "Full http or https URL" } },
      required: ["url"],
      additionalProperties: false,
    },
  },
  send_email: {
    description: "Send a plain-text email.",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string", description: "One email address" },
        subject: { type: "string" },
        text: { type: "string" },
      },
      required: ["to", "subject", "text"],
      additionalProperties: false,
    },
  },
  slack_post: {
    description: "Post a message to a Slack channel.",
    input_schema: {
      type: "object",
      properties: {
        channel: { type: "string", description: "Channel ID or name, for example #general" },
        text: { type: "string" },
      },
      required: ["channel", "text"],
      additionalProperties: false,
    },
  },
  telegram_send: {
    description: "Send a message to a Telegram chat.",
    input_schema: {
      type: "object",
      properties: {
        chat_id: { type: "string", description: "Telegram chat ID" },
        text: { type: "string" },
      },
      required: ["chat_id", "text"],
      additionalProperties: false,
    },
  },
};

export function toolDefs(names: string[]): Anthropic.Beta.BetaTool[] {
  return TOOL_NAMES.filter(n => names.includes(n)).map(name => ({
    name,
    description: DEFS[name].description,
    input_schema: DEFS[name].input_schema,
    eager_input_streaming: true,
  }));
}

/** Checks a parsed tool input against its schema: required keys, string types, no extra keys. */
function validate(name: ToolName, input: unknown): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return "Input must be an object";
  const schema = DEFS[name].input_schema as { properties: Record<string, { type: string; enum?: string[] }>; required: string[] };
  const obj = input as Record<string, unknown>;
  for (const key of schema.required) if (obj[key] === undefined) return `Missing "${key}"`;
  for (const [key, val] of Object.entries(obj)) {
    const prop = schema.properties[key];
    if (!prop) return `Unknown field "${key}"`;
    if (prop.type === "string" && typeof val !== "string") return `"${key}" must be a string`;
    if (prop.type === "object") {
      if (!val || typeof val !== "object" || Array.isArray(val)) return `"${key}" must be an object`;
      if (Object.values(val).some(v => typeof v !== "string")) return `"${key}" values must be strings`;
    }
    if (prop.enum && !prop.enum.includes(val as string)) return `"${key}" must be one of ${prop.enum.join(", ")}`;
  }
  return null;
}

function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} is not set`);
  return v;
}

function cap(text: string): string {
  return text.length > MAX_RESULT ? `${text.slice(0, MAX_RESULT)}\n\n[Cut at ${MAX_RESULT} of ${text.length} characters]` : text;
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateIp(v6.slice(7));
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb") || v6.startsWith("ff");
}

/** Rejects non-http(s) URLs and, unless allowed, URLs that resolve to private or local addresses. */
async function checkUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only http and https URLs are allowed");
  if (process.env.AGENTOS_ALLOW_PRIVATE_URLS === "1") return url;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map(a => a.address);
  if (!addrs.length || addrs.some(isPrivateIp)) throw new Error("Private and local addresses are blocked");
  return url;
}

/** fetch with a timeout and redirects followed by hand, so each hop is checked. */
async function safeFetch(raw: string, init: RequestInit = {}): Promise<Response> {
  let url = await checkUrl(raw);
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
    const loc = res.headers.get("location");
    if (res.status < 300 || res.status >= 400 || !loc) return res;
    url = await checkUrl(new URL(loc, url).toString());
    if (res.status !== 307 && res.status !== 308) init = { ...init, method: "GET", body: undefined };
  }
  throw new Error("Too many redirects");
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

let mailer: ReturnType<typeof nodemailer.createTransport> | null = null;

const RUN: Record<ToolName, (i: Record<string, any>) => Promise<string>> = {
  async http_request({ method, url, headers, body }) {
    const res = await safeFetch(url, { method, headers, body: method === "GET" ? undefined : body });
    return cap(`HTTP ${res.status}\n\n${await res.text()}`);
  },

  async fetch_url({ url }) {
    const res = await safeFetch(url, { headers: { Accept: "text/html,text/plain,*/*" } });
    const text = await res.text();
    const type = res.headers.get("content-type") ?? "";
    return cap(`HTTP ${res.status}\n\n${type.includes("html") ? htmlToText(text) : text}`);
  },

  async send_email({ to, subject, text }) {
    if (!/^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/.test(to)) throw new Error("Give one plain email address");
    mailer ??= nodemailer.createTransport({
      host: env("SMTP_HOST"),
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "1",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: env("SMTP_PASS") } : undefined,
    });
    const info = await mailer.sendMail({ from: env("SMTP_FROM"), to, subject, text });
    return `Sent. Message ID: ${info.messageId}`;
  },

  async slack_post({ channel, text }) {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${env("SLACK_BOT_TOKEN")}`, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ channel, text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const data = (await res.json()) as { ok: boolean; error?: string; ts?: string };
    if (!data.ok) throw new Error(`Slack error: ${data.error ?? res.status}`);
    return `Posted. Timestamp: ${data.ts}`;
  },

  async telegram_send({ chat_id, text }) {
    const res = await fetch(`https://api.telegram.org/bot${env("TELEGRAM_BOT_TOKEN")}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id, text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const data = (await res.json()) as { ok: boolean; description?: string; result?: { message_id: number } };
    if (!data.ok) throw new Error(`Telegram error: ${data.description ?? res.status}`);
    return `Sent. Message ID: ${data.result?.message_id}`;
  },
};

export interface ToolOutcome {
  ok: boolean;
  text: string;
}

export async function runTool(name: string, input: unknown, allowed: string[]): Promise<ToolOutcome> {
  if (!TOOL_NAMES.includes(name as ToolName) || !allowed.includes(name)) return { ok: false, text: `Tool "${name}" is not enabled` };
  const problem = validate(name as ToolName, input);
  if (problem) return { ok: false, text: JSON.stringify({ INVALID_INPUT: problem, input }) };
  try {
    return { ok: true, text: await RUN[name as ToolName](input as Record<string, unknown>) };
  } catch (e) {
    return { ok: false, text: e instanceof Error ? e.message : String(e) };
  }
}
