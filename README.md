# ADO Ticket Reviewer

Read your Azure DevOps board and work items from a phone, and run your
`ado-ticket-analyze` skill against a ticket without opening a laptop.

The work item renders the way it does in Azure DevOps — inline screenshots,
tables, mention pills, the comment thread — and the analysis streams in as
Claude writes it.

## Why there is a server

Two parts of this cannot be done by a page on its own:

- **The PAT must not reach the browser.** Anyone who opened the app would have
  it, and Azure DevOps does not allow cross-origin calls from a random page.
- **Attachments need authentication.** ADO embeds images as
  `_apis/wit/attachments/{guid}` URLs that require the PAT. A browser loading
  one gets a sign-in page, so every screenshot in every ticket renders broken
  unless something proxies them.
- **The Claude CLI is a process.** A browser cannot spawn one.

So a small Fastify server holds the PAT, proxies Azure DevOps and its
attachments, runs the CLI, and serves the built SPA.

```
phone ──https──> this server ──> Azure DevOps
                      └────────> claude CLI (your login, your skills)
```

Where you run the server and how you reach it from a phone is up to you. It
listens on `HOST`/`PORT` and serves everything from one origin.

## Running it

```bash
npm install
cp .env.example .env     # then fill in ADO_BASE_URL, ADO_PAT, APP_PASSWORD
npm run build
npm start
```

For development, `npm run dev` runs the API and the Vite dev server together;
Vite proxies `/api` to the API.

To look at the UI with no PAT and no network, set `DEMO_MODE=true` and it
serves fixtures, including a generated placeholder image.

## Configuration

Every variable is documented in [`.env.example`](.env.example). The ones that
matter most:

| Variable | Notes |
| --- | --- |
| `ADO_BASE_URL` | Collection root, no trailing slash. `https://dev.azure.com/my-org`, or `https://tfs.internal/tfs/DefaultCollection` on-prem. |
| `ADO_PAT` | Scopes: **Work Items (Read)**, **Project and Team (Read)**, and **Identity (Read)** for avatars. |
| `ADO_API_VERSION` | Defaults to `7.1`. Azure DevOps Server may need an older version. |
| `APP_PASSWORD` | Sign-in for the app itself. **Leaving it empty makes the app open to anyone who can reach it**, and the server says so at boot. |
| `SESSION_SECRET` | Signs the session cookie. Without one, every restart signs you out. |
| `AI_SKILL` | Defaults to `ado-ticket-analyze`. Must be installed where this server runs. |
| `AI_PROMPT_TEMPLATE` | How the skill is invoked, e.g. `/{skill} {file}`. Adjust to whatever arguments your skill expects. |
| `AI_MAX_CONCURRENT` | Defaults to 1. Each run is a model turn on your own machine. |

## How the analysis works

Pressing **Run** on a work item makes the server write the ticket and its
comments to a JSON file, then invoke:

```
claude -p "/ado-ticket-analyze <file>" \
  --output-format stream-json --verbose --include-partial-messages \
  --session-id <uuid> --permission-mode dontAsk --permission-prompts none \
  --allowedTools Read Grep Glob
```

Its NDJSON output is translated into length-prefixed frames and streamed to the
browser, which renders the markdown as it arrives and shows the real cost when
the turn ends. Follow-up questions reuse the session via `--resume`. The wire
format is specified in [`docs/PROTOCOL.md`](docs/PROTOCOL.md).

The subprocess does **not** inherit `ADO_PAT`, `APP_PASSWORD` or
`SESSION_SECRET`; it runs a model with tool access, and those have no business
being reachable from it. The tool allowlist is narrow by default — widen
`AI_ALLOWED_TOOLS` if your skill needs more.

## Layout

| Path | What it holds |
| --- | --- |
| `server/src/ado/` | REST client, work item mapping, HTML sanitizing, attachment proxying |
| `server/src/ai/` | Claude subprocess, prompt building, concurrency cap |
| `server/src/routes/` | HTTP surface and the session gate |
| `web/src/` | React SPA: board, work item, comment thread, analysis panel |
| `shared/` | Types, the framing codec, and the offline readiness check |

## Scripts

```bash
npm run dev        # API + Vite dev server
npm run build      # typecheck, then build the SPA
npm start          # serve API and built SPA
npm test           # unit tests
npm run typecheck  # both tsconfigs
```

## Known limits

- **Read-only.** No editing, commenting, or moving cards.
- **Boards only.** Backlogs, queries and sprints are not exposed.
- A board fetches at most 400 work items.
- Azure DevOps Server (on-prem) is supported by configuration but has not been
  tested against a real instance.
