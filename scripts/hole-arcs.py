"""
Distance arcs for the hole maps.

hector.golf's hole illustrations are drawn to a consistent scale (~2.1 px/m, verified
against the tee-to-tee metre differences on several holes). This script finds the tee
ovals on each map, derives the scale per hole from the metre differences between tees,
and precomputes, for each tee and distance, the arc of "N metres from this tee" clipped
to the hole's shape — as SVG path data in the image's pixel space.

  python3 scripts/hole-arcs.py            # writes src/data/holeArcs.json
  python3 scripts/hole-arcs.py --report   # prints per-hole diagnostics only

Needs Pillow + numpy. Maps are fetched from hector.golf (cached in .cache/holes).
"""
import json, math, os, sys, urllib.request
from collections import deque
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, ".cache", "holes")
OUT = os.path.join(ROOT, "src", "data", "holeArcs.json")
DISTANCES = [150, 200, 250]

COURSES = {
    "radecky": {
        "slug": "konopiste-radecky",
        "par": [5, 4, 4, 5, 4, 3, 4, 3, 4, 3, 4, 5, 4, 5, 4, 3, 4, 4],
        # back → front, as the ovals sit on the map
        "tees": ["black", "white", "yellow", "blue", "red"],
        "metres": {
            "black": [471, 360, 358, 436, 352, 166, 376, 189, 379, 128, 370, 545, 384, 542, 422, 192, 421, 393],
            "white": [453, 330, 337, 419, 332, 155, 357, 178, 353, 128, 354, 528, 368, 519, 399, 182, 398, 378],
            "yellow": [421, 308, 319, 403, 313, 147, 337, 163, 335, 128, 339, 503, 344, 499, 383, 168, 387, 362],
            "blue": [412, 277, 301, 383, 296, 124, 305, 153, 324, 112, 323, 482, 336, 478, 375, 147, 370, 324],
            "red": [391, 257, 288, 363, 296, 105, 278, 138, 303, 112, 306, 459, 308, 454, 355, 138, 370, 300],
        },
    },
    "deste": {
        "slug": "konopiste-deste",
        "par": [4, 4, 5, 3, 4, 4, 5, 3, 4, 4, 3, 5, 4, 4, 4, 5, 3, 4],
        "tees": ["white", "yellow", "blue", "red"],
        "metres": {
            "white": [334, 369, 483, 135, 336, 359, 460, 218, 328, 301, 177, 478, 408, 364, 351, 458, 150, 377],
            "yellow": [321, 355, 453, 127, 319, 346, 436, 193, 306, 288, 154, 454, 384, 333, 340, 429, 140, 352],
            "blue": [299, 333, 423, 120, 297, 332, 416, 172, 285, 264, 140, 428, 365, 313, 322, 409, 131, 323],
            "red": [283, 305, 391, 113, 273, 320, 395, 149, 262, 252, 120, 395, 338, 290, 311, 390, 121, 303],
        },
    },
}
FALLBACK_SCALE = 2.1  # px per metre, the common drawing scale


def fetch(slug, hole):
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, f"{slug}-{hole}.png")
    if not os.path.exists(p):
        urllib.request.urlretrieve(f"https://hector.golf/images/courses/{slug}/holes/{hole}.png", p)
    return p


def blobs(mask):
    H, W = mask.shape
    seen = np.zeros_like(mask, bool)
    out = []
    for y0, x0 in zip(*np.where(mask)):
        if seen[y0, x0]:
            continue
        q = deque([(y0, x0)]); seen[y0, x0] = True; pts = []
        while q:
            y, x = q.popleft(); pts.append((y, x))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < H and 0 <= nx < W and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True; q.append((ny, nx))
        ys = np.array([p[0] for p in pts]); xs = np.array([p[1] for p in pts])
        out.append({"y": float(ys.mean()), "x": float(xs.mean()), "area": len(pts)})
    return out


