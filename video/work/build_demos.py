"""Demo scenes: a captured app run + a numbered chip, hand-drawn rings, notes and punch-ins (adapted from the
Gaugeless build). Coordinates are 1920x1080 capture pixels; times are scene seconds. Each scene plays one clip
from assets/clips/<clip>.mp4 starting at its `src_in` second (data-media-start), so long captures can be trimmed.
Edit DEMOS below, then: python3 work/build_demos.py"""
import json, os
ROOT = os.path.join(os.path.dirname(__file__), "..")
DEMOS = json.load(open(os.path.join(ROOT, "work", "demos.json")))

def scene(k, c):
    color = c["color"]
    rings = "\n".join(f"      const r{i} = SK.rect(S, {x}, {y}, {w}, {h}, {{ stroke: C, strokeWidth: 5, roughness: 1.6, bowing: 1.4 }});"
                      for i, (x, y, w, h, a, b) in enumerate(c.get("rings", [])))
    ranim = "\n".join(f"      SK.on(tl, r{i}, {a}, 0.5, \"power3.out\"); tl.to(r{i}, {{ opacity: 0, duration: 0.3 }}, {round(b - 0.3, 2)});"
                      for i, (x, y, w, h, a, b) in enumerate(c.get("rings", [])))
    notes = "\n".join(f'      <div id="{i}" class="note" style="left:{x}px;top:{y}px">{t}</div>' for i, t, x, y, a, b in c.get("notes", []))
    nanim = "\n".join(f'      tl.fromTo("#{i}", {{ opacity: 0, y: 10 }}, {{ opacity: 1, y: 0, duration: 0.35, ease: "power3.out" }}, {a});'
                      + (f' tl.to("#{i}", {{ opacity: 0, duration: 0.3 }}, {round(b - 0.3, 2)});' if b < c["dur"] else "")
                      for i, t, x, y, a, b in c.get("notes", []))
    # punch-ins: [at, cx, cy, scale, dur] ; scale 1 returns to full frame. Rings ride along with the camera.
    def cam(cx, cy, s):  # keep the scaled footage covering the whole frame
        return (round(max(min(0, 960 - cx * s), 1920 - 1920 * s)), round(max(min(0, 540 - cy * s), 1080 - 1080 * s)))
    punch = "\n".join(f'      tl.to("#{k}-cam", {{ x: {cam(cx, cy, s)[0]}, y: {cam(cx, cy, s)[1]}, scale: {s}, duration: {d}, ease: "power2.inOut" }}, {t});'
                      for t, cx, cy, s, d in c.get("punch", []))
    speed = ""
    if c.get("speed"):
        speed = f'      <div id="{k}-speed" class="speed">{c["speed"]}</div>'
    clips = "\n".join(
        f'        <video id="{k}-v{i}" class="clip" src="assets/clips/{seg["clip"]}.mp4" data-start="{seg["at"]}" data-duration="{seg["dur"]}" data-media-start="{seg.get("src_in", 0)}" muted playsinline></video>'
        for i, seg in enumerate(c["segments"]))
    return f"""<template>
  <style>
    @font-face {{ font-family: "Excalifont"; src: url("assets/fonts/excalifont.woff2") format("woff2"); }}
    #root {{ position: absolute; inset: 0; background: #0f141a; overflow: hidden; font-family: "Excalifont", sans-serif; }}
    #{k}-cam {{ position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; transform-origin: 0 0; }}
    #{k}-cam video {{ position: absolute; inset: 0; width: 1920px; height: 1080px; }}
    #{k}-svg {{ position: absolute; inset: 0; width: 1920px; height: 1080px; overflow: visible; }}
    #{k}-chip {{ position: absolute; left: 0; right: 0; top: 12px; text-align: center; }}
    #{k}-chip span {{ display: inline-block; padding: 6px 24px 8px; background: #ffffff; border: 3px solid {color}; color: {color};
                    border-radius: 14px; font-size: 36px; }}
    #root .note {{ position: absolute; padding: 6px 18px 8px; background: #ffffff; border: 3px solid {color}; color: #1e1e1e;
                  border-radius: 12px; font-size: 32px; white-space: nowrap; }}
    #root .speed {{ position: absolute; right: 40px; top: 18px; padding: 4px 16px 6px; background: #ffffff; border: 2px solid #1e1e1e;
                   color: #1e1e1e; border-radius: 12px; font-size: 30px; }}
  </style>
  <div id="root" data-composition-id="{k}" data-width="1920" data-height="1080" data-duration="{c["dur"]}">
    <div id="{k}-frame" data-layout-allow-overflow>
      <div id="{k}-cam">
{clips}
        <svg id="{k}-svg" viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg"></svg>
      </div>
      <div id="{k}-chip"><span>{c["chip"]}</span></div>
{speed}
{notes}
    </div>
  </div>
  <script>
    (function () {{
      const S = "#{k}-svg", C = "{color}";
{rings}
      const tl = gsap.timeline({{ paused: true }});
      tl.fromTo("#{k}-cam", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.3, ease: "power2.out" }}, 0);
      tl.fromTo("#{k}-chip span", {{ opacity: 0, y: -12 }}, {{ opacity: 1, y: 0, duration: 0.4, ease: "back.out(1.8)" }}, 0.3);
{ranim}
{nanim}
{punch}
      tl.to("#{k}-frame", {{ opacity: 0, duration: 0.3, ease: "power2.in" }}, {round(c["dur"] - 0.3, 2)});
      window.__timelines["{k}"] = tl;
    }})();
  </script>
</template>
"""

for k, c in DEMOS.items():
    open(os.path.join(ROOT, "compositions", f"{k}.html"), "w").write(scene(k, c))
print("wrote", ", ".join(DEMOS))
