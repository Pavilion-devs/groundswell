/** Shipped as the shared agent resource `skills/feedback-synthesis/SKILL.md`. */
export const FEEDBACK_SYNTHESIS_SKILL = `---
name: feedback-synthesis
description: How to turn a board of raw feedback into a sharp codebook of themes and sort every note into it with a team of sorter sub-agents. Use when the user asks to sort, cluster, theme, organise or make sense of a board's feedback.
---

# Feedback synthesis

You turn a pile of feedback into themes a product team can act on. Quality bar: a PM should be able to read the theme list and know what to fix next.

## 1. Orient
- get-board (or view-screen if the user means the board on screen). If it has no notes, import first.
- get-codebook. If a codebook exists and the user did not ask to start over, keep it: sort only what is not yet sorted.

## 2. Draft the codebook
- sample-notes with size 120 (up to 200 for boards over 1,000 notes). Read every sampled note.
- Write 6 to 14 themes. Each theme is **one user problem or need**, in the user's language:
  - Good: "Self-hosted sign-in breaks", "Exports time out on large reports", "Wants passkeys and 2FA".
  - Bad: "Auth" (a feature area hiding several problems), "Misc", "Other", "Bugs", "Feature requests".
- Themes must not overlap. If two could hold the same note, sharpen both definitions and add exclude rules that name the sibling theme.
- The definition is decision-ready: someone who never saw the sample could sort a new note with it.
- Aim for the themes to cover about 85% of notes. The rest belongs in Unsorted; never add a catch-all theme.
- save-codebook with a one-paragraph summary of how you cut it and why.

## 3. Sort with a team
- start-sort-run with slices 4. It returns runId, the slices and a sorterBrief.
- If total is 40 or fewer, sort it yourself with get-notes-for-sorting and place-notes.
- Otherwise spawn one **theme-sorter** sub-agent per slice, all at once (agent-teams spawn with agent "theme-sorter"). Give each the sorterBrief plus its own slice and of values. Do not sort notes yourself while they run.
- When every sorter is done, call finish-sort-run(runId). It is the proof of what was saved.

## 4. Close coverage gaps (once)
If finish-sort-run reports board.unsortedShare above 0.2, the codebook is missing themes:
- list-notes(boardId, unsorted=true, limit=80) and read them.
- Find the clusters: groups of 4 or more Unsorted notes that share one problem. Notes that are not product feedback at all (internal trackers, CI reports, spam) can share one honest theme such as "Maintainer and CI trackers" so they stop crowding Unsorted.
- Add each cluster with create-theme. Tighten any existing theme whose definition caused the misses with update-theme.
- start-sort-run(scope "unsorted"), spawn the sorters again, finish-sort-run.
- Do this pass once. One-off notes that still fit nothing belong in Unsorted.

## 5. Report
- Lead with the result from the last finish-sort-run: "N of M notes are in K themes; U are in Unsorted for review; Q have a verified quote." Mention the coverage pass if you ran one.
- List the biggest themes by note count (get-codebook), one line each.
- If notReached > 0, say so plainly and offer to run a sort for the rest.
- Offer next steps: review Unsorted, split a broad theme, or open the board.

## Rules
- Never invent notes, quotes, counts or users. Numbers come from action results.
- Notes the user moved are pinned. Never move them back.
- When the user selects notes or a theme and says "these" or "this", call view-screen and act on exactly that selection (split-theme, merge-themes, move-notes).
`;
