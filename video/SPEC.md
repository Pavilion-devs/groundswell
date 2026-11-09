# Groundswell demo · SPEC

GOAL:    a hackathon judge ends sure that Groundswell turns a pile of real GitHub issues into ranked, checkable
         problems that a human and an agent shape together, and that nothing it shows is made up.
OUTPUT:  HyperFrames, 1920 x 1080, 30 fps, one MP4 with voice-over, captions and a music bed.
TIME:    about 165 s x 30 = ~4950 frames. Scenes cut on voice-over lines, not on a beat.

LOOK:    the medium is the Excalidraw whiteboard, the same as the Gaugeless film (`opencv26/video`).
         - paper: #ffffff, flat, no grain, no vignette, no gradients.
         - ink: #1e1e1e for every word and line; secondary text #495057.
         - accents, one focus per frame: blue #1971c2 (the product, the title underline, step 1),
           red #e03131 (the catch, made-up numbers, hard rules), orange #e8590c (the human: drags, approvals),
           green #2f9e44 (verified: quotes checked, numbers from SQL).
         - type: Excalifont only. Title 210 px; scene headline 54 px; labels 32-40 px; notes 32 px; captions 40 px.
         - lines: rough.js, strokeWidth 2.6 (shapes) / 5 (highlight rings), roughness 1.1, seeded, drawn on.
         - app footage: real 1920x1080 captures of the running app (Twisky UI), full frame on #0f141a, never dimmed.
OBJECTS: an issue card = a sketched rectangle with a title line, a "#1234" tag and two scribble lines;
         the board = sketched columns of those cards; a quote = text in curly quotes with a green tick;
         a person = Gaugeless team-card figure (head circle + shoulders arc) in blue.
MOTION:  enter: strokes draw on over 0.5-0.9 s, power2.inOut; text writes left to right over 0.5-1.0 s;
         chips: back.out(1.8) from y -12 over 0.4 s; notes: power3.out from y +10 over 0.35 s;
         camera punch-in on footage: scale 1.35-1.5 over 1.1 s, power2.inOut; scene exit: opacity 0 +
         blur 8 px over 0.3 s, power3.in. Time-lapse footage is labelled with its speed.
SHOTS:
  1 problem   0-14 s    issue cards drop into a heap, a counter writes 340; "The catch": heap -> black box ->
                        "Top theme: 31%" + a quote, each gets a red "?" (illustration of an unchecked summary, not a real tool).
  2 intro     14-23 s   GROUNDSWELL 210 px + blue wavy underline drawn on; subline; stack line.
  3 team      23-27 s   one sketched person, "Favour Olaboye", "AI Engineer".
  4 sort      27-49 s   capture: a fresh board, the agent drafts problems, sorters fill columns (time-lapse badge).
  5 quotes    49-63 s   capture: report drawer with the highlighted quote; problem drawer score bars, punch-in.
  6 teach     63-92 s   capture: three drags (orange), Teach the agent, the diff, Apply, re-sort, ripple, Undo button.
  7 ship      92-112 s  capture: Write the brief, quotes, File, preview, named repo, confirm, the issue on GitHub.
  8 auto      112-124 s capture: Automations page, then a real new issue arrives by webhook and lands on the board.
  9 arch      124-146 s docs/architecture.excalidraw drawn on in order, rings on agent / server checks / engine / human.
 10 results   146-160 s hand-drawn table, every value from SQL at recording time, ticks drawn on.
 11 end       160-166 s GROUNDSWELL + tagline + live URL + repo.
  Captions: one boxed caption per voice-over phrase, bottom 64 px, white 94%, 2 px ink border.
BANNED:  dark void grounds outside the app footage; glow, neon, particles, gradients, glass cards; KPI grids;
         three cards in a row; everything centred at once; text moving while read; invented numbers, quotes,
         customers or tools; the logo docked in a corner; any stat not computed from the board's SQL.
QA:      frames at 2, 10, 18, 25, 35, 55, 75, 100, 118, 135, 150, 163 s: each shows one readable focus, captions
         inside 80% title-safe, no text over text, footage legible after punch-ins, every number matching SQL.
