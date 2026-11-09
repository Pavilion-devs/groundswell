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
- **Deterministic actions, AI in the agent.** Actions do focused data work. Framework rule (actions skill): no LLM calls inside app actions, except `@agent-native/core/decisions` for classification and scoring. So the agent itself does synthesis (drafting the codebook, revisions, briefs) and saves results through focused actions; bulk classification uses the `decisions` module. Phase 2 starts by reading that module and adjusting the pipeline table below to fit it.

### Pipeline (revised in Phase 2 to fit the framework)

The framework forbids model calls inside actions, and its one exception (`@agent-native/core/decisions`) only supports OpenAI or the Builder.io provider and returns a label without rationale or quote. So **the agent does the AI work and actions do the data work**:

| Stage | Who | Actions | Notes |
| --- | --- | --- | --- |
| Codebook draft | Main agent (app model, Sonnet/Opus) | `sample-notes` → `save-codebook` | Stratified, engagement-weighted sample across sources, labels and time. 6–14 themes with name, definition, include/exclude rules |
| Classification | **Agent team**: the main agent spawns parallel `theme-sorter` sub-agents (one per slice) that show as live chips in chat | `start-sort-run`, `get-notes-for-sorting` (stable hash partition `slice i of n`), `place-notes` (atomic batch of ~25) | Server validates theme keys and that every quote is a verbatim substring; confidence < 0.5 goes to Unsorted with the best guess kept as `suggested_theme_id`. Pinned notes are never touched |
| Verify | Main agent | `get-board`, `finish-sort-run` | Reports proof (M of N placed), per reliable-mutations |
| Board edits | UI drag/lasso **or** agent on request | `move-notes`, `create-theme`, `update-theme`, `merge-themes`, `split-theme`, `delete-theme` | A move from the UI (`caller: frontend`) pins the note and records a correction (Phase 3 learns from it) |
| Codebook revision | Main agent (Phase 3) | `propose-codebook-revision` / `apply-codebook-revision` | From corrections |
| Duplicates, Insight Brief | Main agent (Phase 4) | `save-duplicate-groups`, `save-brief` | Quotes validated server-side |

Profiles and skills ship as shared agent resources written at boot (`agents/theme-sorter.md`, `skills/feedback-synthesis/SKILL.md`), so they appear in the app's Resources tab and can be edited by the user.

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
`sample-notes`, `save-codebook`, `start-sort-run`, `get-notes-for-sorting`, `place-notes`, `finish-sort-run`, `list-corrections`, `propose-codebook-revision`, `get-codebook-revision`, `apply-codebook-revision`, `reject-codebook-revision`, `undo-codebook-revision`, `detect-duplicates`, `get-run-status`

**Board edits (shared by UI and agent)**
`move-notes`, `pin-note`, `create-theme`, `rename-theme`, `update-theme-definition`, `merge-themes`, `split-theme`, `delete-theme`, `layout-themes`, `set-priority-weights`

**Reads**
`get-board`, `list-notes`, `get-note`, `get-priorities`, `list-duplicate-groups`, `get-codebook`, `get-codebook-revision`, `view-screen`

**Output**
`get-brief-context`, `save-brief`, `get-brief`, `file-github-issue` (approval required), `export-markdown`, `share-board`

**Automation hooks**
`ingest-github-issue` (webhook automation), `get-digest-data` + `save-digest` (scheduled automation)

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
- Agent model: Meta `muse-spark-1.3` via the `meta` engine (`server/lib/meta-engine.ts`, `META_API_KEY`) while Anthropic credits are out; Claude ids stay in `server/lib/models.ts` and come back with `agent.engine: "anthropic"`.
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
- [x] GitHub importer: GraphQL with a token (issues only, ~1 request per 100), REST search without one (anonymous, 1,000 cap); bots skipped by default; incremental re-sync; idempotent re-add
- [x] CSV import (papaparse, auto-detected columns, http(s)-only links, stable row ids) and pasted-text import (paragraph/line split, dedupe)
- [x] Board actions (`create/list/get/delete-board`), `list-notes`, `get-note`, `get-run-status`; runs tracked with a state machine
- [x] Works from CLI and from the in-app agent chat (verified: grounded answer over real issues); action table in `AGENTS.md`
- [x] `seed-demo-board` (hidden from the agent); `/debug` plain view; parsing unit tests
- **Done:** 335 real human-filed `BuilderIO/agent-native` issues on the demo board.

