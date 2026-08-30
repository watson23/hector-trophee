import type { FormatKind } from "../types";

/**
 * How a round's raw result turns into Hector points.
 *
 * The published wording ("33% of the better individual's score", "50% of the team's
 * score", "100% of the team's score") does not say what currency those scores are in,
 * and taking it literally does not reproduce hector.golf's own totals: the 2025 winners
 * finished on 114.0 with last place on 134.6, whereas a literal weighted sum of net
 * strokes lands somewhere around 190–210 for any plausible set of scores.
 *
 * `parNormalised` is the one strategy that does reproduce that scale — the six rounds
 * carry weights summing to 3.33, and 114.0 / 3.33 ≈ 34.2, which is exactly
 * (net strokes − 36) for a 70 and (72 − points) for a 38-point Stableford round. It is
 * the default until the official formula is confirmed.
 *
 * Swapping strategies is a one-line change to HECTOR_STRATEGY; nothing else in the app
 * depends on which one is active.
 */
export type HectorStrategyName = "parNormalised" | "raw" | "stablefordUnified";

export interface HectorInput {
  /** Stableford points, or net/gross strokes, depending on `kind`. */
  value: number;
  kind: FormatKind;
  /** Par for the course, normally 72. */
  par: number;
  /** The published weight, e.g. 0.33, 0.5, 0.25, 1.0. */
  pct: number;
}

interface Strategy {
  name: HectorStrategyName;
  description: string;
  lowerIsBetter: boolean;
  contribution: (input: HectorInput) => number;
}

const strategies: Record<HectorStrategyName, Strategy> = {
  /** Everything expressed as "shots dropped": (net strokes − par/2), (par − points). */
  parNormalised: {
    name: "parNormalised",
    description: "Weighted shots dropped — reproduces hector.golf's 2025 scale",
    lowerIsBetter: true,
    contribution: ({ value, kind, par, pct }) =>
      kind === "stableford" ? pct * (par - value) : pct * (value - par / 2),
  },

  /** Literal reading: weights applied straight to the published scores. */
  raw: {
    name: "raw",
    description: "Literal weighted scores — Stableford counts against the total",
    lowerIsBetter: true,
    contribution: ({ value, kind, pct }) =>
      kind === "stableford" ? -pct * value : pct * value,
  },

  /** Everything converted to Stableford-equivalent points; higher wins. */
  stablefordUnified: {
    name: "stablefordUnified",
    description: "Everything as Stableford points — higher total wins",
    lowerIsBetter: false,
    contribution: ({ value, kind, par, pct }) =>
      kind === "stableford" ? pct * value : pct * (36 + par - value),
  },
};

/** ← Change this one constant when the official Hector formula is confirmed. */
export const HECTOR_STRATEGY: HectorStrategyName = "parNormalised";

export const hectorStrategy = strategies[HECTOR_STRATEGY];
export const hectorLowerIsBetter = hectorStrategy.lowerIsBetter;

export function hectorContribution(input: HectorInput): number {
  return hectorStrategy.contribution(input);
}

/**
 * Birdie/eagle bonuses (day 4 scramble) always help the team, so they are subtracted
 * when a lower total wins and added when a higher one does.
 */
export function applyBonuses(contribution: number, bonusPoints: number): number {
  return hectorLowerIsBetter ? contribution - bonusPoints : contribution + bonusPoints;
}

export const HECTOR_STRATEGIES = strategies;
