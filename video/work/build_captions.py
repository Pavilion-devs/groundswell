"""Caption groups from the voice-over word timings (HeyGen word timestamps). Run after build_index.py."""
import json, re, os
ROOT = os.path.join(os.path.dirname(__file__), "..")
timing = json.load(open(os.path.join(ROOT, "work", "timing.json")))
FIX = {"Olaboye.": "Olaboye.", "summarise": "summarise"}
groups = []
for k, off in timing["offsets"].items():
    data = json.load(open(os.path.join(ROOT, "work", "vo", f"{k}.words.json")))
    ws = data["words"] if isinstance(data, dict) else data
    words = [(FIX.get(w["text"], w["text"]), w["start"] + off, w["end"] + off) for w in ws]
    i = 0
    while i < len(words):
        p = next((j for j in range(i, min(i + 9, len(words))) if re.search(r"[.,:;!?]$", words[j][0]) and j - i >= 1), None)
        j = p if p is not None else min(i + 6, len(words) - 1)
        if len(words) - 1 - j <= 1: j = len(words) - 1
        groups.append(words[i:j + 1]); i = j + 1
groups.sort(key=lambda g: g[0][1])
html = []
for i, g in enumerate(groups):
    s = g[0][1] - 0.05
    nxt = groups[i + 1][0][1] - 0.05 if i + 1 < len(groups) else g[-1][2] + 0.6
    e = min(nxt, g[-1][2] + 0.7)
    txt = " ".join(w[0] for w in g)
    html.append(f'    <div id="cap{i}" class="clip cap" data-start="{s:.2f}" data-duration="{e - s:.2f}"><span>{txt}</span></div>')
open(os.path.join(ROOT, "compositions", "captions.html"), "w").write(f"""<template>
  <style>
    @font-face {{ font-family: "Excalifont"; src: url("assets/fonts/excalifont.woff2") format("woff2"); }}
    #root {{ position: absolute; inset: 0; pointer-events: none; }}
    .cap {{ position: absolute; left: 0; right: 0; bottom: 64px; text-align: center; }}
    .cap span {{ display: inline-block; max-width: 1500px; padding: 10px 26px 12px; border-radius: 14px; background: rgba(255,255,255,0.94);
                border: 2px solid #1e1e1e; color: #1e1e1e; font-family: "Excalifont", sans-serif; font-size: 40px; line-height: 1.2; }}
  </style>
  <div id="root" data-composition-id="captions" data-width="1920" data-height="1080" data-duration="{timing['total']}">
{chr(10).join(html)}
  </div>
  <script>
    window.__timelines = window.__timelines || {{}};
    window.__timelines["captions"] = gsap.timeline({{ paused: true }});
  </script>
</template>
""")
print(len(groups), "caption groups")
for g in groups: print(f"{g[0][1]:6.1f}", " ".join(w[0] for w in g))
