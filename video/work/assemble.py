"""Assemble a frames folder into an MP4 using the files' write times as frame times (for interrupted captures).
python3 assemble.py <frames dir> <out.mp4>"""
import os, sys, subprocess
d, out = sys.argv[1], sys.argv[2]
fs = sorted(f for f in os.listdir(d) if f.endswith(".jpg"))
ts = [os.path.getmtime(os.path.join(d, f)) for f in fs]
lines = []
for i, f in enumerate(fs):
    dur = (ts[i + 1] - ts[i]) if i + 1 < len(fs) else 0.5
    lines += [f"file '{os.path.abspath(os.path.join(d, f))}'", f"duration {max(dur, 0.001):.4f}"]
lines.append(f"file '{os.path.abspath(os.path.join(d, fs[-1]))}'")
open(d + ".txt", "w").write("\n".join(lines) + "\n")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", d + ".txt", "-vf", "fps=30,scale=1920:1080:flags=lanczos,format=yuv420p",
                "-c:v", "libx264", "-crf", "16", "-preset", "medium", out], check=True)
print(out, len(fs), "frames", f"{ts[-1] - ts[0]:.1f}s")
