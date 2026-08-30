/** Domain types for Hector Trophée 2026. */

export type TeeColour = "black" | "white" | "yellow" | "blue" | "red";

export interface Tee {
  colour: TeeColour;
  /** Course Rating. */
  cr: number;
  slope: number;
  par: number;
  metres: number;
  /** True when the published rating looks like a ladies' rating (see courses.ts). */
  suspect?: boolean;
}

export interface Course {
  id: string;
  name: string;
  shortName: string;
  par: number[];
  /** Stroke index per hole, 1..18. */
  si: number[];
  tees: Record<string, Tee>;
}

export interface FieldPlayer {
  id: string;
  name: string;
  /** WHS Handicap Index. */
  hi: number;
  bucket: 1 | 2;
}

export interface Pair {
  id: string;
  aId: string;
  bId: string;
}

/** The five game formats used across the six rounds. */
export type FormatKind =
  | "stableford"
  | "strokeplay"
  | "betterball"
  | "scramble";

/** Where a format's Hector contribution comes from. */
export type HectorSource =
  /** 33% of the better individual's score (day 1 Stableford). */
  | "betterIndividual"
  /** 50%/100% of the team's score (better ball, scramble). */
  | "team"
  /** 25% of each individual's score, both counted (day 2 stroke play). */
  | "bothIndividuals";

export interface FormatSpec {
  id: string;
  kind: FormatKind;
  /** Display label, e.g. "Better Ball Stroke Play NET". */
  label: string;
  /** Net play uses handicap strokes; gross ("SCR") does not. */
  net: boolean;
  /** Handicap allowance, e.g. 1.0 or 0.2. */
  allowance: number;
  /** Whether this format is scored on one card per pair rather than per player. */
  teamCard: boolean;
  hector?: { source: HectorSource; pct: number };
  victor?: { pct: number };
  /** Extra Hector points for birdies/eagles (day 4 scramble). */
  bonuses?: { birdie?: number; eagle?: number };
}

export type RoundStatus = "upcoming" | "open" | "final";

export interface PlayingGroup {
  id: string;
  /** Flight tee time, e.g. "12:03". */
  teeTime: string;
  playerIds: string[];
}

export interface Round {
  id: string;
  /** 1..6 */
  seq: number;
  /** Day label, e.g. "Thu 24.9". */
  day: string;
  date: string;
  courseId: string;
  tee: string;
  /** Overrides for the published CR/slope when they look wrong. */
  crOverride?: number;
  slopeOverride?: number;
  status: RoundStatus;
  /**
   * The handicap index each player actually played this round off, captured when the
   * round opens.
   *
   * Handicaps are refreshed daily during the week, and scores are computed from them on
   * demand — so without a snapshot, Wednesday's new index would silently rescore Monday's
   * round. Falls back to the player's current index for rounds not yet opened.
   */
  handicaps?: Record<string, number>;
  formats: FormatSpec[];
  groups: PlayingGroup[];
  teeTimeWindow: string;
  /** True until the 2026 formats/tees are confirmed against the official programme. */
  provisional?: boolean;
}

export interface EventDoc {
  id: string;
  name: string;
  venue: string;
  dates: string;
  pinHash: string;
  adminPinHash: string;
  players: FieldPlayer[];
  pairs: Pair[];
}

/** A single scorecard. `holes` is a sparse map so per-hole writes merge. */
export interface Card {
  id: string;
  roundId: string;
  /** Player id, or `team__<pairId>` for scramble cards. */
  subjectId: string;
  holes: Record<string, number>;
  updatedAt?: number;
  updatedBy?: string;
}
