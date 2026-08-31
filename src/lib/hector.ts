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
 *   R1 Stableford         1/3  deliberately light, so the draft round can't open a gap
 *                              so large that the last pair gives up on day one. Exactly a
 *                              third — the published rules round it to 33%, but the 2025
 *                              sheet computes 1/3, and only 1/3 reproduces its totals
 *   R2 Better ball       50%
 *   R3 Stroke play       25%   applied to BOTH players, so ~50% of a single round —
 *                              this is the fix for older Hectors where an individual
 *                              round counted double everything else
 *   R4 Scramble          50%
 *   R5 Better ball       50%
 *   R6 Scramble         100%   heaviest, so the trophy stays live into the final round,
 *                              and so one stroke ≈ one leaderboard point while playing it
 *
 * The weights come to 10/3 rounds, so a pair going round in level par every round totals
 * exactly 240: (1/3 + 1/2 + 2×1/4 + 1/2 + 1/2 + 1) × 72.
 *
 * 2025 finished with 222.0 winning, 242.6 last, and a mean of 233.26. All twelve of those
 * pairs are replayed against this code in hector2025.test.ts.
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

/**
 * Weights read as fractions, not percentages. They are thirds, halves and quarters, and
 * rounding 1/3 to "33%" makes the arithmetic shown beside it fail to add up.
 */
export function weightLabel(pct: number): string {
  // Percentages, not fraction glyphs: ½, ⅓ and ¼ are nearly indistinguishable at pill
  // size, and "50% / 33% / 25%" is how these weights have always been communicated in
  // this group. 33% is knowingly imprecise — the engine computes with exactly 1/3, and
  // the label follows tradition rather than the arithmetic.
  if (Math.abs(pct - 1 / 3) < 1e-9) return "33%";
  if (Math.abs(pct - 2 / 3) < 1e-9) return "67%";
  return `${Math.round(pct * 100)}%`;
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
