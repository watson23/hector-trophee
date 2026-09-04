import type { HoleCapRule } from "../types";

export const HOLE_CAP_LABEL: Record<HoleCapRule, string> = {
  none: "No cap",
  par5: "Par + 5",
  ndb: "Net double bogey",
};

export const HOLE_CAP_HELP: Record<HoleCapRule, string> = {
  none: "Every hole is scored as played.",
  par5: "The most a hole can cost is par + 5, whoever you are.",
  ndb: "The most a hole can cost is a net double bogey: par + 2 + the strokes you receive there.",
};

/** The cap on one hole for one player, or null when the tournament plays without one. */
export function holeCap(rule: HoleCapRule | undefined, par: number, strokesReceived: number): number | null {
  if (!rule || rule === "none") return null;
  if (rule === "par5") return par + 5;
  return par + 2 + Math.max(0, strokesReceived);
}

/** A score as it is stored: at most the cap, when there is one. */
export function applyCap(value: number, cap: number | null): number {
  return cap === null ? value : Math.min(value, cap);
}
