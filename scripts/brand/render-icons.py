#!/usr/bin/env python3
"""Render every raster icon from the one mark definition in assets/icon.svg.

Run from the repository root: python3 scripts/brand/render-icons.py
Requires Pillow. Geometry here must match assets/icon.svg.
"""
import math
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
INK, PAPER = (10, 10, 10, 255), (255, 255, 255, 255)
# Unit-square geometry: tile corner radius, ring radius, ring stroke, and the open arc.
CORNER, RADIUS, STROKE, GAP_DEGREES = 0.225, 0.27, 0.105, 45
SAFARI = ROOT / "bundle/safari/Zen mode for X/Shared (App)"


def render(size, inset=0.0):
    """Draw the tile at `size` px. `inset` is the transparent margin as a fraction of the canvas."""
    scale = 8
    canvas = size * scale
    image = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    origin, side = canvas * inset, canvas * (1 - 2 * inset)
    draw.rounded_rectangle((origin, origin, origin + side, origin + side), radius=side * CORNER, fill=INK)
    center, radius, stroke = canvas / 2, side * RADIUS, side * STROKE
    outer = radius + stroke / 2
    draw.arc((center - outer, center - outer, center + outer, center + outer), start=0, end=360 - GAP_DEGREES, fill=PAPER, width=round(stroke))
    for degrees in (0, 360 - GAP_DEGREES):
        x = center + radius * math.cos(math.radians(degrees))
        y = center + radius * math.sin(math.radians(degrees))
        draw.ellipse((x - stroke / 2, y - stroke / 2, x + stroke / 2, y + stroke / 2), fill=PAPER)
    return image.resize((size, size), Image.LANCZOS)


def save(path, size, inset=0.0):
    path.parent.mkdir(parents=True, exist_ok=True)
    render(size, inset).save(path, optimize=True)


for size in (16, 32, 48, 64, 128):
    save(ROOT / f"images/icon-{size}.png", size)
save(ROOT / ".github/assets/icon.png", 256)

# macOS app icons keep Apple's margin around the tile.
MAC_INSET = 0.098
mac = {"mac-icon.png": 1024}
for points in (16, 32, 128, 256, 512):
    mac[f"mac-icon-{points}.png"] = points
    mac[f"mac-icon-{points}@2x.png"] = points * 2
for name, size in mac.items():
    save(ROOT / "assets/mac-icon" / name, size, MAC_INSET)
    if name != "mac-icon.png":
        save(SAFARI / "Assets.xcassets/AppIcon.appiconset" / name, size, MAC_INSET)
save(SAFARI / "Assets.xcassets/AppIcon.appiconset/logo.png", 1024)
save(SAFARI / "Assets.xcassets/LargeIcon.imageset/logo.png", 1024, MAC_INSET)
save(SAFARI / "Resources/Icon.png", 256, MAC_INSET)
