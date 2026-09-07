import type { Card, Course, Tee } from "../../src/types.js";
import { courseHandicap, playingHandicap, strokeAllocation } from "./handicap.js";

/** Gross score on a hole, or null if it hasn't been entered yet. */
export function holeGross(card: Card | undefined, hole: number): number | null {
  const v = card?.holes?.[String(hole)];
  return typeof v === "number" && v > 0 ? v : null;
}

export function holesPlayed(card: Card | undefined): number {
  if (!card?.holes) return 0;
  return Object.values(card.holes).filter((v) => typeof v === "number" && v > 0).length;
}

/** Net score on a hole. Never drops below 1. */
/**
 * Net score is plain arithmetic: a hole-in-one with a stroke received is a net 0, and a
 * 2 with two strokes a net 0 too. The old floor of 1 quietly turned those into a net 1 —
 * on the card and in the points (one fewer than earned).
 */
export function netScore(gross: number, strokes: number): number {
  return gross - strokes;
}

/** Standard Stableford: 2 points for a net par, one more per stroke better. */
export function stablefordPoints(par: number, net: number): number {
  return Math.max(0, 2 + par - net);
}

export interface PlayerRoundContext {
  hi: number;
  course: Course;
  tee: Tee;
  allowance: number;
}

/** Resolve a player's playing handicap and per-hole strokes for one format. */
export function allocationFor(ctx: PlayerRoundContext) {
  const ch = courseHandicap(ctx.hi, ctx.tee);
  const ph = playingHandicap(ch, ctx.allowance);
  return { courseHcp: ch, playingHcp: ph, strokes: strokeAllocation(ph, ctx.course.si) };
}

export interface StablefordResult {
  points: number;
  thru: number;
  perHole: (number | null)[];
  playingHcp: number;
}

export function stablefordResult(card: Card | undefined, ctx: PlayerRoundContext): StablefordResult {
  const { playingHcp, strokes } = allocationFor(ctx);
  let points = 0;
  let thru = 0;
  const perHole = ctx.course.par.map((par, i) => {
    const gross = holeGross(card, i + 1);
    if (gross === null) return null;
    thru += 1;
    const p = stablefordPoints(par, netScore(gross, strokes[i]));
    points += p;
    return p;
  });
  return { points, thru, perHole, playingHcp };
}

export interface StrokePlayResult {
  strokes: number;
  toPar: number;
  thru: number;
  perHole: (number | null)[];
  playingHcp: number;
}

/** Stroke play, gross or net depending on `net`. `toPar` covers only the holes played. */
export function strokePlayResult(
  card: Card | undefined,
  ctx: PlayerRoundContext,
  net: boolean,
): StrokePlayResult {
  const { playingHcp, strokes } = allocationFor(ctx);
  let total = 0;
  let parPlayed = 0;
  let thru = 0;
  const perHole = ctx.course.par.map((par, i) => {
    const gross = holeGross(card, i + 1);
    if (gross === null) return null;
    thru += 1;
    parPlayed += par;
    const value = net ? netScore(gross, strokes[i]) : gross;
    total += value;
    return value;
  });
  return {
    strokes: total,
    toPar: total - parPlayed,
    thru,
    perHole,
    playingHcp: net ? playingHcp : 0,
  };
}

export interface TeamRoundResult {
  /** Net strokes over the holes played — on a scramble, drive penalties included. */
  strokes: number;
  toPar: number;
  thru: number;
  perHole: (number | null)[];
  /** Which player's ball counted, per hole — better ball only. */
  contributor?: (string | null)[];
  birdies: number;
  eagles: number;
  /** Scramble: strokes added for tee shots a player did not get to use often enough. */
  penalty: number;
  /** Scramble: how many of each player's drives were used, and how many are still owed. */
  drives?: { playerId: string; used: number; missing: number }[];
}

/** The tournament's drive rule for scrambles, unless a round says otherwise. */
export const DEFAULT_DRIVES = { min: 6, penalty: 2 };

export interface DriveQuota {
  players: [string, string];
  min: number;
  penalty: number;
}

/** A round's drive rule, or null when the format is not a scramble or the round turned it off. */
export function drivesRule(spec: { kind: string; drives?: { min: number; penalty: number } }): { min: number; penalty: number } | null {
  if (spec.kind !== "scramble") return null;
  const rule = spec.drives ?? DEFAULT_DRIVES;
  return rule.min > 0 && rule.penalty > 0 ? rule : null;
}

