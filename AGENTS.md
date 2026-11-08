# Chat — Agent Guide

Chat is the minimal chat-first agent-native app. `/` redirects to shared sign-in, then `/home`, the editable Get started page. Chat lives at `/chat`; new chats start there. Actions carry capabilities; screens exist only for durable workflows.

## Skills

Search with `rg --hidden --follow`; read the exact linked guide before deeper work. `.agents/skills/build-an-app/SKILL.md` — start here for vague requests to create a domain app. `.agents/skills/adding-a-feature/SKILL.md` — cross-area feature checklist. Data/integrations: `.agents/skills/actions/SKILL.md`, `.agents/skills/storing-data/SKILL.md`, `.agents/skills/security/SKILL.md`, `.agents/skills/secrets/SKILL.md`, `.agents/skills/sharing/SKILL.md`. UI: `.agents/skills/frontend-design/SKILL.md`, `.agents/skills/shadcn-ui/SKILL.md`, `.agents/skills/client-side-routing/SKILL.md`. Agent context/workflows: `.agents/skills/context-awareness/SKILL.md`, `.agents/skills/real-time-sync/SKILL.md`, `.agents/skills/reliable-mutations/SKILL.md`, `.agents/skills/performance/SKILL.md`, `.agents/skills/delegate-to-agent/SKILL.md`. Framework: `.agents/skills/agent-native-docs/SKILL.md`, `.agents/skills/agent-native-toolkit/SKILL.md`, `.agents/skills/customizing-agent-native/SKILL.md`.

Use local docs only (no web research): `pnpm action docs-search --query "<topic>"`, `pnpm action docs-search --slug "<slug>"`, `pnpm action docs-search --list`, `pnpm action source-search --query "<pattern>"`, `pnpm action source-search --path <path>`, or `pnpm action source-search --list`. For external-agent integrations, read `pnpm action docs-search --slug "external-agents"`.

## Core rules

- UI feedback: target 100 ms, never exceed 400 ms; acknowledge before network work.
- Normal app data must flow through actions. Keep actions deterministic and focused; use agent chat/AgentSidebar for AI work and follow-ups in the same thread. Keep structured state in SQL and large files in configured storage; persist references only.
- For external integrations, inspect the workspace/provider connection catalog first; reuse its scoped resolver. Never hardcode credentials, webhook URLs, or private/customer data.
- Never fabricate. Report failures and recover; verify writes by reading the row or screen. Navigation is in `<current-screen>`; use `view-screen` for fresh visible-record details.

For custom branding, keep `server/plugins/agent-native-email-branding.ts` aligned: `app.name` appears in transactional email and optional `app.logoUrl` must be an absolute HTTPS URL.

## Application state

- `navigation` describes the view and selected ids. Chat is `chat` at `/chat` and `/chat/<threadId>`; the Get started page is `home` at `/home`; `/` opens shared sign-in/signup.
- Use `navigate` when supported and `view-screen` for a fresh read of visible details; basic navigation is already in `<current-screen>`.

## Building a domain app

Choose the primary workflow and route before editing. Add a domain route under `app/routes/` and set `app.homePath` in `server/plugins/agent-native-email-branding.ts` with `defineAppConfig`. The default Get started page lives at `/home`, and Chat stays at `/chat`; edit `app/routes/home.tsx` when replacing that page with a domain-specific home. Add a static link in `app/components/layout/Sidebar.tsx` before `ChatThreadsSection`; `Header.tsx` uses `APP_TITLE` elsewhere. Shared sidebar and AgentInspector remain.

Use `adding-a-feature` for functional parity and `frontend-design` for a user-facing screen. Keep feature guidance here; do not rewrite `README.md` or `DESIGN.md`. After all edits, run one typecheck, one doctor check, and one browser smoke of the primary workflow, including overlap rejection, cancellation freeing the slot, and authenticated landing. Skip production build and extra test suites.

Before building common workspace or agent UI, read `agent-native-toolkit`; for supported customization, read `customizing-agent-native`.

