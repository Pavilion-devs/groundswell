# Groundswell — Master Plan

> **Hear what your users keep telling you.**
> Groundswell turns hundreds of raw GitHub issues, reviews and support tickets into a living board of themes that you and an agent shape together — then ships the top problems as evidence-backed issues.

Built with [Agent-Native](https://www.agent-native.com) for the [Builder.io Agent-Native Hackathon](https://www.builder.io/hackathon).

**Guiding principle: we build the best version of this, not the fastest.** Scope is driven by what wins and what is genuinely useful. The work is ordered so the core loop is excellent first, then each layer adds depth.

---

## 1. Hackathon facts (from the live rules, read 2026-11-07)

| Item | Detail |
| --- | --- |
| Requirement | A functional app built with Agent-Native |
| Demo | **Public Clips recording** (viewable without login) of the real app in use — https://clips.agent-native.com |
| Submit | Form at https://www.builder.io/hackathon/submit (project description, team, contact, public Clips link). Recording alone does not submit. |
| Disclosure | Must identify pre-existing work, templates, libraries, third-party assets, and what changed during the event |
| Encouraged | Public repo and/or live deployment |
| Submission deadline | Mon **Nov 9, 2026, 11:59 PM PT** (Nov 10, 07:59 UTC) |
| Winners | Nov 13 — $5k / $2.5k / $1.5k / $750 / $250 |
| Recognition | Best Overall, Best Productivity, Most Creative, Best Use of Agent-Native |

### Rubric → how we win each line

| Criterion | Weight | Our answer |
| --- | --- | --- |
| **Usefulness & Execution** | 40% | Real, expensive problem (feedback synthesis takes PMs days; Dovetail/Productboard cost $$$). Complete flow: import → themes → human reshape → prioritize → file issue. Run on **real data**: Agent-Native's own 1,000+ GitHub issues. Polished, no dead ends, public live demo. |
| **Creativity & Design** | 20% | A spatial board with **semantic zoom** (zoomed out: theme bubbles sized by volume; zoomed in: individual cards), notes that visibly fly into place as the agent works, an agent presence on the canvas. Stands apart from the sea of list/queue "desks". |
| **Innovation** | 20% | **Teach by dragging.** Every manual move is a correction the agent generalizes: it rewrites the theme definitions (the *codebook*), shows you the diff, and re-sorts similar notes with a visible "ripple". The human steers the model through direct manipulation, not prompts. |
| **Use of Agent-Native** | 20% | One action layer powers drag-and-drop, agent chat, HTTP, MCP and automations. Selection context (lasso → "split these"), live sync while the agent works, webhook automation for new issues, scheduled digest, MCP App card inside Claude/ChatGPT, public share link. |

---

## 2. Competitive landscape

~28 public entries found on GitHub (search: "agent-native hackathon"). Strong ones: `igoreduardoai/evaldesk`, `Wertyk/muscle-memory`, `obasky-dev/aftermath`. The dominant shape is a **desk/queue**: the agent proposes rows, a human approves. Many duplicates of the same idea (4+ hackathon/bounty finders, several expense/subscription trackers).

**Gaps we exploit**
1. Almost nobody has a **spatial, direct-manipulation interface** where human and agent edit the same object live.
2. Few run on **real, recognizable data** the judges care about.
3. Few show the agent **learning from UI interactions** rather than from chat.

**Avoid overlap** with Builder's own templates (chat, mail, calendar, crm, slides, forms, analytics, tasks, clips, design, videos, plan, brain, dispatch, content, assets) — we are a new domain.

---

## 3. Product

### Who it's for
Product managers, founders, DevRel and OSS maintainers who have a pile of feedback and need to know *what to fix next* — with receipts.

### The core loop
1. **Import** a source: a public GitHub repo (issues + reactions + comment counts), a CSV, or pasted text.
2. **Draft codebook**: the agent reads a sample and proposes 8–15 themes, each with a name, a one-line definition, include/exclude rules and example notes.
3. **Sort**: notes are classified in batches and stream onto the board live. Low-confidence notes land in an **Unsorted tray** instead of being forced.
4. **Reshape (human)**: drag notes between themes, merge themes, rename, lasso-select and ask the agent to split/relabel/summarize the selection.
5. **Teach**: corrections accumulate; the agent proposes a codebook revision (shown as a diff), you approve, and it re-sorts affected notes with a ripple animation.
6. **Prioritize**: transparent score per theme (volume, unique authors, reactions, recency) with tunable weights.
7. **Ship**: open a theme → agent writes an **Insight Brief** (problem, impact, verbatim evidence quotes with links, duplicates collapsed, suggested next step) → one click files a GitHub issue (after approval) or copies Markdown.
8. **Stay current**: a webhook automation sorts every new issue as it arrives; a weekly digest summarizes what moved.

### Key screens
- **Sources** — connect a repo / upload CSV, import progress.
- **Board** (hero) — infinite canvas, theme islands, semantic zoom, Unsorted tray, agent sidebar.
- **Theme drawer** — notes list, Insight Brief, duplicates, "file issue".
- **Codebook** — editable theme definitions with revision history and diffs.
- **Share view** — public read-only board/brief link for judges and stakeholders.

### Signature moments (designed for the demo video)
1. **"The swell"** — 1,000 notes rain onto the board and settle into themes in seconds.
2. **Semantic zoom** — pull back and themes become bubbles sized by volume; push in and you read individual issues.
3. **Lasso + ask** — select a messy cluster, say "split this into install problems vs. runtime crashes", watch it divide in place.
4. **Teach by dragging** — drag 3 notes out of "Docs" into "Auth"; the agent proposes a sharper definition and 14 other notes ripple across on their own.
5. **"47 issues are really 9 problems"** — duplicate collapse inside a theme.
6. **Ship it** — Insight Brief with real quotes → filed GitHub issue.
7. **Anywhere** — ask Claude "what are agent-native users struggling with?" and the board card renders inline via MCP Apps.

---

## 4. Agent design

### Principles
- **Never fabricate.** Every evidence quote must be a verbatim substring of a source note; the server validates spans and drops anything that does not match. Counts come from SQL, never from the model.
- **Show the work.** Each classification stores confidence + a one-line rationale + the quoted span.
- **The human has the final word.** Manual placements are **pinned** and never overridden by re-sorts.
- **Deterministic actions, AI in the agent.** Actions do focused data work; LLM calls happen in dedicated pipeline actions or agent turns.

### Pipeline
| Stage | Model | Notes |
| --- | --- | --- |
| Codebook draft | `claude-opus-5-5` (fallback `claude-sonnet-5-5`) | Stratified sample (~150 notes); outputs themes with definitions, include/exclude rules, examples |
| Classification | `claude-haiku-5-5` | Batches of ~25 notes with the codebook; returns theme id, confidence, rationale, quote span. Streams results row by row so the board animates |
| Codebook revision | `claude-sonnet-5-5` | Input: current codebook + corrections; output: proposed edits as a structured diff |
| Re-sort | `claude-haiku-5-5` | Only notes likely affected (same source theme as corrections, low confidence, or near corrected notes) |
| Duplicate detection | `claude-haiku-5-5` | Within a theme; groups near-identical reports |
| Insight Brief | `claude-sonnet-5-5` | Grounded in theme notes; quotes validated server-side |

Model ids live in one config file so they are easy to swap. LLM provider via Builder.io connect or `ANTHROPIC_API_KEY`.

### Learning from corrections
- Every manual move writes a `corrections` row (note, from theme, to theme, optional reason).
- After N corrections (default 3) or on demand, the agent drafts a codebook revision and posts it to the UI as a reviewable diff.
- On approve: new codebook version, targeted re-sort, ripple animation on notes that moved, undo available.
- Corrections also go into agent memory so a chat follow-up ("why did you move these?") is answerable.

### Agent skills (`.agents/skills/`)
- `feedback-synthesis` — how to build and revise a codebook, quality bar for themes.
- `insight-brief` — structure and evidence rules for briefs.
- `board-operations` — which actions to use for which board edits; always prefer actions over free-text answers.

---

## 5. Agent-Native features we use

| Feature | How |
| --- | --- |
| `defineAction` shared actions | Every board operation is one action used by drag-and-drop, agent chat, HTTP, MCP |
| `useActionQuery` / `useActionMutation` | All UI data paths |
| Live sync (`useDbSync` with `realtime`) | Board updates while the agent works, across tabs and from the webhook |
| Context awareness (`navigation`, `selection`, `view-screen`) | Agent knows the open board, zoom level, selected notes/themes |
| Agent sidebar / chat | Natural-language board edits and questions |
| Automations (webhook + schedule) | New GitHub issue → classify onto board; weekly digest |
| MCP server + MCP Apps (`embedApp` / `embedRoute`) | Board / theme card renders inline in Claude and ChatGPT |
| Sharing | Public read-only link to a board or brief |
| Skills + observational memory | Domain expertise and memory of corrections |
| Generative UI (stretch) | Agent renders a quick chart in chat (e.g. theme trend over time) |
| Messaging (stretch) | Weekly digest to Slack |
| A2A (stretch) | Delegate "make a voice-of-customer deck" to Builder's Slides app |

---

## 6. Data model (Drizzle, Postgres / PGlite)

```
boards        id, title, description, owner columns, share settings, created_at
sources       id, board_id, kind (github|csv|text), config json (repo, filters), status, last_synced_at, stats json
notes         id, board_id, source_id, external_id, url, title, body, author, author_avatar,
              reactions int, comments int, created_at_src, labels json, state
codebooks     id, board_id, version int, status (active|proposed|archived), created_by (agent|user), created_at
themes        id, board_id, codebook_id, key, name, definition, include_rules, exclude_rules, color, x, y, priority_weight
placements    note_id, board_id, theme_id (null = unsorted), confidence, rationale, quote_start, quote_end,
              pinned bool, placed_by (agent|user), updated_at
corrections   id, board_id, note_id, from_theme_id, to_theme_id, reason, created_at, consumed_by_codebook_id
duplicates    id, board_id, theme_id, canonical_note_id, member_note_ids json
briefs        id, board_id, theme_id, body json (problem, impact, evidence[], next_step), filed_issue_url, created_at
runs          id, board_id, kind (codebook|classify|revise|resort|dedupe|brief), status, progress, error, started_at, finished_at
```
Indexes on `(board_id, theme_id)` for placements, `(board_id, external_id)` unique for notes.

---

## 7. Action catalog

**Sources & import**
`create-board`, `add-github-source`, `import-csv`, `import-text`, `sync-source`, `list-sources`

**Pipeline**
`draft-codebook`, `classify-notes`, `propose-codebook-revision`, `apply-codebook-revision`, `resort-notes`, `detect-duplicates`, `get-run-status`

**Board edits (shared by UI and agent)**
`move-notes`, `pin-note`, `create-theme`, `rename-theme`, `update-theme-definition`, `merge-themes`, `split-theme`, `delete-theme`, `layout-themes`, `set-priority-weights`

**Reads**
`get-board`, `list-themes`, `get-theme`, `search-notes`, `get-note`, `get-priorities`, `get-codebook`, `get-codebook-diff`, `view-screen`

**Output**
`generate-brief`, `file-github-issue` (approval required), `export-markdown`, `share-board`

**Automation hooks**
`ingest-webhook-issue`, `weekly-digest`

---

## 8. Design direction (starting hypothesis — final direction is chosen with the user in Phase 5)

- Calm, editorial look: warm paper background (light) / deep ink (dark), generous whitespace, one serif display face for headings, a clean sans for UI.
- Themes are soft tinted **islands** with a name plate and volume count; notes are compact cards (title, author avatar, 👍 count, source icon).
- **Semantic zoom** with three levels: bubbles → piles (top notes + "+38 more") → full cards. Keeps 1,000+ notes fast.
- Motion with layout (FLIP) animations: notes travel to their theme; ripple highlight on re-sorted notes; agent presence shown as a subtle glowing cursor/label on the theme it is working on.
- Canvas built in-house (pan/zoom transform + `@dnd-kit`) since the toolkit has no canvas model; Agent-Native `canvas-interactions` helpers where they fit.
- Keyboard: `space`-drag pan, `cmd+scroll` zoom, `L` lasso, `cmd+I` ask agent about selection.
- Follow the template's `frontend-design` skill and shadcn components for chrome (sidebar, drawers, dialogs).

---

## 9. Architecture & stack

- Scaffold: `npx @agent-native/core@latest create groundswell --standalone --template chat`, then move into this folder root.
- React + React Router (template), Nitro server, Drizzle over PGlite locally / Neon Postgres in production.
- GitHub data via REST API (`GITHUB_TOKEN` optional for higher rate limits; required for filing issues).
- Deploy: Vercel (or Netlify) + Neon. Public demo identity mode so judges land in the app without signing up; destructive actions disabled in demo mode.
- Pre-seeded demo board on `BuilderIO/agent-native` so judges see the result without spending tokens. Live imports in the public demo capped (e.g. ≤300 issues) to control cost.

---

## 10. Build phases

Each phase ends with a working, demoable app.

### Phase 0 — Foundation
- [x] Node ≥ 22.22 — 22.23.1 was already installed via nvm; pinned in `.nvmrc`
- [x] Scaffold from the Chat template (`@agent-native/core` 0.226.0) into this folder; template baseline kept as the first commit for the disclosure; work on `main`
- [ ] Connect an LLM (Builder.io or `ANTHROPIC_API_KEY`) — **waiting on the user**
- [x] Schema + migrations (`server/db/schema.ts`, `server/plugins/db.ts` v1 + v2 tenant scope); typecheck and doctor clean
- [ ] Seed script — moved to Phase 1, since it needs the import actions
- **Done when:** app runs locally, agent answers, tables exist.

### Phase 1 — Data in
- [ ] GitHub importer (paginated issues, reactions, comment counts, labels; skip PRs), CSV + text import
- [ ] Import runs from CLI (`pnpm action add-github-source ...`) and agent chat, with progress in `runs`
- **Done when:** all agent-native issues are in SQL and listed in a plain debug view.

> **Order decision: engine first, UI last.** Phases 1–4 build the whole engine (data, agent, learning, outputs) as actions, testable from the CLI and agent chat with only plain debug views. The UI is shaped with the user in Phase 5 *before* any real UI is built, using mockups filled with the real themes the engine produced. Real data makes the design review honest; generic lorem-ipsum mockups hide problems.

### Phase 2 — Agent sorting (engine)
- [ ] `draft-codebook`, streaming `classify-notes` (rows written as batches finish), `get-run-status`
- [ ] Quote-span validation, confidence → Unsorted
- [ ] Board-edit actions: `move-notes`, `merge-themes`, `split-theme`, `rename-theme`, `create-theme`, `pin-note`
- [ ] Context-awareness plumbing: `selection` / `navigation` contract the UI will write later; agent can act on "these notes"
- [ ] Plain debug view (themes → notes list) to eyeball quality
- **Done when:** one command turns the agent-native import into a sensible set of themes, and the agent can split/merge/move from chat.

### Phase 3 — Teach by dragging (engine)
- [ ] Corrections log, `propose-codebook-revision` (structured diff), `apply-codebook-revision`, undo
- [ ] Targeted `resort-notes`; pinned notes respected; record which notes moved (drives the ripple later)
- **Done when:** recording 3 corrections produces a sensible codebook diff and re-sorts related notes correctly.

### Phase 4 — Prioritize & ship (engine)
- [ ] Priority score with tunable weights (`get-priorities`, `set-priority-weights`)
- [ ] `detect-duplicates`
- [ ] `generate-brief` (validated quotes), `file-github-issue` with approval, `export-markdown`
- [ ] Webhook automation for new issues (`ingest-webhook-issue`); weekly digest job
- **Done when:** a theme becomes a filed issue with real quotes, and a new issue sorts itself onto the board.

### Phase 5 — UI vision review (with the user, before building UI)
- [ ] Study references together: Builder's own Agent-Native apps (Design, Plan, Slides at agent-native.com/apps) for framework-native patterns, plus canvas/insight tools (FigJam, Miro, tldraw, Dovetail, Linear) for interaction ideas
- [ ] Produce **3 distinct UI directions** as clickable mockups populated with the real themes from Phase 2–4 (e.g. *Editorial Canvas*, *Dense Workbench*, *Living Map*), each showing the board, semantic zoom, the theme drawer and the codebook diff
- [ ] User picks, mixes and refines; iterate until approved
- [ ] Lock the result in `DESIGN.md` (type, color tokens, spacing, motion, components, key screens)
- **Done when:** the user signs off on `DESIGN.md`. No production UI is built before this.

### Phase 6 — Build the UI
- [ ] Board: canvas pan/zoom, theme islands, cards, Unsorted tray, semantic zoom, 1,000+ notes fast
- [ ] Drag-and-drop and lasso wired to the existing actions; selection written to app state
- [ ] Live sync, "the swell", ripple re-sort animation, agent presence
- [ ] Sources, theme drawer + Insight Brief, codebook diff review, priorities panel
- [ ] Public share link; MCP server + MCP App card for board/theme
- [ ] Stretch: Slack digest, generative-UI trend chart, A2A to Slides
- **Done when:** every engine action is reachable from the UI and the demo script runs end to end.

### Phase 7 — Polish, deploy, submit
- [ ] Design pass (light/dark, empty states, loading, errors, onboarding tour)
- [ ] Deploy (Vercel + Neon), demo mode, seeded board
- [ ] README: problem, how it works, architecture, **pre-existing vs. new work disclosure**, run instructions
- [ ] Record public Clips demo (script below), verify it plays logged out
- [ ] Submit form, confirm receipt

---

## 11. Demo script (Clips, ~2.5 min)

1. **Hook (0:00–0:15)** — "Agent-Native has 1,000+ GitHub issues. What are users actually asking for?" Paste `BuilderIO/agent-native`.
2. **The swell (0:15–0:40)** — codebook appears; notes stream into themes live.
3. **Zoom (0:40–0:55)** — pull back to bubbles, push into the biggest theme.
4. **Lasso + ask (0:55–1:15)** — split a messy theme in place.
5. **Teach by dragging (1:15–1:45)** — move 3 notes; approve codebook diff; ripple.
6. **Ship (1:45–2:10)** — duplicates collapse; Insight Brief with real quotes; file the issue.
7. **Everywhere (2:10–2:30)** — new issue arrives via webhook and lands on the board; ask Claude, the card renders inline. Close on the one-line pitch.

---

## 12. Submission checklist
- [ ] Live URL works logged out (demo mode)
- [ ] Public repo with README + disclosure section (Chat template, libraries, data source)
- [ ] Public Clips link plays without login
- [ ] Form submitted, receipt confirmed
- [ ] Nothing sensitive in the video or repo (tokens, emails)

---

## 13. Risks & mitigations
| Risk | Mitigation |
| --- | --- |
| Canvas performance with 1,000+ notes | Semantic zoom with piles; virtualize card rendering; CSS transforms only |
| LLM cost / latency for large imports | Haiku for classification, batching, caching by note hash, pre-seeded demo board |
| Bad themes | Opus for codebook, Unsorted tray instead of forcing, human edits pinned |
| Hallucinated quotes | Server-side substring validation; drop invalid spans |
| GitHub rate limits | Optional token, conditional requests, cache imports |
| Judges can't log in | Public demo identity, read-only share link |
| Framework learning curve | Follow template skills (`.agents/skills/*`), local `pnpm action docs-search` |

---

## 14. Decisions for the user
- Final product name (working: **Groundswell**)
- GitHub account/repo for the public repository
- LLM provider: Builder.io connect vs. our own `ANTHROPIC_API_KEY`
- Whether the public demo allows live imports (cost) or only the seeded board
- Deployment target (Vercel recommended) and Neon account
