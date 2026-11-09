# Groundswell demo video plan

Style: the same as `opencv26/video/renders/gaugeless-demo-v2.mp4`, built the same way (a HyperFrames project:
HTML + GSAP, Excalifont, rough.js sketches drawn on, boxed hand-font captions, voice-over per scene, a quiet
music bed). White sketch scenes for the story, real screen recordings of the app for the demo, the Excalidraw
architecture assembled box by box, a results table, an end card. Target length about 2:45.

Every number on screen comes from SQL on the real board (public `BuilderIO/agent-native` issues). No invented
customers, quotes or stats.

## Scenes

| # | Scene | ~Time | What is on screen | Voice-over (draft) |
|---|---|---|---|---|
| 1 | Problem (sketch) | 0:00-0:14 | Issue cards pile up into a heap; a counter ticks to 340. Then "The catch": the pile goes into a black box, out comes "Top theme: 31% performance" and a quote, both get a red question mark | "Agent-Native has hundreds of GitHub issues. Which problems actually matter? Reading them takes days. Asking an AI to summarise is fast, but you can't check its quotes or its counts." |
| 2 | Title card | 0:14-0:26 | GROUNDSWELL with the wavy underline; "a human and an agent turn raw feedback into ranked, evidence-backed problems"; tech line; then the real landing page hero | "Groundswell is an agent-native app where you and an agent shape the same board, and every quote and number can be checked." |
| 3 | Team | 0:26-0:32 | Two sketched people with names | "Built by ..." (names to confirm) |
| 4 | Demo 1 · The agent sorts | 0:32-0:52 | Dashboard → board; the agent drafts problems and three sorters fill the columns live | "The agent reads all 340 issues, writes the problems, and sends three sorters in parallel. Cards land live." |
| 5 | Demo 2 · Every quote is real | 0:52-1:07 | Open a card: highlighted quote, confidence, rationale. Open a problem: score bars "every number from SQL" | "Every card carries a quote the server checked word for word. Rankings come from SQL, never from the model." |
| 6 | Demo 3 · Teach by dragging | 1:07-1:35 | Drag 3 cards to the right problem → "Teach the agent" → the diff with the moves behind it → Apply → cards ripple → "Undo v4" | "When I disagree, I drag. Three moves, and the agent proposes sharper definitions, citing my moves. I approve, it re-sorts, and I can undo exactly." |
| 7 | Demo 4 · Ship it | 1:35-1:55 | Write the brief (agent) → quotes + next step → File as GitHub issue → preview → named repo → confirm → the issue on GitHub (sandbox repo) | "One click writes an Insight Brief with real quotes. Filing previews first, names the repo, and waits for me." |
| 8 | Demo 5 · It keeps working | 1:55-2:07 | Automations page; a new GitHub issue arrives by webhook and sorts itself on the board | "New issues sort themselves as they arrive, through the same actions." |
| 9 | Architecture | 2:07-2:27 | `docs/architecture.excalidraw` drawn on in order: inputs → agent → server checks → engine → outputs, with circled highlights | "The agent only acts through the app's actions. The server checks every quote, SQL computes every number, and a human approves anything that leaves the app." |
| 10 | Results | 2:27-2:40 | Table, all from SQL: 340 issues · 14 problems · 91% sorted · every placed card quoted · 3 drags → 23 re-sorted · undo restored all 340 placements exactly | "On 340 real issues: 14 problems, 91 percent sorted, every card quoted, and an undo that restores every placement." |
| 11 | End card | 2:40-2:48 | GROUNDSWELL · "Hear what users keep saying. Ship what matters." · live URL · repo | "Groundswell." |

## Before recording

1. Working `META_API_KEY` in `.env` (scenes 4, 6, 7 and 8 need the agent live).
2. Fresh demo board run so scene 4 can be recorded from empty (`seed-demo-board`), then the main board for the rest.
3. Phase 7 deploy for the live URL on the end card.
4. Confirm the team names and the filing repo for scene 7 (default: the private sandbox `Pavilion-devs/groundswell-sandbox`).

## Build

A new HyperFrames project next to the app (for example `video/`), reusing the Gaugeless project's pieces:
Excalifont, rough.js sketch helper, caption component and Playwright capture script for the screen recordings.
Voice-over and music through `/media-use`.
