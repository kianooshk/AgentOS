# AgentOS Lite

A small, self-hosted panel to build, run and schedule AI agents per organization.

## Features

- Organizations, each with its own agents and documents
- Agents in a tree, with system prompt, model, effort, and Active or Sleep status
- Run an agent and keep a history of each run (input, output, tokens)
- Knowledge base: text documents you attach to agents
- Connected agents: an agent writes `$(Agent Name)` and gets that agent's answer in its place
- Scheduler: hourly, daily or weekly runs
- Tools, turned on per agent: HTTP request, fetch URL, email (SMTP), Slack, Telegram
- Inbound webhook: `POST /api/hooks/<agent id>` with header `X-AgentOS-Key` runs the agent

## Tools

Set the credentials in `.env` (see `.env.example`). A tool without its credentials returns an error to the agent.
HTTP tools block private and local addresses. Set `AGENTOS_ALLOW_PRIVATE_URLS=1` to allow them.

Webhook example:

```sh
curl -X POST http://localhost:3000/api/hooks/<agent id> \
  -H "X-AgentOS-Key: <webhook key>" -H "Content-Type: application/json" \
  -d '{"input": "Summarize the new orders"}'
```

## Stack

Next.js (App Router) and TypeScript, SQLite (better-sqlite3), the Anthropic TypeScript SDK, Nodemailer.

## Run

Needs Node.js 20 or later.

```sh
cp .env.example .env    # set ANTHROPIC_API_KEY
npm install
npm run dev             # http://localhost:3000
```

Data is in `data/agentos.db`. Set `AGENTOS_DB` to use a different file.
Set `AGENTOS_SCHEDULER=0` to turn off the scheduler.

## Security

There is no login. Run it on your own machine or behind your own auth. Agents with tools can send messages and call URLs, so turn on only the tools an agent needs.

## License

MIT
