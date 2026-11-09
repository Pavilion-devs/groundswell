"""Re-time a capture's ffmpeg concat list piecewise and encode it.
python3 speed.py <list.txt> <out.mp4> "0-30:3,30-300:30,300-:200"   (source seconds : speed factor)"""
import sys, subprocess
src, out, spec = sys.argv[1], sys.argv[2], sys.argv[3]
segs = []
for part in spec.split(","):
    rng, f = part.split(":"); a, b = rng.split("-")
    segs.append((float(a), float(b) if b else 1e9, float(f)))
lines = open(src).read().split("\n")
frames, t = [], 0.0
for i, l in enumerate(lines):
    if l.startswith("file") and i + 1 < len(lines) and lines[i + 1].startswith("duration"):
        d = float(lines[i + 1].split()[1]); frames.append((t, l[6:-1], d)); t += d
def scaled(t0, d):
    # split a frame's interval across segments
    total, t, end = 0.0, t0, t0 + d
    for a, b, f in segs:
        lo, hi = max(t, a), min(end, b)
        if hi > lo: total += (hi - lo) / f
    return total
txt = ""
for t0, f, d in frames:
    nd = scaled(t0, d)
    if nd <= 0: continue
    txt += f"file '{f}'\nduration {nd:.4f}\n"
txt += f"file '{frames[-1][1]}'\n"
tmp = out + ".txt"; open(tmp, "w").write(txt)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", tmp, "-vf", "fps=30,scale=1920:1080:flags=lanczos,format=yuv420p",
                "-c:v", "libx264", "-crf", "17", "-preset", "medium", out], check=True)
print(out, subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out]).decode().strip(), "s")
