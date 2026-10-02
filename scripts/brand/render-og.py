#!/usr/bin/env python3
"""Render site/assets/og.png (1200x630) from the dark Timeline capture.

Usage: python3 scripts/brand/render-og.py /path/to/Geist-Medium.ttf /path/to/Geist-Regular.ttf
The Geist TTFs ship in the `geist` npm package under dist/fonts/geist-sans.
"""
import math
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
medium, regular = sys.argv[1], sys.argv[2]
W, H = 1200, 630
image = Image.new("RGB", (W, H), (10, 10, 10))
draw = ImageDraw.Draw(image)
for y in range(11, H, 22):
    for x in range(11, W, 22):
        draw.point((x, y), fill=(52, 52, 52))

shot = Image.open(ROOT / "site/assets/popup-timeline-dark.png").convert("RGB")
width = 420
height = int(shot.height * width / shot.width)
shot = shot.resize((width, height), Image.LANCZOS)
mask = Image.new("L", (width, height), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, width, height + 40), radius=18, fill=255)
left, top = W - width - 90, 70
draw.rounded_rectangle((left - 1, top - 1, left + width, top + height + 40), radius=19, outline=(60, 60, 60))
image.paste(shot, (left, top), mask)

scale, size = 4, 64
mark = Image.new("RGBA", (size * scale, size * scale), (0, 0, 0, 0))
pen = ImageDraw.Draw(mark)
center, radius, stroke = size * scale / 2, 21 * scale, 7 * scale
outer = radius + stroke / 2
pen.arc((center - outer, center - outer, center + outer, center + outer), 0, 315, fill="white", width=stroke)
for degrees in (0, 315):
    x = center + radius * math.cos(math.radians(degrees))
    y = center + radius * math.sin(math.radians(degrees))
    pen.ellipse((x - stroke / 2, y - stroke / 2, x + stroke / 2, y + stroke / 2), fill="white")
mark = mark.resize((size, size), Image.LANCZOS)
image.paste(mark, (88, 92), mark)
draw.text((166, 104), "Zen mode for X", font=ImageFont.truetype(medium, 34), fill=(237, 237, 237))
headline = ImageFont.truetype(medium, 84)
draw.text((88, 236), "The same X.", font=headline, fill=(255, 255, 255))
draw.text((88, 330), "Far less noise.", font=headline, fill=(255, 255, 255))
body = ImageFont.truetype(regular, 28)
draw.text((90, 462), "Hide ads, counts and suggestions.", font=body, fill=(161, 161, 161))
draw.text((90, 502), "Free and open source.", font=body, fill=(161, 161, 161))
image.save(ROOT / "site/assets/og.png", optimize=True)
