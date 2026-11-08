# Groundswell — Project Guide for Claude

Groundswell is our entry for the Builder.io **Agent-Native Hackathon**. It turns raw feedback (GitHub issues, CSVs, pasted text) into a spatial board of themes that a human and an agent shape together, then ships top problems as evidence-backed issues.

**Read `plan.md` first.** It is the source of truth for scope, rubric strategy, data model, actions, phases and the demo script. Update it when decisions change, and tick its checkboxes as work lands.

## Working rules

- **Quality over speed.** The deadline does not cut scope. Build the best version, in the phase order in `plan.md`, so each phase leaves a working app.
- **Win the rubric.** Usefulness & Execution 40%, Creativity & Design 20%, Innovation 20%, Use of Agent-Native 20%. Before adding something, ask which line it scores on.
- **The demo is a video.** Favor interactions that read clearly on screen (live sorting, semantic zoom, ripple re-sorts, lasso + ask).
- **Real data only.** The headline demo runs on the public `BuilderIO/agent-native` issues. No fake testimonials or fabricated stats.
- **Never fabricate evidence.** Quotes must be verbatim substrings of a stored note (server-validated). Counts and scores come from SQL, never from the model.
- **Human edits win.** Notes placed by a user are pinned; agent re-sorts never move them.
- **Engine first, UI last.** Build data, agent and outputs as actions first (Phases 1–4), using only plain debug views. Do not build production UI until the user approves a direction in the Phase 5 UI vision review and it is written into `DESIGN.md`. The UI is the user's main area of shaping and refinement.

## Agent-Native conventions (from the Chat template)

- Every capability is one `defineAction` in `actions/`. The UI (`useActionQuery` / `useActionMutation`), the agent, HTTP, MCP and automations all call the same action. No parallel API routes for app data.
- All app data lives in SQL via Drizzle (`drizzle-orm/pg-core`). PGlite locally, Neon Postgres in production. Migrations are additive and named (`server/db/schema.ts`, `server/db/index.ts`, `server/plugins/db.ts`).
- Context awareness: the UI writes `navigation` and `selection` app state; the agent reads with `view-screen`. Never write `navigation` from the agent; use `navigate`.
- Live sync: `useDbSync({ realtime: { reason } })` so agent and webhook writes appear on the board while they happen.
- UI feedback within 100 ms (never over 400 ms); acknowledge before network work.
- After scaffolding, the template's `AGENTS.md` and `.agents/skills/*` hold the framework rules. Read the relevant skill before touching that area (`actions`, `storing-data`, `real-time-sync`, `context-awareness`, `frontend-design`, `security`). Search framework docs locally with `pnpm action docs-search --query "<topic>"`.
- The template ships its own `CLAUDE.md`. When scaffolding into this folder, keep **this** file and move framework guidance into `AGENTS.md` (this file links to it).

## Models

Keep model ids in one config module (`server/lib/models.ts`):
- Codebook draft: `claude-opus-5-5`
- Revisions, briefs: `claude-sonnet-5-5`
- Classification, re-sort, duplicates: `claude-haiku-5-5`

**Current agent engine (since 2026-11-08): Meta `muse-spark-1.3`.** Anthropic credits ran out, so `agent-native.config.ts` sets `agent: { engine: "meta" }`. The `meta` engine is registered in `server/lib/meta-engine.ts` (OpenAI-compatible Meta Model API, key from `META_API_KEY`). To go back to Claude, set `engine: "anthropic"` and pick the model in the chat's model picker.

## Environment

- Node **≥ 22.22** and pnpm (machine currently has Node 20.20; upgrade before scaffolding).
- LLM: `META_API_KEY` in `.env` (current engine), or `ANTHROPIC_API_KEY` / Builder.io connect.
- `GITHUB_TOKEN` (optional for import rate limits, required for filing issues).
- Never commit `.env`, tokens or personal data.

## Commands (after scaffolding)

```bash
pnpm install
pnpm dev            # local app, PGlite
pnpm typecheck
pnpm action <name>  # run an action from the CLI
pnpm test           # unit tests
```

- Local sign-in ("Continue as local dev") is `dev@local.test`. Run CLI actions as that user so their data shows in the browser: `AGENT_USER_EMAIL=dev@local.test pnpm action <name>`.
- `pnpm action seed-demo-board` creates/refreshes the demo board from `BuilderIO/agent-native`.
- The dev server owns the local PGlite database; `db-exec` and `agent-native agent` cannot open it while `pnpm dev` runs. Test the agent through the app chat instead.

## Definition of done for any feature

1. Works from the UI **and** from the agent (same action).
2. Typecheck passes; the template's doctor check passes.
3. Smoke-tested in the browser on the real seeded board, light and dark.
4. `plan.md` updated.

## Submission requirements (do not forget)

- Public Clips demo, viewable logged out.
- README with a **pre-existing vs. new work** disclosure (Chat template, libraries, data source).
- Submit via https://www.builder.io/hackathon/submit and confirm receipt (the user submits; it needs their personal details).
