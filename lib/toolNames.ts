// Shared by the server and the UI. Keep this file free of server-only imports.
export type ToolName = "http_request" | "fetch_url" | "send_email" | "slack_post" | "telegram_send";

export const TOOL_NAMES: ToolName[] = ["http_request", "fetch_url", "send_email", "slack_post", "telegram_send"];

export const TOOL_LABELS: Record<ToolName, string> = {
  http_request: "HTTP request",
  fetch_url: "Fetch URL",
  send_email: "Email (SMTP)",
  slack_post: "Slack",
  telegram_send: "Telegram",
};