**Phase 1 findings that shape later phases**
- Of 1,005 agent-native issues, **665 are bot health-check reports**. Filtering them is on by default and is itself a demo moment ("665 bot reports filtered out").
- That leaves **335 human issues**, a good board size. For a bigger "swell" moment, consider a second demo board on a larger, recognizable repo, and an option to include issue comments as notes.
- **Reactions are sparse** on this repo (mostly 0–1). Priority scoring should lean on comment count and distinct reporters too.
- Add a `GITHUB_TOKEN` to `.env` for local work: anonymous search allows 10 requests/minute, so a second import within a minute is rate-limited.

> **Order decision: engine first, UI last.** Phases 1–4 build the whole engine (data, agent, learning, outputs) as actions, testable from the CLI and agent chat with only plain debug views. The UI is shaped with the user in Phase 5 *before* any real UI is built, using mockups filled with the real themes the engine produced. Real data makes the design review honest; generic lorem-ipsum mockups hide problems.

### Phase 2 — Agent sorting (engine)
- [x] Codebook: `sample-notes` (stratified), `save-codebook` (versioned, placements carried by key), `get-codebook`
- [x] Sorting by an agent team: `start-sort-run` (hash-partitioned slices), `get-notes-for-sorting`, `place-notes` (atomic batch), `finish-sort-run` (proof); shared `theme-sorter` profile + `feedback-synthesis` skill shipped as agent resources
- [x] Quote-span validation (verbatim, whitespace/curly-quote tolerant, mapped back to source), confidence < 0.5 → Unsorted with `suggested_theme_id`
- [x] Board-edit actions: `move-notes` (pins + corrections), `create-theme`, `update-theme`, `merge-themes`, `split-theme`, `delete-theme`
- [x] Context contract: `navigation {view, boardId}`, tab-scoped `selection {boardId, noteIds, themeIds}`, enriched `view-screen`; board pages opt into realtime sync
- [x] Plain debug view: themes, Unsorted with suggestions, quotes, pins, note checkboxes writing the selection
- [x] Unit tests for quotes, sampling, keys (17 passing); end-to-end CLI test of every guard
- **Done when:** one command turns the agent-native import into a sensible set of themes, and the agent can split/merge/move from chat.

**Phase 2 status and findings (2026-11-07)**
- One chat message ("Sort my Agent-Native feedback board into themes") → codebook of 13 themes → 4 parallel `theme-sorter` sub-agents → 300+ notes placed in about 2.5 minutes.
- Iteration 1 → 2, measured on the same 340 issues: notes in a theme 60% → **84%**; themed notes with a verified quote 33% → **100%** (0 quotes rejected). Fixes: required quotes with `quoteMisses` retry, and the skill's guidance for non-feedback trackers.
- Bug found and fixed: colour assignment looped forever with more than 12 themes (hung the server); now a bounded least-used picker with tests.
- **Closed on Meta Muse Spark (2026-11-08).** Anthropic credits ran out, so the app's agent now runs on `muse-spark-1.3` through the Meta Model API (OpenAI-compatible, `https://api.meta.ai/v1`), registered as the `meta` engine in `server/lib/meta-engine.ts` and selected in `agent-native.config.ts`. Switching back is a one-line config change.
  - Last 33 notes: sorted from chat in 1m 12s, 26 into themes and 7 to Unsorted. Board: 285 of 340 in themes, 16% Unsorted.
  - Coverage loop (`scope: "unsorted"`), run on request because Unsorted was under the 20% trigger: 2 new themes ("Native Resources and Skills break", "Framework data layer migrations and stores break"), 13 of 55 Unsorted notes moved in, 13/13 quotes verified, 0 rejected. Board: **298 of 340 in themes (88%), every themed note has a verified quote**, 12% Unsorted.
  - Selection from chat: selected 8 "Design nightly shard N/8" notes on the debug page and said "split these". The agent read the selection via `view-screen` and split exactly those 8 into "Design nightly shards hit 37-minute cap" in 23 s (SQL-verified).
- **Muse Spark findings and fixes (2026-11-08):** the first runs on Muse sorted 55 notes solo instead of spawning sorters, ended a turn without its report, and sent one mistyped note id (rejected by the server, as designed). Fixed by putting the next step in the action results, not only in the skill:
  - `start-sort-run` returns `mode` ("solo" or "team") and a `nextStep` that says exactly how many `theme-sorter` sub-agents to spawn and forbids sorting yourself in a team run.
  - `finish-sort-run` returns a `nextStep` that triggers the coverage pass above 20% Unsorted and requires the written report.
  - The skill, system prompt and sorter profile say to copy ids exactly and never end a turn on a tool call; `get-note`'s not-found error says where to copy ids from.
  - Engine bug found on the way: sub-agent runs build the engine without a key, so `server/lib/meta-engine.ts` now resolves `META_API_KEY` per request through the secret store (registered with `registerRequiredSecret`). In sub-agent runs a store lookup can fail and still return the deployment value; both the Meta key and `getGithubToken` now use the value when one comes back.
  - **Verified:** "Re-sort the Unsorted notes" → `mode: team` → 2 parallel `theme-sorter` sub-agents → 42/42 processed, 15 into themes (15/15 quotes verified, 0 rejected), full written report, 1m 51s. **Board: 313 of 340 notes in 16 themes (92%), every themed note quoted, 8% Unsorted.**
  - Cosmetic: the team card list can show a stale duplicate "sorter slice 0/2" label while running (framework UI; our Phase 6 board will show runs itself).