- Guarded verification: run `pnpm agent-native:doctor`; fix findings before done.

## Groundswell

Groundswell turns feedback into a board of themes shaped by the user and the agent. Project scope, phases and rules live in `plan.md` and `CLAUDE.md`. Data model: `server/db/schema.ts` (boards are the shareable resource; every other table is a board child carrying `owner_email`/`org_id`). Every action that touches children calls `requireBoard(boardId, role)` from `server/lib/boards.ts` first.

| Action | Use it to |
| --- | --- |
| `list-boards` | List boards the user can open, with note counts |
| `get-board` | Board summary: sources, note/sorted/unsorted counts, recent runs |
| `create-board` | Start a new board |
| `delete-board` | Permanently delete a board (owner only, needs approval) |
| `add-github-source` | Import a repo's issues (bots skipped by default); re-calling re-syncs |
| `sync-source` | Incremental re-sync of a GitHub source (`full=true` re-fetches all) |
| `import-csv` | Import CSV rows as notes; columns auto-detected or mapped |
| `import-text` | Import pasted feedback split by paragraph or line |
| `list-notes` | Browse/search notes (filter by source, theme, unsorted) |
| `get-note` | Full text of one note plus its placement |
| `get-run-status` | Status/progress of an import or sorting run |
| `sample-notes` | Stratified, engagement-weighted sample for drafting a codebook |
| `save-codebook` | Save a new active codebook version (themes carry placements across versions by key) |
| `get-codebook` | Active themes with note/pinned counts, plus sorted/unsorted counts |
| `start-sort-run` | Open a sort run split into slices for parallel `theme-sorter` sub-agents |
| `get-notes-for-sorting` | Next batch of not-yet-sorted notes in one slice (stable hash partition) |
| `place-notes` | Atomic batch placement; validates theme keys and verbatim quotes; never touches pinned notes |
| `finish-sort-run` | Close a sort or revision re-sort and return proof (placed / unsorted / quotes / remaining; moved notes and `moveGroups` for a re-sort) |
| `move-notes` | The user's decision (drag): pins notes and records corrections for learning |
| `create-theme` / `update-theme` / `delete-theme` | Edit themes in the active codebook (delete returns notes to Unsorted) |
| `merge-themes` / `split-theme` | Fold themes together, or split one into sharper themes by note ids |
| `list-corrections` | The user's moves of agent-placed notes, with from/to theme and reason; pending ones feed the next revision |
| `propose-codebook-revision` | Structured diff (update / add / remove) learned from corrections; each change cites its corrections; nothing changes until applied |
| `get-codebook-revision` | The open proposal as a before/after diff with evidence and impact; whether the active codebook can be undone |
| `apply-codebook-revision` | Make the proposal active (snapshot first), mark corrections learned, start a targeted re-sort run (`scope: "revision"`) |
| `reject-codebook-revision` / `undo-codebook-revision` | Decline a proposal, or restore the board exactly as before the last applied revision (user moves since are kept) |
| `seed-demo-board` | Developer setup only (hidden from the agent): demo board from `BuilderIO/agent-native` |

Sorting is agent work, not action work (framework rule: no model calls in actions). The main agent follows the shared skill `skills/feedback-synthesis/SKILL.md` and spawns `agents/theme-sorter.md` sub-agents; both ship from `server/agent-resources/` via `server/plugins/agent-resources.ts`. Quotes are stored only as spans into `noteText()` (title + blank line + body) after `findQuote()` confirms they are verbatim.

Selection contract: the UI writes tab-scoped `selection:<TAB_ID>` = `{ boardId, noteIds, themeIds }`; navigation carries `{ view: "board" | "debug", boardId }`; `view-screen` returns the board, its themes and the selection.

GitHub import uses GraphQL when the user (or the deployment) has a `GITHUB_TOKEN`, otherwise the REST search API (anonymous, capped at 1,000 issues, 10 requests/minute).
