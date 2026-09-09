import type { FieldPlayer, Round } from "../types";

/**
 * The handicap freeze, as rules rather than as places in the code.
 *
 * A round plays off the indexes frozen when it starts, so tomorrow's handicap update
 * never rescores today's holes. The freeze fires on opening, or on the first score into
 * a round nobody opened. The catch found on 9.9.2026: a practice score entered into an
 * upcoming round weeks before the trip froze that round then, and opening it later kept
 * the stale snapshot — seven players were playing off indexes from four days earlier.
 * Hence the timestamp, and the rule that a snapshot from an earlier day cannot be
 * protecting anything played today.
 */

export function sameLocalDay(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

/** The snapshot to write now: every player's current index, stamped. */
export function freezeNow(players: FieldPlayer[], now = Date.now()): Pick<Round, "handicaps" | "handicapsAt"> {
  return { handicaps: Object.fromEntries(players.map((p) => [p.id, p.hi])), handicapsAt: now };
}

/**
 * Whether a round leaving "upcoming" should (re)take its snapshot: always when there is
 * none; also when the one it has is from an earlier day, or from before timestamps
 * existed, because such a snapshot came from a stray score, not from today's play.
 */
export function shouldFreeze(prev: Round, nextStatus: Round["status"], now = Date.now()): boolean {
  if (nextStatus === "upcoming") return false;
  if (!prev.handicaps) return true;
  if (prev.status !== "upcoming") return false;
  return !prev.handicapsAt || !sameLocalDay(prev.handicapsAt, now);
}

/** Players whose current index differs from the one a round is played off. */
export function driftedSince(round: Round, players: FieldPlayer[]): FieldPlayer[] {
  const snap = round.handicaps;
  if (!snap) return [];
  return players.filter((p) => snap[p.id] !== undefined && snap[p.id] !== p.hi);
}
