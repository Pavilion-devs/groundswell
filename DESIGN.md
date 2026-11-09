# Groundswell — Design

**Direction (approved 2026-11-09): reuse the Twisky UI.** The user chose to bring over the UI of their own earlier project, Twisky (`Pavilion-devs/twiskylandingpage`, live at twiskylandingpage.vercel.app), instead of a new design. We copy its components, classes and tokens and change only copy and data. Earlier explorations (priority bubble map, a light "Enrolliq-style" dashboard mockup) were rejected.

> Disclosure: the README must list the Twisky UI as pre-existing work (the user's own earlier project) per the hackathon rules.

## Look

- Neutral greys only, no brand hue. Light is the default; dark is Twisky's `:root`.
- Font: Inter, tight tracking (`letter-spacing: -0.025em`).
- Grid-paper background (`.cosmic-grid`, 30px), soft cards with a 1px border and small shadow, pill tags (`bg-muted/50 border rounded-full`), round count badges.
- Primary action: dark pill button (`bg-foreground text-background`); secondary: `bg-muted` square icon buttons.

## Tokens (scoped to `.gs-app` in `app/global.css`)

| Token | Light | Dark |
|---|---|---|
| background | `0 0% 98%` | `0 0% 8%` |
| foreground | `0 0% 20%` | `0 0% 95%` |
| card | `0 0% 96%` | `0 0% 12%` |
| primary | `0 0% 25%` | `0 0% 85%` |
| muted / muted-foreground | `0 0% 88%` / `0 0% 45%` | `0 0% 22%` / `0 0% 70%` |
| accent | `0 0% 25%` | `0 0% 85%` |
| border | `0 0% 85%` | `0 0% 22%` |
| cosmic-* | dark `#404040`, darker `#303030`, light `#f0f0f0`, accent `#606060`, muted `#909090` | same |

Tokens are scoped to `.gs-app` so the Agent-Native template's chat and agent UI keep their own (Twisky's dark-grey `accent` would turn every toolkit hover dark).

Classes ported as-is: `dashboard-header`, `dashboard-sidebar`, `dashboard-stat-card`, `dashboard-title/text/active/inactive`, `cosmic-grid`, `task-card` (+ `.dragging`), `column-highlight`. Added: `.task-card.rippled` (notes the agent moved after you taught it).

## Screens and their Twisky source

| Groundswell | Twisky source | Route |
|---|---|---|
| App shell: sidebar (Dashboard, Board, Review, Briefs, Sources, Automations; collapsible) + top bar (search, review bell, theme switch, initials, agent toggle) | `layout/sidebar.tsx`, `layout/topbar.tsx`, `dashboard-shell.tsx` | all `/boards/*` |
| **Board**: columns = problems ranked by SQL priority, then Unsorted, then internal groups; cards = reports with verified quotes; drag = `move-notes` (pin + correction + "Teach the agent") | `dashboard/TaskBoard`, `TaskColumn`, `TaskCard`, hero board frame | `/boards/:id` |
| **Dashboard**: stat cards + ranked problems + recent agent activity | `dashboard/DashboardMainContent.tsx` | `/boards/:id/dashboard` |
| **Report drawer**: full report, verified quote, theme, brief, file issue | `conversations/ConversationDrawer.tsx` | drawer over board |
| **Review**: Unsorted reports with the agent's guess | board column + cards | `/boards/:id/review` |
| **Landing page**: header (Features / Board pills, theme switch), hero with typed headline and one CTA, a draggable snapshot of the real board, six features, closing CTA, footer. One call to action only ("Open the dashboard" → `/boards` → latest board's dashboard); no sign-in or sign-up buttons. Public: calls no actions; the board comes from `components/landing/snapshot.ts` (real data, dated) | `marketing/Header`, `HeroSection`, `Features`, `CallToAction`, `Footer`, `Logo` | `/` and `/home` (the framework moves signed-in visitors from `/` to `/home` before React loads) |

## Interaction rules

- UI feedback within 100 ms: moves apply instantly (optimistic), the server answer replaces them; live sync shows agent and webhook changes.
- Every control calls the same action the agent uses.
- Clicking cards writes the tab's `selection`, so "these" in the agent chat means the selected reports. Cmd/Shift-click adds to the selection; dragging a selected card moves the whole selection.
- Numbers on screen come from SQL actions, never from the model.