- **Follow-ups:** a stale-run reaper (a run whose agent dies stays `running`; closing it with `finish-sort-run` works); a theme flag for non-feedback themes so priorities and briefs skip them (done in Phase 4: `themes.internal`).

### Phase 3 — Teach by dragging (engine)
- [x] Corrections log (`move-notes` records them; `list-corrections` reads them with note, from/to theme and the user's reason)
- [x] `propose-codebook-revision`: structured diff (update / add / remove), every change cites the corrections behind it, server-validated (keys exist, one change per theme, no no-op updates, unique names, ≥2 themes, cited corrections must be pending); newer proposal supersedes an open one
- [x] `get-codebook-revision` (before/after diff, evidence, impact estimate, undoable), `apply-codebook-revision`, `reject-codebook-revision`, `undo-codebook-revision`
- [x] Targeted re-sort (`scope: "revision"`): unpinned notes in the touched themes (changed themes plus the from/to themes of the corrections) and Unsorted; pinned notes never move; closed runs refuse writes so an undo cannot be overwritten by late sorters
- [x] Ripple data: `finish-sort-run` on a revision re-sort compares against the pre-revision snapshot, stores `movedNoteIds` on the run and returns moves plus `moveGroups` (exact counts per route)
- [x] Exact undo: applying snapshots every placement by theme key (`codebooks.restore_snapshot`, migration v4); undo restores it, keeps notes the user moved after the revision, stops a running re-sort, re-opens the corrections, and refuses if themes were edited since
- [x] Hand-off between UI and agent: the debug page applies on "approve" and hands the re-sort to the agent with `sendToAgentChat`; `get-run-status` returns `sorterBrief` and `nextStep` for any open sort run
- [x] Skill step 6 "Learn from corrections"; system prompt; 8 new unit tests (27 total)
- **Done when:** recording 3 corrections produces a sensible codebook diff and re-sorts related notes correctly. ✅

**Phase 3 results on the real board (2026-11-08, Meta Muse Spark 1.3)**
- Taught with 3 moves: three "Design E2E triage" issues that describe real Design editor bugs, moved from "Maintainer and CI trackers" to "Bugs in Plan, Content, Calendar, Mail and Design apps", reason "E2E triage reports that describe a real Design editor bug are product bugs, not CI noise".
- Proposal in 39 s (UI button) and 54 s (chat), same pattern both times: two `update`s that sharpen both definitions and add exclude rules naming the sibling theme; every change cites all 3 corrections; impact 117 notes.
- Re-sort (3 parallel sorters, 2m 11s): 25 notes moved. 5 of the 7 untaught "Design E2E triage" notes followed on their own; the one about a test locator ("sidebar New chat locator matches two buttons") correctly stayed in Maintainer; 3 other "Design E2E:" product-behaviour notes also moved; several "[Framework] Refactor" tasks moved to the theme of the problem they fix. Pinned notes untouched; every themed note quoted.
- Side effect worth knowing: the sharper "Bugs in Plan…" theme no longer claims apps it does not name (CRM, Assets, a generic error screen), so 6 such notes went to Unsorted. Honest, and a hint that this theme wants a split (a good demo follow-up: "split Bugs by app").
- Undo verified exact: a fingerprint of all 340 placements after undo matched the pre-revision snapshot; v1 active again, corrections pending again.
- Found and fixed while testing: the agent miscounted a move group (said 9, SQL said 8), so `finish-sort-run` now returns `moveGroups` with exact counts and the report must quote them.
- Chat-only path verified too: "Learn from my corrections" → same proposal in 54 s → user says "Yes, apply it." → the agent applied v3, ran 3 sorters (2m 47s) and reported 23 moves in 9 route groups, every count matching SQL. 9 of the 10 "Design E2E triage" notes are now in the Design bugs theme (3 taught + 6 learned); only the test-locator one stayed. **Board: 310 of 340 in themes, every themed note quoted, 9% Unsorted.**

### Phase 4 — Prioritize & ship (engine)
- [x] Priorities from SQL only: `get-priorities` (volume with duplicates collapsed, distinct reporters, engagement = comments + 2 × reactions, recency within 30 days of the board's newest note; each normalised against the biggest feedback theme, weighted, with a per-metric breakdown), `set-priority-weights` (0-5 each, reset)
- [x] Internal themes (`themes.internal`, migration v5): not product feedback, kept on the board, listed apart without a rank; set via `update-theme` / `create-theme` / `save-codebook`, carried through revisions and splits
- [x] Duplicates: `save-duplicate-groups` (validated: notes in the theme, canonical included, ≥2 per group, no note in two groups; replaces the theme's groups), `list-duplicate-groups`; counted by where notes sit now, so groups survive codebook revisions
- [x] Insight Briefs: `get-brief-context` (one call: definition, SQL facts, duplicate groups, most-engaged notes with text and verified quotes), `save-brief` (every quote verbatim or nothing is saved; ≥2 distinct reports; facts computed by the server and stored as `briefs.metrics`), `get-brief`
- [x] `export-markdown` (a brief, or a board report with the priority table) and `file-github-issue` (`needsApproval` unless `dryRun`; target defaults to the board's GitHub source; files once and stores the issue URL)
- [x] New issues sort themselves: `ingest-github-issue` maps a GitHub `issues` webhook payload exactly like an import (skips PRs, bots, deletions; idempotent; scoped to boards the caller can edit), driven by a framework webhook automation the agent creates (skill step 11)
- [x] Weekly digest: `get-digest-data` (SQL facts for the period) and `save-digest` (server recounts, stores in `digests`, posts to the Inbox with an idempotency key), driven by a scheduled automation (`0 9 * * 1`)
- [x] Skill steps 7-11, system prompt, `nextStep` on every Phase 4 result that requires the written reply; 9 new unit tests (36 total); debug page "Prioritize and ship" panel
- **Done when:** a theme becomes a filed issue with real quotes, and a new issue sorts itself onto the board. ✅ (filing verified as a dry run; a real filing waits for the user's approval and a target repo)

**Phase 4 results on the real board (2026-11-08, Meta Muse Spark 1.3)**
- "What should we fix first?" → ranked answer in 22 s, every number matching SQL, and the agent itself flagged "Maintainer and CI trackers" (#5 with 54 notes but 5 reporters) as internal-looking. Marked it and "Design nightly shards" internal; new top 3: Wants hooks (91.1), Agent runs stall (86.2), Docs 404s (74).
- "Find the duplicates in Docs 404s, then write a brief" → 3 duplicate groups (30 notes = 27 distinct problems) and the brief "Docs 404s and fresh workspaces fail to install": 4 verbatim quotes from 4 reporters with issue links, SQL facts, one next step (2m 25s). `file-github-issue` dry run shows the exact issue for BuilderIO/agent-native; nothing posted.
- Webhook: the agent created `groundswell-new-issues-…` from one chat message. Replayed real issue #8776 (removed from the board first, re-delivered as a GitHub `issues` payload): ingested, sorted in its own 1-note run, quote verified, no duplicate on re-delivery. It landed in "Security and access-control gaps" (0.9); before the replay it sat in "Multi-app workspace and Dispatch problems" (0.6). Both fit an SSRF-guard-in-a-workspace bug.
- Weekly digest: the agent created the Monday schedule and ran it once: "Week of Nov 1: hooks requests lead 26 new notes", numbers matching `get-digest-data`, posted to the Inbox.
- **Bugs found and fixed:** (1) the engine set in `agent-native.config.ts` never reached the server (it is build config), so background automations fell back to Anthropic; the Meta engine is now set with runtime `defineAppConfig` in `server/lib/meta-engine.ts`. (2) Local background work dispatched to port 3000; `.env` now sets `AGENT_NATIVE_SELF_DISPATCH_URL=http://localhost:8080` (deploys use their real URL). (3) Score rounding gave 100.1 and one bad weight discarded all weights (caught by tests). (4) The digest counted an undone revision as applied. (5) Muse sometimes ends a turn with "Done": the Phase 4 results now carry a `nextStep` that requires the written reply.
- **Real filing verified (2026-11-09):** the Docs 404s brief was filed into the private sandbox `Pavilion-devs/groundswell-sandbox` (#1) with the user's approval; title, Markdown body, quotes and links render correctly and the board stored the issue URL. Fix from reading it: reporters are now credited with a profile link instead of `@handle`, and @handles inside quotes get a zero-width space, so filing into a public repo never pings the quoted people.
- **Open:** the Meta API key in `.env` started returning 401 `invalid_api_key` on 2026-11-09; the agent cannot run until the user adds a fresh key (restart the server after). The "Bugs in Plan…" theme is a candidate for a split by app.

### Phase 5 — UI vision review (with the user, before building UI)
- [x] Studied references on Dribbble together (canvas, map, dashboard, AI-panel shots)
- [x] Mocked up two directions on real data (priority bubble map into canvas; light Enrolliq-style dashboard); the user rejected both
- [x] **Decision (2026-11-09): reuse the UI of the user's earlier project Twisky** (`Pavilion-devs/twiskylandingpage`): its landing page, dashboard shell and kanban board, copied with only copy and data changed
- [x] Locked in `DESIGN.md` (tokens, classes, screen-to-source map, interaction rules)
- **Done when:** the user signs off on `DESIGN.md`. ✅ (direction chosen by the user)

### Phase 6 — Build the UI (Twisky port)
- [x] Shell: Twisky sidebar + top bar (search filters the board, review bell, theme switch, agent toggle), `/boards/:id` owns its chrome, agent panel kept
- [x] Board: problems ranked by SQL as columns, then Unsorted, then internal groups; cards are reports with verified quotes; native drag and drop calls `move-notes` (pin + correction + "Teach the agent"); click/cmd-click selection written to app state; optimistic moves with live sync (verified: a drag recorded a real correction)
- [x] Dashboard home (Twisky stat cards: reports, problems, need review, rising; ranked problems from SQL; recent agent runs)
- [x] Report drawer (Twisky ConversationDrawer: full report with the verified quote highlighted, agent's placement + confidence + rationale, change problem, open on GitHub, ask the agent)
- [x] Problem drawer (column title, dashboard row or brief opens it): SQL score breakdown bars, the brief with verified quotes, Copy Markdown, Revise with the agent, Write the brief (agent), File as GitHub issue = dry-run preview → editable repo → second confirm naming the repo → post
- [x] Review: Unsorted reports with the agent's guess; Accept or choose a problem (pinned, recorded as a correction)
- [x] Briefs (latest brief per problem, top problems without one, "write briefs for the top 3"), Sources (sync GitHub, import repo / CSV file / pasted text, "Sort them" hands new reports to the agent), Automations (framework automations for this board with on/off switches, copy webhook URL, set-up buttons, digest history). New read actions: `list-briefs`, `list-digests`; `get-board` runs carry `movedNoteIds`
- [x] Codebook diff review ("Teach the agent" sheet: before/after definitions and rules, why, the moves it learned from, Apply and re-sort → agent runs the re-sort, Reject with reason) + "Undo vN" on the board + "Re-sorting n/total" pill + ripple: cards the agent moved flash once per run and the board scrolls to the first (verified on the real v3 re-sort's 23 moves)
- [x] Landing page from Twisky's marketing components (`/` and `/home`, public, one CTA to the dashboard, hero board is a dated snapshot of the real board; `rootAuth: false` so `/` is no longer the sign-in page)
- [ ] Public share link; MCP App card (stretch; the share link folds into Phase 7 demo mode)
- **Done when:** every engine action is reachable from the UI and the demo script runs end to end.

### Phase 7 — Polish, deploy, submit
- [x] Agent engine moved to **Claude Sonnet 4.6 on Amazon Bedrock** (2026-11-09; Meta key stopped working): `server/lib/bedrock-engine.ts`, AWS credentials from the default chain. Deploy needs AWS credentials with Bedrock access in the host's environment.
- [ ] Design pass (light/dark, empty states, loading, errors, onboarding tour)
- [x] Deploy (Vercel + Neon), demo mode, seeded board (2026-11-10): https://groundswell-board.vercel.app. Local PGlite copied into Neon with `pg_dump` (credential tables skipped). Open demo: `AUTH_DISABLED=true` (declared in `agent-native.json` `runtime.auth.enabled: false` so the config notice stays quiet), no `GITHUB_TOKEN`, so filing is off. Bedrock key from `AMAZON_BEDROCK_API_KEY`; the engine falls back to the deployment env value because the framework does not for production requests. `ANTHROPIC_API_KEY` is a non-secret placeholder that only opens the framework's chat gate. Hobby plan: daily cron via `AGENT_NATIVE_VERCEL_CRON_SCHEDULE`.
- [x] README: problem, how it works, architecture, **pre-existing vs. new work disclosure**, run instructions, deploy
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
- [x] Live URL works logged out (demo mode): board, dashboard, briefs and agent chat checked 2026-11-10
- [x] Public repo with README + disclosure section (Chat template, libraries, data source): https://github.com/Pavilion-devs/groundswell
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