def analyse(course, hole):
    c = COURSES[course]
    im = np.array(Image.open(fetch(c["slug"], hole)).convert("RGBA"))
    H, W, _ = im.shape
    r, g, b, a = [im[..., i].astype(int) for i in range(4)]
    shape = a > 60
    light = (a > 200) & (g > 170) & (r > 120) & (r < 200) & (b < 150)
    bl = blobs(light)
    big = max(bl, key=lambda x: x["area"])  # fairway+green
    ovals = [x for x in bl if 120 <= x["area"] <= 900]
    # Tee ovals: the small light blobs, ordered back → front = farthest from the big blob first
    ovals.sort(key=lambda o: -math.hypot(o["x"] - big["x"], o["y"] - big["y"]))
    tees = {}
    warn = None
    names = c["tees"]
    # Tees of equal length share one oval on the map (Radecký 5: blue = red = 296 m),
    # so the ovals to expect are the distinct lengths, back → front.
    groups = []
    for n in names:
        m = c["metres"][n][hole - 1]
        if groups and groups[-1]["m"] == m:
            groups[-1]["tees"].append(n)
        else:
            groups.append({"m": m, "tees": [n]})
    if len(ovals) >= len(groups):
        if len(ovals) > len(groups):
            warn = f"{len(ovals)} ovals for {len(groups)} tee lengths — using the {len(groups)} farthest"
        for grp, o in zip(groups, ovals):
            for n in grp["tees"]:
                tees[n] = o
    else:
        # Ovals merged into one blob (d'Este 15): place the tees along the axis from the
        # shape's far tip towards the fairway, spaced by their metre differences.
        ys, xs = np.where(shape)
        d2 = (xs - big["x"]) ** 2 + (ys - big["y"]) ** 2
        k = int(np.argmax(d2)); tip = (float(xs[k]), float(ys[k]))
        L = math.hypot(big["x"] - tip[0], big["y"] - tip[1])
        ux, uy = (big["x"] - tip[0]) / L, (big["y"] - tip[1]) / L
        back = (tip[0] + ux * 14, tip[1] + uy * 14)  # half an oval in from the tip
        for grp in groups:
            dm = groups[0]["m"] - grp["m"]
            o = {"x": back[0] + ux * dm * FALLBACK_SCALE, "y": back[1] + uy * dm * FALLBACK_SCALE, "area": 0}
            for n in grp["tees"]:
                tees[n] = o
        warn = f"{len(ovals)} ovals for {len(groups)} tee lengths — tees estimated from the tip"
    # Scale: least squares of pixel distance vs metre difference between tee pairs
    pairs = []
    for i, n1 in enumerate(names):
        for n2 in names[i + 1:]:
            if n1 in tees and n2 in tees and tees[n1]["area"] and tees[n2]["area"]:
                dm = abs(c["metres"][n1][hole - 1] - c["metres"][n2][hole - 1])
                dp = math.hypot(tees[n1]["x"] - tees[n2]["x"], tees[n1]["y"] - tees[n2]["y"])
                if dm >= 15:
                    pairs.append((dm, dp))
    if pairs:
        num = sum(dm * dp for dm, dp in pairs); den = sum(dm * dm for dm, dp in pairs)
        scale = num / den
        if not (1.6 <= scale <= 2.7):
            warn = (warn or "") + f" scale {scale:.2f} off — fallback"
            scale = FALLBACK_SCALE
    else:
        scale = FALLBACK_SCALE
    arcs = {}
    for tee, o in tees.items():
        arcs[tee] = {}
        for d in DISTANCES:
            rad = d * scale
            pts = []
            for k in range(1440):
                th = 2 * math.pi * k / 1440
                x = o["x"] + rad * math.cos(th); y = o["y"] + rad * math.sin(th)
                xi, yi = int(round(x)), int(round(y))
                inside = 0 <= xi < W and 0 <= yi < H and shape[yi, xi]
                pts.append((inside, x, y))
            # runs of consecutive inside points; keep the longest (the fairway crossing)
            runs, cur = [], []
            for inside, x, y in pts + [pts[0]]:
                if inside:
                    cur.append((x, y))
                elif cur:
                    runs.append(cur); cur = []
            if not runs:
                continue
            run = max(runs, key=len)
            if len(run) < 6:
                continue
            step = max(1, len(run) // 12)
            sampled = run[::step] + [run[-1]]
            path = "M" + " L".join(f"{x:.0f} {y:.0f}" for x, y in sampled)
            mid = run[len(run) // 2]
            arcs[tee][str(d)] = {"d": path, "mid": [round(mid[0]), round(mid[1])]}
    return {
        "w": W, "h": H, "scale": round(scale, 3),
        "tees": {n: {"x": round(o["x"], 1), "y": round(o["y"], 1)} for n, o in tees.items()},
        "arcs": arcs,
    }, warn


def main():
    report = "--report" in sys.argv
    data = {}
    for course, c in COURSES.items():
        data[course] = {}
        for hole in range(1, 19):
            res, warn = analyse(course, hole)
            data[course][str(hole)] = res
            have = {t: sorted(int(k) for k in a) for t, a in res["arcs"].items()}
            print(f"{course} {hole:2d} par {c['par'][hole-1]} {res['w']}x{res['h']} scale {res['scale']:.2f} "
                  f"tees {len(res['tees'])} yellow arcs {have.get('yellow', [])}" + (f"  ⚠ {warn}" if warn else ""))
    if not report:
        with open(OUT, "w") as f:
            json.dump(data, f, separators=(",", ":"))
        print("wrote", OUT, os.path.getsize(OUT) // 1024, "KB")


if __name__ == "__main__":
    main()
