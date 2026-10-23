#!/usr/bin/env python3
"""frames-to-mp4.py <frames-dir> <out.mp4> [captions.txt]

Builds a video from CDP screencast JPEGs using their real capture timestamps
(variable frame durations, output at 30 fps). Frames are never edited; captions
go in a separate bar under the picture. captions.txt lines: "start end text".
"""
import os, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFont

d, out = sys.argv[1], sys.argv[2]
caps = sys.argv[3] if len(sys.argv) > 3 else None
rows = [l.split() for l in open(os.path.join(d, 'times.txt')) if l.strip()]
lst = os.path.join(d, 'concat.txt')
with open(lst, 'w') as f:
    for i, (name, t) in enumerate(rows):
        f.write(f"file '{name}'\n")
        nxt = float(rows[i + 1][1]) if i + 1 < len(rows) else float(t) + 1 / 30
        f.write(f"duration {max(0.001, nxt - float(t)):.4f}\n")
    f.write(f"file '{rows[-1][0]}'\n")

W, BAR = 1280, 84
font = None
for p in ['/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf', '/Library/Fonts/Arial.ttf']:
    if os.path.exists(p):
        font = ImageFont.truetype(p, 26)
        break
font = font or ImageFont.load_default()

inputs = ['-f', 'concat', '-safe', '0', '-i', lst]
filt = [f"[0:v]scale={W}:-2:flags=lanczos,pad={W}:ih+{BAR}:0:0:color=0x1d1a14[v0]"]
last = 'v0'
tmp = tempfile.mkdtemp(dir=d)
if caps:
    for k, line in enumerate(l for l in open(caps) if l.strip()):
        s, e, text = line.split(' ', 2)
        img = Image.new('RGBA', (W, BAR), (29, 26, 20, 255))
        dr = ImageDraw.Draw(img)
        tw = dr.textlength(text.strip(), font=font)
        dr.text(((W - tw) / 2, 26), text.strip(), font=font, fill=(243, 236, 217, 255))
        pth = os.path.join(tmp, f'cap{k}.png')
        img.save(pth)
        inputs += ['-i', pth]
        filt.append(f"[{last}][{k + 1}:v]overlay=0:H-{BAR}:enable='between(t,{s},{e})'[v{k + 1}]")
        last = f'v{k + 1}'
cmd = ['ffmpeg', '-loglevel', 'error', '-y', *inputs, '-filter_complex', ';'.join(filt), '-map', f'[{last}]',
       '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', out]
subprocess.run(cmd, check=True)
print(out)
