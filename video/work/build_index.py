"""Lay the scenes end to end and write index.html: each scene's host, its voice-over (starting VO_LEAD into the
scene) and the music bed. Re-run after changing a scene's duration or voice line, then build_captions.py.
Durations: SCENES[i][1] (seconds); a scene's voice starts at scene start + its lead."""
import json, subprocess, os

ROOT = os.path.join(os.path.dirname(__file__), "..")
# (scene id, duration s, voice-over file or None, voice lead s)
SCENES = [
    ("hook", 13.0, "hook", 0.3),
    ("intro", 8.4, "intro", 0.3),
    ("team", 3.4, "team", 0.3),
    ("arch", 18.6, "arch", 0.3),
    ("endcard", 6.8, "end", 0.3),
]
if os.path.exists(os.path.join(ROOT, "work", "scenes.json")):
    SCENES = [tuple(s) for s in json.load(open(os.path.join(ROOT, "work", "scenes.json")))]

def dur(path):
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).decode())

t, hosts, vos, offsets = 0.0, [], [], {}
for entry in SCENES:
    sid, d, vo, lead = entry[:4]
    extras = entry[4] if len(entry) > 4 else []   # more voice lines inside the scene: [[vo, offset s], ...]
    for evo, eoff in extras:
        evd = dur(os.path.join(ROOT, "assets", "vo", f"{evo}.wav"))
        vos.append(f'      <audio id="vo-{evo}" src="assets/vo/{evo}.wav" data-start="{t + eoff:.2f}" data-duration="{evd:.2f}" data-track-index="5"></audio>')
        offsets[evo] = round(t + eoff, 2)
    hosts.append(f'      <div id="{sid}" data-composition-id="{sid}" data-composition-src="compositions/{sid}.html" data-start="{t:.2f}" data-duration="{d}" data-track-index="1" data-track-kind="graphics" data-width="1920" data-height="1080"></div>')
    if vo:
        vd = dur(os.path.join(ROOT, "assets", "vo", f"{vo}.wav"))
        vos.append(f'      <audio id="vo-{vo}" src="assets/vo/{vo}.wav" data-start="{t + lead:.2f}" data-duration="{vd:.2f}" data-track-index="5"></audio>')
        offsets[vo] = round(t + lead, 2)
    t += d
total = round(t, 2)
bgm = f'      <audio id="bgm" src="assets/bgm.wav" data-start="0" data-duration="{total}" data-track-index="6" data-volume="0.32"></audio>' if os.path.exists(os.path.join(ROOT, "assets", "bgm.wav")) else ""
html = f"""<!doctype html>
<html lang="en" data-resolution="landscape">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <script src="assets/vendor/rough.js"></script>
    <script src="assets/vendor/sketch.js"></script>
    <style>
      @font-face {{ font-family: "Excalifont"; src: url("assets/fonts/excalifont.woff2") format("woff2"); }}
      :root {{ --paper: #ffffff; --ink: #1e1e1e; --blue: #1971c2; --alarm: #e03131; --ok: #2f9e44; --human: #e8590c; }}
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: var(--paper); }}
      #root {{ position: relative; width: 100%; height: 100%; background: var(--paper); font-family: "Excalifont", sans-serif; }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{total}" data-width="1920" data-height="1080">
{chr(10).join(hosts)}

      <div id="captions" data-composition-id="captions" data-composition-src="compositions/captions.html" data-start="0" data-duration="{total}" data-track-index="3" data-track-kind="captions" data-width="1920" data-height="1080"></div>

{bgm}
{chr(10).join(vos)}
    </div>
    <script>
      window.__timelines = window.__timelines || {{}};
      window.__timelines["main"] = gsap.timeline({{ paused: true }});
    </script>
  </body>
</html>
"""
open(os.path.join(ROOT, "index.html"), "w").write(html)
json.dump({"total": total, "offsets": offsets}, open(os.path.join(ROOT, "work", "timing.json"), "w"), indent=1)
print("total", total, "s ·", offsets)
