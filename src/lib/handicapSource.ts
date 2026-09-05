import type { FieldPlayer } from "../types";
import { EVENT_ID } from "../data/field";
import { eventUrl, parseHandicaps, type FetchedHandicap } from "../../api/_lib/handicapPage";

/**
 * Handicaps, pulled from the event page on hector.golf.
 *
 * That page recalculates every night, so it is the authority during the week. The
 * parser itself lives in api/_lib/handicapPage.ts — one implementation shared with the
 * 07:00 cron, see the note there — and this module adds the app-side concerns:
 * fetching, diffing against the current field, and applying what changed.
 *
 * Player ids match the app's, because the app took them from the same page in the
 * first place — `/players/jari-k` is `jari-k` here too.
 */
export const HECTOR_EVENT_URL = eventUrl(EVENT_ID);

export { parseHandicaps, type FetchedHandicap };

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

export function applyHandicaps(
  current: FieldPlayer[],
  fetched: FetchedHandicap[],
  /** Once the draft has begun the buckets are history — indexes still move, pools don't. */
  freezeBuckets = false,
): FieldPlayer[] {
  const byId = new Map(fetched.map((f) => [f.id, f]));
  return current.map((p) => {
    const f = byId.get(p.id);
    // A hand-set index stays put; the source is being overridden on purpose.
    if (p.hiLocked) return p;
    // Bucket comes along with the handicap until the draft: hector.golf recomputes both
    // nightly, and a stale bucket here would run Thursday's draft with the wrong pools.
    if (!f) return p;
    return freezeBuckets ? { ...p, hi: f.hi } : { ...p, hi: f.hi, bucket: f.bucket };
  });
}
