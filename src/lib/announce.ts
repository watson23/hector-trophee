/**
 * Hector's own announcements — the app speaking into the News feed when a score
 * deserves more than a coloured digit on one phone.
 *
 * An ace is once-in-a-history news and gets the champagne treatment, prank clause
 * included. An eagle is rare enough on this field (a handful a week) to be worth a
 * line, and common enough that the line stays short. Birdies are left to the marks.
 */

export type Feat = "ace" | "albatross" | "eagle";

export interface FeatAnnouncement {
  kind: Feat;
  text: string;
}

export function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}

/** The feat a gross score on a hole amounts to, or null for anything birdie or worse. */
export function featFor(value: number | null | undefined, par: number): Feat | null {
  if (!value) return null;
  if (value === 1) return "ace";
  const diff = value - par;
  if (diff <= -3) return "albatross";
  if (diff === -2) return "eagle";
  return null;
}

/**
 * Whether Hector speaks at all: only from the tournament's first day. The app is open
 * for practice in the weeks before, and an eagle shouted then would spoil the first real
 * one. Local calendar date, so the morning of the first round counts wherever the phone is.
 */
export function featsLive(rounds: { date: string }[], now = new Date()): boolean {
  const first = rounds.map((r) => r.date).filter(Boolean).sort()[0];
  if (!first) return true;
  const pad = (n: number) => String(n).padStart(2, "0");
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return today >= first;
}

/** The News-feed id for a feat on a card's hole — one per hole, so a re-entry never posts twice. */
export function featId(kind: Feat, roundId: string, subjectId: string, hole: number): string {
  return `${kind}-${roundId}-${subjectId}-${hole}`;
}

export function featAnnouncement(args: {
  value: number;
  par: number;
  hole: number;
  /** "Jarkko K", or "Olli A + Jarkko K" for a scramble team card. */
  who: string;
  team: boolean;
  course: string;
  roundSeq: number;
}): FeatAnnouncement | null {
  const { value, par, hole, who, team, course, roundSeq } = args;
  const kind = featFor(value, par);
  if (!kind) return null;
  const where = `the ${ordinal(hole)} at ${course}`;
  if (kind === "ace") {
    // The prank-catcher: the temptation to "just see what happens" is real, and a
    // round of beers is the traditional price. The genuine hero will understand.
    return {
      kind,
      text: `🍾 HOLE-IN-ONE! ${who} aced ${where} in round ${roundSeq} — the first in Hector Trophée history. Champagne at the clubhouse! (In case this was a prank or a false alarm by ${who} after all, a round of beers on them should settle it.)`,
    };
  }
  if (kind === "albatross") {
    return {
      kind,
      text: `🦢 ALBATROSS?! ${who} took ${value} on the par-${par} ${ordinal(hole)} at ${course} in round ${roundSeq}. Rarer than an ace — so rare that the scorer should probably double-check the card before the drinks are ordered.`,
    };
  }
  return {
    kind,
    text: team
      ? `🦅 Team eagle! ${who} made ${value} on the par-${par} ${ordinal(hole)} at ${course} in round ${roundSeq}.`
      : `🦅 Eagle! ${who} made ${value} on the par-${par} ${ordinal(hole)} at ${course} in round ${roundSeq}.`,
  };
}
