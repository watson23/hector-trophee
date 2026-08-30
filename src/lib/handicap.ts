import type { Tee } from "../types";

/**
 * WHS course handicap: HI × (slope / 113) + (CR − par), rounded to the nearest stroke.
 *
 * The (CR − par) term matters here: Radecký white is rated 73.7 against a par of 72, so
 * every player gets nearly two extra strokes compared with a slope-only calculation.
 */
export function courseHandicap(hi: number, tee: Tee): number {
  return Math.round(hi * (tee.slope / 113) + (tee.cr - tee.par));
}

/** Playing handicap = course handicap × the format's allowance, rounded. */
export function playingHandicap(courseHcp: number, allowance: number): number {
  return Math.round(courseHcp * allowance);
}

/**
 * Strokes received on each of the 18 holes, in hole order.
 *
 * Handles handicaps above 18 (two strokes on the hardest holes) and plus handicaps,
 * where strokes are given back starting from the easiest hole (stroke index 18).
 */
export function strokeAllocation(playingHcp: number, si: number[]): number[] {
  const sign = playingHcp < 0 ? -1 : 1;
  const total = Math.abs(playingHcp);
  const base = Math.floor(total / 18);
  const remainder = total % 18;
  return si.map((strokeIndex) => {
    const rank = sign > 0 ? strokeIndex : 19 - strokeIndex;
    return sign * (base + (rank <= remainder ? 1 : 0));
  });
}

/** Strokes received on a single hole (1-indexed). */
export function strokesOnHole(playingHcp: number, si: number[], hole: number): number {
  return strokeAllocation(playingHcp, si)[hole - 1];
}

/**
 * Team handicap for a scramble.
 *
 * `combined` (the default) is `allowance × (chA + chB)` — i.e. 20% of the two course
 * handicaps added together, which is how Hector has been playing it. `split` is the
 * common alternative, 35% of the lower plus 15% of the higher.
 */
export type ScrambleMethod = "combined" | "split";

export function scrambleTeamHandicap(
  chA: number,
  chB: number,
  allowance: number,
  method: ScrambleMethod = "combined",
): number {
  if (method === "split") {
    const low = Math.min(chA, chB);
    const high = Math.max(chA, chB);
    return Math.round(0.35 * low + 0.15 * high);
  }
  return Math.round(allowance * (chA + chB));
}
