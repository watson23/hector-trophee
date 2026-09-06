#!/usr/bin/env python3
"""
Bundle the Konopiště hole drawings so the app precaches them.

The drawings are hector.golf's (Lasse's site); fetched from there once and stored as
WebP under public/holes/<course>/<n>.webp at the SAME pixel size, because
src/data/holeArcs.json places the distance arcs in those pixel coordinates. Re-run if
hector.golf redraws a hole.
"""
import io, sys, urllib.request
from pathlib import Path
from PIL import Image

SLUG = {"radecky": "konopiste-radecky", "deste": "konopiste-deste"}
ROOT = Path(__file__).resolve().parent.parent / "public" / "holes"
total_png = total_webp = 0
for course, slug in SLUG.items():
    for hole in range(1, 19):
        url = f"https://hector.golf/images/courses/{slug}/holes/{hole}.png"
        raw = urllib.request.urlopen(url, timeout=30).read()
        im = Image.open(io.BytesIO(raw)).convert("RGBA")
        out = ROOT / course / f"{hole}.webp"
        im.save(out, "WEBP", quality=85, method=6)
        total_png += len(raw); total_webp += out.stat().st_size
        print(f"{course:8} {hole:2}  {im.width}x{im.height}  {len(raw)//1024:3} KB → {out.stat().st_size//1024:3} KB")
print(f"total {total_png/1024:.0f} KB png → {total_webp/1024:.0f} KB webp")
