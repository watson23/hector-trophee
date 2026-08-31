import type { FieldPlayer } from "../types";
import { EVENT_ID } from "../data/field";

/**
 * Handicaps, pulled from the event page on hector.golf.
 *
 * That page recalculates every night, so it is the authority during the week. It is served
 * from GitHub Pages with `access-control-allow-origin: *`, so the browser can read it
 * directly and no proxy is needed.
 *
 * Player ids match the app's, because the app took them from the same page in the first
 * place — `/players/jari-k` is `jari-k` here too.
 */
export const HECTOR_EVENT_URL = `https://hector.golf/events/hector/${EVENT_ID}/`;

export interface FetchedHandicap {
  id: string;
  name: string;
  hi: number;
  bucket: 1 | 2;
}

export interface HandicapChange {
  id: string;
  name: string;
  from: number;
  to: number;
}

/** Until the draft, a moving handicap can carry a player across the bucket line. */
export interface BucketMove {
  id: string;
  name: string;
  from: 1 | 2;
  to: 1 | 2;
}

export function parseHandicaps(html: string): FetchedHandicap[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out: FetchedHandicap[] = [];
  doc.querySelectorAll(".bucket").forEach((bucketEl) => {
    // "Bucket 1" / "Bucket 2" — the class also carries it, but the heading is what shows.
    const bucket = /2/.test(bucketEl.querySelector("h3")?.textContent ?? "") ? 2 : 1;
    bucketEl.querySelectorAll("tr").forEach((tr) => {
      const link = tr.querySelector<HTMLAnchorElement>("td.name a");
      const raw = tr.querySelector("td.handicap")?.textContent ?? "";
      const id = link?.getAttribute("href")?.split("/").filter(Boolean).pop();
      const hi = Number(raw.replace(/[()\s]/g, ""));
      if (!id || !link?.textContent || Number.isNaN(hi)) return;
      out.push({ id, name: link.textContent.trim(), hi, bucket: bucket as 1 | 2 });
    });
  });
  return out;
}

export async function fetchHandicaps(): Promise<FetchedHandicap[]> {
  const res = await fetch(HECTOR_EVENT_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`hector.golf returned ${res.status}`);
  const players = parseHandicaps(await res.text());
  if (players.length === 0) throw new Error("Couldn't find any handicaps on the page");
  return players;
}

/**
 * What would change, so the organiser sees it before it is applied. Players the page
 * doesn't mention are left alone rather than dropped — someone withdrawing upstream
 * shouldn't silently delete them mid-tournament.
 */
export function diffHandicaps(
  current: FieldPlayer[],
  fetched: FetchedHandicap[],
): { changes: HandicapChange[]; bucketMoves: BucketMove[]; unmatched: string[] } {
  const byId = new Map(fetched.map((f) => [f.id, f]));
  const changes: HandicapChange[] = [];
  const bucketMoves: BucketMove[] = [];
  for (const p of current) {
    const f = byId.get(p.id);
    if (!f) continue;
    if (Math.abs(f.hi - p.hi) > 1e-9) {
      changes.push({ id: p.id, name: p.name, from: p.hi, to: f.hi });
    }
    if (f.bucket !== p.bucket) {
      bucketMoves.push({ id: p.id, name: p.name, from: p.bucket, to: f.bucket });
    }
  }
  const known = new Set(current.map((p) => p.id));
  return {
    changes,
    bucketMoves,
    unmatched: fetched.filter((f) => !known.has(f.id)).map((f) => f.name),
  };
}

export function applyHandicaps(current: FieldPlayer[], fetched: FetchedHandicap[]): FieldPlayer[] {
  const byId = new Map(fetched.map((f) => [f.id, f]));
  return current.map((p) => {
    const f = byId.get(p.id);
    // Bucket comes along with the handicap: hector.golf recomputes both nightly, and a
    // stale bucket here would run Thursday's draft with the wrong pools.
    return f ? { ...p, hi: f.hi, bucket: f.bucket } : p;
  });
}
