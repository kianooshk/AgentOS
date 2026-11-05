# AgentOS features

This file lists the features of v0 (this repository) and the features of the full operating version.
The full version is the target for later releases of this project.

## v0 (this repository)

### Organizations
- Create and delete an organization.
- Each organization has its own agents and documents.

### Agents
- Agents are in a tree. An agent can have a parent.
- Each agent has a name, a subtitle, a system prompt, a model and an effort level.
- Status: Active or Sleep.
- Delete an agent. Its runs are deleted with it.

### Runs
- Run an agent with an input from the panel.
- Each run keeps its input, output, status, error, token counts and tool calls.
- The panel shows the last 20 runs of an agent.

### Knowledge base
- Add a text document, or load a `.txt`, `.md`, `.csv` or `.json` file.
- Attach documents to an agent. The agent gets them in its system prompt.

### Connected agents
- Connect an agent to other agents.
- When the agent writes `$(Agent Name)`, that agent runs on the same input and its answer replaces the marker.
- Maximum depth: 3.

### Scheduler
- Schedule: none, hourly, daily or weekly.
- Each agent can have its own scheduled input.
- Set `AGENTOS_SCHEDULER=0` to stop the scheduler.

### Tools (turned on per agent)
- HTTP request (GET, POST, PUT, PATCH, DELETE).
- Fetch URL (gives the page text without HTML).
- Email through SMTP.
- Slack: post a message to a channel.
- Telegram: send a message to a chat.
- HTTP tools block private and local addresses, unless `AGENTOS_ALLOW_PRIVATE_URLS=1`.

### Inbound webhook
- `POST /api/hooks/<agent id>` with header `X-AgentOS-Key` runs the agent.
- Each agent has its own key. You can make a new key from the panel.

### Platform
- Next.js and TypeScript, SQLite, the Anthropic TypeScript SDK.
- All secrets come from environment variables.
- Dockerfile included.
- No login.

## Full operating version

### Access and security
- Login with bcrypt passwords and sessions.
- Roles: owner, editor, viewer.
- CSRF token on all write requests.
- Login rate limit: 5 failures for each IP in 15 minutes.
- Private organizations are hidden from users who are not the owner.
- Only the owner can delete an organization or its agents.
- Agent lock: only one user can edit an agent at a time. The lock releases after 15 minutes without activity.
- Generated files are served only to the owner of the organization.

### Organizations
- Public or private visibility.
- AI-made organization plan: describe a team, and the system makes the agent tree.
- Organization settings.

### Agents
- Avatar, status (Active, Sleep, Working, Error).
- User prompt with history.
- Attachments on an agent.
- Download an agent as a file.
- Reporting metrics, with AI suggestions for metrics.
- Async test runs with job status, cancel and dismiss.

### Views
- Edit: tree and agent editor.
- Report: org chart, with a drawer that shows the facts, metrics and last runs of an agent.
- Graph: network of agents with live run signals (pulse on running agents, sparks on links).
- Dashboard with a carousel of recent runs.

### Agent pages
- Core, Executions, Log, Artifacts, Metrics, Team.

### Knowledge base
- Folders, file upload, URLs with preview, text documents.
- Two modes for each document on an agent: side (extra context) or only (the only source).

### Skills
- Save and reuse skills. AI help to write a skill prompt.

### Applications
- Agents can build small single-page apps.
- App registry with on and off switch, and a data store for each app.

### Scheduler and system agents
- Hourly, daily and weekly runs, with pause and resume.
- System agents for backups and monitoring, with a live switch.

### Messaging
- Telegram bot: one bot for all agents, a menu to pick an agent, a binding for each chat, buttons, typing indicator.
- Slack and form webhooks.

### Data streams (read)
- CRM: accounts, contacts, leads, lead history, opportunities, tasks, owners.
- Email: inboxes, bounces and unsubscribes, Mailchimp audiences, subscribers, campaigns, automations.
- Calendar: read and add events.
- Messaging: WhatsApp, Slack, Telegram and Google Chat mentions, SMS inbox, delivery receipts, opt-outs, MMS.
- Ticketing: Zoho Desk tickets, Jira tasks and comments.
- Files: code, PDF, Excel, CSV, Word, JSON, image EXIF and GPS, OCR, folder lists.
- Cloud storage: folders, recent uploads, usage, signed-link audit.
- Database: SQL queries and table lists.
- Spreadsheets: Google Sheets read, write, create, assign, comment.
- Phone and VoIP: missed calls, inbound calls, recordings and transcripts, queue metrics, agent status.
- Forms and webhooks.
- E-signature: envelopes, audit trail, templates.
- Analytics: reports, dashboards, KPI snapshots, anomalies.
- Human approval: pending approvals, decision history, workload, timeouts.
- Digital marketing: Google Tag Manager, Search Console, Google Ads, Meta Ads, Bing Ads, LinkedIn Ads, Hotjar, GA4, website pages, speed and errors, Ahrefs.
- Software development: list apps, read app files.
- Web: fetch URL, screenshot URL, HTTP request.

### Operations (write)
- CRM: create and update leads, tasks and opportunities, route leads, post Chatter, convert leads, close won or lost, log calls.
- Email: send email, send invoice or payment link, Gmail labels, reply in thread, schedule send, Mailchimp campaigns, subscribers, tags, automations.
- Calendar: create, cancel and reschedule events, send invites, add reminders, check availability.
- Messaging: WhatsApp, Slack, Telegram, Google Chat, SMS, MMS, thread replies, file upload, emoji reactions, WhatsApp templates.
- Ticketing: create, assign, note, merge and close tickets, link a ticket to a job.
- Knowledge base: upsert articles, reindex embeddings, archive, attach source files.
- Files: make text, PDF, Excel, Word, CSV, JSON, ZIP, JPG and PNG files, AI images, write code files, merge, split, convert, compress, watermark and sign files, rename, move, copy, delete.
- Cloud storage: upload, shared links, move and copy, delete, set access.
- Database: run queries, insert, update and delete rows, run stored procedures.
- Spreadsheets: append and update rows, make sheets and tabs, clear ranges, apply formulas.
- Phone and VoIP: outbound calls, log calls, transfer, set agent status, schedule callbacks.
- Webhooks: post, retry, verify HMAC signatures, replay events.
- E-signature: send, void, remind, correct, download signed PDFs.
- Analytics: export reports, refresh datasets, subscribe, set alert thresholds.
- Human approval: request, decide, reassign, escalate, cancel.
- Digital marketing: tag and container changes, sitemaps and reindex requests, pause and budget changes for ad campaigns, offline and server-side conversions, surveys, audiences, page publish, cache purge, site rebuild, SEO projects and audits.
- Software development: make apps, write app files, delete apps and files.
- Invoke agent: run another agent.

### Run tracking
- Shared log of recent runs.
- Live run signals for the graph.
- Heartbeat log.
- Generated-file index with owner checks.
