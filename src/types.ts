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
  /** Set by hand in Admin: the daily refresh from hector.golf leaves this index alone. */
  hiLocked?: boolean;
}

export interface Pair {
  id: string;
  aId: string;
  bId: string;
  /** Last year's winners, paired by right rather than drafted. */
  defending?: boolean;
}

/** The format kinds used across the six rounds (stroke play covers both NET and SCR). */
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

/**
 * A note from the organisers — lunch moved, tee change, bus leaves at nine. WhatsApp
 * stays the main channel; this is for the absolute essentials that must be findable in
 * the app, with an unread dot on the Info tab.
 */
export interface Announcement {
  id: string;
  text: string;
  /** Date.now() when posted. */
  at: number;
  /** Who posted it — a player's name, or "Hector" for the app's own announcements. */
  by?: string;
}

/**
 * One day of app usage, for the organiser's curiosity after the trip: who opened the
 * app, how often, and which tabs they looked at. Nothing here affects scoring.
 */
export interface UsageDay {
  /** YYYY-MM-DD, local time of the phone that wrote it. */
  date: string;
  players: Record<string, { lastSeen: number; opens: number; views: Record<string, number> }>;
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
  announcements?: Announcement[];
  /**
   * Last year's winning pair, who defend their title together regardless of the draft.
   *
   * `undefined` means nobody has said yet; `null` means they declined, which has never
   * happened but is theirs to decide. Until it is resolved both players sit out of the
   * draft pool, because the draft runs among everyone else.
   */
  defendingPair?: [string, string] | null;
  /**
   * Thursday night's draft board stays up — Round tab relabelled "Draft", the board
   * shown even once all pairs stand — until the organiser concludes it in Admin.
   */
  draftConcluded?: boolean;
  /**
   * The tournament's maximum score on a hole, if it plays with one: "par5" = par + 5,
   * "ndb" = net double bogey + 2 (par + 4 + the strokes received on the hole). Entry offers
   * it as a button, and anything entered above it is stored as the cap — which is also
   * what a picked-up ball ("–") scores.
   */
  holeCap?: HoleCapRule;
}

export type HoleCapRule = "none" | "par5" | "ndb";

/** A single scorecard. `holes` is a sparse map so per-hole writes merge. */
export interface Card {
  id: string;
  roundId: string;
  /** Player id, or `team__<pairId>` for scramble cards. */
  subjectId: string;
  holes: Record<string, number>;
  updatedAt?: number;
  updatedBy?: string;
  /** Player has entered this round into eBirdie/GameBook for official handicap. */
  hcpSubmitted?: boolean;
}
