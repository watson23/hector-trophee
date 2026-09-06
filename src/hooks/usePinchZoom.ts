import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";

export interface ZoomTransform {
  /** 1 = fitted, up to `max`. */
  s: number;
  /** Translation in viewport pixels, applied before the scale (transform-origin 0 0). */
  tx: number;
  ty: number;
}

const IDENTITY: ZoomTransform = { s: 1, tx: 0, ty: 0 };

/**
 * Pinch-to-zoom and drag-to-pan for one element inside a fixed, clipped viewport.
 *
 * The page's viewport meta has `maximum-scale=1` so the app never zooms as a whole
 * (a golfer's thumb should not blow up the entry sheet), which is why the hole map
 * needs its own gesture. Pointer events do the work: two pointers scale about their
 * midpoint, one pointer pans once zoomed, a double tap zooms in on the spot or resets,
 * and a trackpad pinch (a ctrl-wheel) does the same on a desk. The image is never
 * allowed to leave the viewport, and letting go near 1× snaps back to fitted, so the
 * map cannot be left slightly askew.
 *
 * While fitted, `touch-action` stays `pan-y` so the page still scrolls over the map;
 * once zoomed, the map takes the gesture.
 */
export function usePinchZoom(max = 4) {
  const [t, setT] = useState<ZoomTransform>(IDENTITY);
  const viewport = useRef<HTMLDivElement | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; mid: { x: number; y: number }; t: ZoomTransform } | null>(null);
  const pan = useRef<{ x: number; y: number; t: ZoomTransform } | null>(null);
  const lastTap = useRef<{ at: number; x: number; y: number } | null>(null);
  const moved = useRef(false);
  // Mirror of `t` for event handlers, kept in step by `commit` — never read in render.
  const current = useRef<ZoomTransform>(IDENTITY);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = viewport.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };

  const clamp = useCallback((next: ZoomTransform): ZoomTransform => {
    const r = viewport.current?.getBoundingClientRect();
    const w = r?.width ?? 0;
    const h = r?.height ?? 0;
    const s = Math.min(max, Math.max(1, next.s));
    return {
      s,
      tx: Math.min(0, Math.max(w - w * s, next.tx)),
      ty: Math.min(0, Math.max(h - h * s, next.ty)),
    };
  }, [max]);

  /** Scale so that the content point under `at` stays under `at`. */
  const zoomAbout = useCallback(
    (from: ZoomTransform, s: number, at: { x: number; y: number }, to = at) => {
      const px = (at.x - from.tx) / from.s;
      const py = (at.y - from.ty) / from.s;
      return clamp({ s, tx: to.x - px * s, ty: to.y - py * s });
    },
    [clamp],
  );

  const commit = useCallback((next: ZoomTransform) => {
    setT(next);
    current.current = next;
  }, []);

  const onPointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    try {
      viewport.current?.setPointerCapture(e.pointerId);
    } catch {
      /* a pointer the browser no longer knows — the gesture still tracks by id */
    }
    moved.current = false;
    const pts = [...pointers.current.values()];
    if (pts.length === 2) {
      pan.current = null;
      gesture.current = {
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        mid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
        t: current.current,
      };
    } else if (pts.length === 1 && current.current.s > 1) {
      pan.current = { x: p.x, y: p.y, t: current.current };
    }
  }, []);

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!pointers.current.has(e.pointerId)) return;
      const p = local(e);
      pointers.current.set(e.pointerId, p);
      const pts = [...pointers.current.values()];
      if (pts.length >= 2 && gesture.current) {
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        const g = gesture.current;
        if (Math.abs(dist - g.dist) > 2 || Math.hypot(mid.x - g.mid.x, mid.y - g.mid.y) > 2) moved.current = true;
        const s = Math.min(max, Math.max(1, (g.t.s * dist) / Math.max(1, g.dist)));
        commit(zoomAbout(g.t, s, g.mid, mid));
      } else if (pts.length === 1 && pan.current) {
        const d = pan.current;
        if (Math.hypot(p.x - d.x, p.y - d.y) > 3) moved.current = true;
        commit(clamp({ s: d.t.s, tx: d.t.tx + (p.x - d.x), ty: d.t.ty + (p.y - d.y) }));
      }
    },
    [clamp, commit, max, zoomAbout],
  );

  const onPointerUp = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const wasPinch = gesture.current !== null;
      const p = local(e);
      pointers.current.delete(e.pointerId);
      const pts = [...pointers.current.values()];
      if (pts.length === 1) {
        // The other finger stays down: carry on as a pan from where it is.
        gesture.current = null;
        pan.current = current.current.s > 1 ? { x: pts[0].x, y: pts[0].y, t: current.current } : null;
        return;
      }
      if (pts.length > 0) return;
      gesture.current = null;
      pan.current = null;
      if (current.current.s < 1.08) {
        commit(IDENTITY);
      }
      if (wasPinch || moved.current || e.pointerType === "mouse") return;
      // A clean tap: the second within 300 ms zooms in on the spot, or resets when zoomed.
      const now = Date.now();
      const last = lastTap.current;
      if (last && now - last.at < 300 && Math.hypot(p.x - last.x, p.y - last.y) < 30) {
        lastTap.current = null;
        commit(current.current.s > 1 ? IDENTITY : zoomAbout(current.current, 2.5, p));
      } else {
        lastTap.current = { at: now, x: p.x, y: p.y };
      }
    },
    [commit, zoomAbout],
  );

  // A trackpad pinch arrives as a wheel with ctrlKey. React registers wheel listeners
  // as passive, so the browser's own page zoom can only be stopped from a native one.
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const onWheel = (e: globalThis.WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const s = Math.min(max, Math.max(1, current.current.s * Math.exp(-e.deltaY / 200)));
      commit(s <= 1.02 ? IDENTITY : zoomAbout(current.current, s, local(e)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [commit, max, zoomAbout]);

  const reset = useCallback(() => commit(IDENTITY), [commit]);
  // A callback ref rather than the ref object: what the hook hands back is then plain
  // values and functions, which is also what React's ref rules ask of render.
  const viewportRef = useCallback((el: HTMLDivElement | null) => {
    viewport.current = el;
  }, []);

  return {
    t,
    zoomed: t.s > 1,
    reset,
    viewportRef,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
    /** Style for the moving layer. */
    style: { transform: `translate(${t.tx}px, ${t.ty}px) scale(${t.s})`, transformOrigin: "0 0" as const },
    /** Style for the viewport: the page scrolls over a fitted map, a zoomed map takes the touch. */
    viewportStyle: { touchAction: t.s > 1 ? ("none" as const) : ("pan-y" as const) },
  };
}
