import type { Course, EventDoc, Round, Tee } from "../types";
import { courseHandicap } from "./handicap";
import { teamCardId } from "./engine";

/**
 * Plausible fake scores, for trying the app out before anyone has hit a ball.
 *
 * Scores are drawn around what a player of that handicap would actually shoot rather
 * than uniformly at random, so the leaderboards look like real leaderboards — a 1.5
 * beating a 14.8 on gross while the 14.8 wins on net is the interesting case to see.
 */

/** Box–Muller, so the spread looks like golf rather than a flat distribution. */
function gaussian(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function playHoles(par: number[], meanOverPar: number, holes: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (let i = 0; i < holes; i++) {
    // Clamped to eagle..triple so a stray tail doesn't produce a 12 on a par 3.
    const over = Math.max(-1, Math.min(4, Math.round(meanOverPar + gaussian() * 0.95)));
    out[String(i + 1)] = Math.max(1, par[i] + over);
  }
  return out;
}

export interface GeneratedCard {
  subjectId: string;
  holes: Record<string, number>;
}

/**
 * Cards for everyone playing `round`. Individual rounds get one card per assigned
 * player; scramble rounds get one per pair, played a bit better than either player
 * would manage alone.
 */
export function generateRoundCards(
  round: Round,
  course: Course,
  tee: Tee,
  event: EventDoc,
  holes = 18,
): GeneratedCard[] {
  const byId = new Map(event.players.map((p) => [p.id, p]));
  const assigned = new Set(round.groups.flatMap((g) => g.playerIds));
  const scramble = round.formats.find((f) => f.teamCard);

  if (scramble) {
    const pairs = event.pairs.filter(
      (p) => assigned.size === 0 || assigned.has(p.aId) || assigned.has(p.bId),
    );
    return pairs.flatMap((pair) => {
      const a = byId.get(pair.aId);
      const b = byId.get(pair.bId);
      if (!a || !b) return [];
      // Two balls per hole and the better one counts, so a scramble runs well under
      // what the stronger player shoots alone.
      const best = Math.min(courseHandicap(a.hi, tee), courseHandicap(b.hi, tee));
      const meanOver = Math.max(-0.15, (best - 4) / 18);
      return [{ subjectId: teamCardId(pair.id), holes: playHoles(course.par, meanOver, holes) }];
    });
  }

  const players = event.players.filter((p) => assigned.size === 0 || assigned.has(p.id));
  return players.map((p) => ({
    subjectId: p.id,
    // A player usually shoots a few over their course handicap, spread across 18 holes.
    holes: playHoles(course.par, (courseHandicap(p.hi, tee) + 3) / 18, holes),
  }));
}