/**
 * The drive penalty as it stands — live-correct, never premature. A player is short
 * only by the drives they can no longer make up: quota minus used minus the holes not
 * yet marked (unplayed, or played with nobody's drive recorded). At the end of a fully
 * marked card that is simply quota minus used; mid-round it is zero until the shortfall
 * is certain. Unmarked holes are never penalised — the app cannot know whose drive it
 * was, so the pair is given the benefit of the doubt, and the marking is on them.
 */
export function drivePenalty(
  drives: Record<string, string> | undefined,
  quota: DriveQuota,
  holeCount = 18,
): { penalty: number; drives: { playerId: string; used: number; missing: number }[] } {
  const marked = Object.values(drives ?? {});
  const unknown = holeCount - marked.length;
  const perPlayer = quota.players.map((playerId) => {
    const used = marked.filter((id) => id === playerId).length;
    const missing = Math.max(0, quota.min - used - unknown);
    return { playerId, used, missing };
  });
  const penalty = perPlayer.reduce((a, p) => a + p.missing * quota.penalty, 0);
  return { penalty, drives: perPlayer };
}

/**
 * Better ball: each player plays their own net ball, the team takes the lower one.
 * A hole counts as soon as either player has a score.
 */
export function betterBallResult(
  cardA: Card | undefined,
  cardB: Card | undefined,
  ctxA: PlayerRoundContext & { playerId: string },
  ctxB: PlayerRoundContext & { playerId: string },
): TeamRoundResult {
  const a = allocationFor(ctxA);
  const b = allocationFor(ctxB);
  let total = 0;
  let parPlayed = 0;
  let thru = 0;
  let birdies = 0;
  let eagles = 0;
  const contributor: (string | null)[] = [];
  const perHole = ctxA.course.par.map((par, i) => {
    const ga = holeGross(cardA, i + 1);
    const gb = holeGross(cardB, i + 1);
    if (ga === null && gb === null) {
      contributor.push(null);
      return null;
    }
    const na = ga === null ? Infinity : netScore(ga, a.strokes[i]);
    const nb = gb === null ? Infinity : netScore(gb, b.strokes[i]);
    const best = Math.min(na, nb);
    contributor.push(na <= nb ? ctxA.playerId : ctxB.playerId);
    thru += 1;
    parPlayed += par;
    total += best;
    if (best === par - 1) birdies += 1;
    if (best <= par - 2) eagles += 1;
    return best;
  });
  return { strokes: total, toPar: total - parPlayed, thru, perHole, contributor, birdies, eagles, penalty: 0 };
}

/**
 * Scramble: one gross card for the pair, one team handicap applied over the 18 holes.
 *
 * Birdies and eagles are counted on the team's GROSS score — a scramble birdie is the
 * one everybody round the green just watched drop, not a handicap artefact. With a team
 * handicap of four or five, counting them net would roughly double the tally and hand
 * out bonus points nobody saw earned. ⚠️ Worth confirming with the organiser, since the
 * published rules say only "0.5 points for each Birdie".
 */
export function scrambleResult(
  card: Card | undefined,
  course: Course,
  teamPlayingHcp: number,
  quota?: DriveQuota | null,
): TeamRoundResult {
  const strokes = strokeAllocation(teamPlayingHcp, course.si);
  let total = 0;
  let parPlayed = 0;
  let thru = 0;
  let birdies = 0;
  let eagles = 0;
  const perHole = course.par.map((par, i) => {
    const gross = holeGross(card, i + 1);
    if (gross === null) return null;
    thru += 1;
    parPlayed += par;
    const net = netScore(gross, strokes[i]);
    total += net;
    if (gross === par - 1) birdies += 1;
    if (gross <= par - 2) eagles += 1;
    return net;
  });
  // The drive rule lands on the total, not on any hole: it is a penalty on the round.
  const drv = quota && thru > 0 ? drivePenalty(card?.drives, quota, course.par.length) : null;
  const penalty = drv?.penalty ?? 0;
  return {
    strokes: total + penalty,
    toPar: total + penalty - parPlayed,
    thru,
    perHole,
    birdies,
    eagles,
    penalty,
    ...(drv ? { drives: drv.drives } : {}),
  };
}
