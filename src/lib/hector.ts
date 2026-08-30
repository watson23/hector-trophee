import type { FormatKind } from "../types";

/**
 * Hector points — the pair competition.
 *
 * The whole total behaves like a stroke count: **lower is better**, and roughly one
 * stroke is one point. Stroke-play formats (better ball, scramble, individual stroke
 * play) contribute their net score directly. Stableford is the one format that has to be
 * converted, since its points run the other way:
 *
 *     strokes = 2 × par − (points + 36)
 *
 * so 42 points on a par 72 becomes 144 − 78 = 66, which is the 6-under the player
 * actually shot.
 *
 * Each round then contributes a share of that stroke figure, set per round in the round
 * config. The 2025 weights and the reasoning behind them:
 *
 *   R1 Stableford        33%   deliberately light, so the draft round can't open a gap
 *                              so large that the last pair gives up on day one
 *   R2 Better ball       50%
 *   R3 Stroke play       25%   applied to BOTH players, so ~50% of a single round —
 *                              this is the fix for older Hectors where an individual
 *                              round counted double everything else
 *   R4 Scramble          50%
 *   R5 Better ball       50%
 *   R6 Scramble         100%   heaviest, so the trophy stays live into the final round,
 *                              and so one stroke ≈ one leaderboard point while playing it
 *
 * A pair going round in level par every round therefore totals about 239.8:
 * 0.33×72 + 0.5×72 + 2×0.25×72 + 0.5×72 + 0.5×72 + 1.0×72.
 *
 * For reference, 2025 finished with 222.0 winning, 242.6 last, and a median of 233.2.
 *
 * ⚠️ Note the leaderboard published at hector.golf is uniformly 108.0 below these
 * figures — it showed the 2025 winners on 114.0 rather than 222.0. The gaps between
 * pairs are right there, only the absolute scale is off. This app follows the rules
 * above, so its totals will not match that page.
 */

export interface HectorInput {
  /** Stableford points, or net strokes, depending on `kind`. */
  value: number;
  kind: FormatKind;
  /** Par for the course, normally 72. */
  par: number;
  /** The round's weight, e.g. 0.33, 0.5, 0.25, 1.0. */
  pct: number;
}

/** Stableford points expressed as strokes against the course par. */
export function stablefordToStrokes(points: number, par: number): number {
  return 2 * par - (points + 36);
}

/** Lower total wins — the score reads like a stroke count. */
export const hectorLowerIsBetter = true;

export function hectorContribution({ value, kind, par, pct }: HectorInput): number {
  return pct * (kind === "stableford" ? stablefordToStrokes(value, par) : value);
}

/**
 * Birdie and eagle bonuses in the final scramble. They help the pair, and the total is
 * a stroke count, so they come off it.
 */
export function applyBonuses(contribution: number, bonusPoints: number): number {
  return contribution - bonusPoints;
}

/**
 * What a pair going round in level par every round would total — useful context on the
 * leaderboard, since a bare "231.4" means nothing without it.
 */
export function levelParTotal(
  weights: { pct: number; countsBothPlayers?: boolean }[],
  par: number,
): number {
  return weights.reduce((sum, w) => sum + w.pct * par * (w.countsBothPlayers ? 2 : 1), 0);
}
