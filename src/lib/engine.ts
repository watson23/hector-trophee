import type {
  Card,
  Course,
  FieldPlayer,
  FormatSpec,
  Pair,
  Round,
  Tee,
} from "../types";
import {
  betterBallResult,
  holesPlayed,
  scrambleResult,
  stablefordResult,
  strokePlayResult,
  type PlayerRoundContext,
} from "./formats";
import { courseHandicap, scrambleTeamHandicap, type ScrambleMethod } from "./handicap";
import { applyBonuses, hectorContribution, stablefordToStrokes } from "./hector";

export interface RoundInput {
  round: Round;
  course: Course;
  tee: Tee;
  players: FieldPlayer[];
  pairs: Pair[];
  /** Keyed by subject id: a player id, or `team__<pairId>` for scramble cards. */
  cards: Record<string, Card | undefined>;
  scrambleMethod?: ScrambleMethod;
}

export interface PlayerRow {
  playerId: string;
  name: string;
  /** Stableford points, or strokes for stroke play. */
  value: number;
  toPar?: number;
  thru: number;
  playingHcp: number;
}

export interface TeamRow {
  pairId: string;
  label: string;
  value: number;
  toPar: number;
  thru: number;
  birdies: number;
  eagles: number;
  playingHcp?: number;
}

export interface FormatResult {
  spec: FormatSpec;
  players: PlayerRow[];
  teams: TeamRow[];
}

export interface ContributionDetail {
  formatId: string;
  label: string;
  /** The score as played — Stableford points, or net strokes. */
  raw: number;
  /**
   * Stableford only: `raw` converted to strokes before weighting. Without this the
   * breakdown reads "33% of 38" next to a contribution of 23.1, which doesn't add up.
   */
  converted?: number;
  /** Whose score counted, when only one of the pair's did. */
  who?: string;
  pct: number;
  /** Birdie/eagle bonus already taken off `points`, so the breakdown can show its working. */
  bonus?: { points: number; birdies: number; eagles: number };
  points: number;
}

export interface RoundResult {
  roundId: string;
  formats: FormatResult[];
  hector: Record<string, { points: number; thru: number; detail: ContributionDetail[] }>;
  victor: Record<string, { points: number; thru: number }>;
}

/**
 * The handicap index a player played a given round off — the snapshot taken when the
 * round opened, or their current index if there is none.
 */
export function hiFor(round: Round, player: FieldPlayer): number {
  return round.handicaps?.[player.id] ?? player.hi;
}

/** Freeze today's handicaps onto a round, so later updates can't rescore it. */
export function snapshotHandicaps(round: Round, players: FieldPlayer[]): Round {
  return { ...round, handicaps: Object.fromEntries(players.map((p) => [p.id, p.hi])) };
}

/** Resolve the tee actually in play, honouring any admin override of CR/slope. */
export function effectiveTee(round: Round, course: Course): Tee {
  const base = course.tees[round.tee] ?? Object.values(course.tees)[0];
  return {
    ...base,
    cr: round.crOverride ?? base.cr,
    slope: round.slopeOverride ?? base.slope,
  };
}

function ctxFor(
  player: FieldPlayer,
  course: Course,
  tee: Tee,
  spec: FormatSpec,
  round: Round,
): PlayerRoundContext {
  return { hi: hiFor(round, player), course, tee, allowance: spec.net ? spec.allowance : 0 };
}

/** Everyone who is actually playing this round, i.e. assigned to a flight. */
export function roundParticipants(round: Round, players: FieldPlayer[]): FieldPlayer[] {
  const assigned = new Set(round.groups.flatMap((g) => g.playerIds));
  if (assigned.size === 0) return players;
  return players.filter((p) => assigned.has(p.id));
}

export function evaluateRound(input: RoundInput): RoundResult {
  const { round, course, tee, players, pairs, cards } = input;
  const byId = new Map(players.map((p) => [p.id, p]));
  const field = roundParticipants(round, players);
  const par = course.par.reduce((a, b) => a + b, 0);

  const hector: RoundResult["hector"] = {};
  const victor: RoundResult["victor"] = {};
  const formats: FormatResult[] = [];

  const addHector = (pairId: string, detail: ContributionDetail, thru: number) => {
    const entry = (hector[pairId] ??= { points: 0, thru: 0, detail: [] });
    entry.points += detail.points;
    entry.detail.push(detail);
    entry.thru = Math.max(entry.thru, thru);
  };

  for (const spec of round.formats) {
    const result: FormatResult = { spec, players: [], teams: [] };

    if (spec.kind === "stableford") {
      for (const p of field) {
        const r = stablefordResult(cards[p.id], ctxFor(p, course, tee, spec, round));
        result.players.push({
          playerId: p.id,
          name: p.name,
          value: r.points,
          thru: r.thru,
          playingHcp: r.playingHcp,
        });
        if (spec.victor) {
          const v = (victor[p.id] ??= { points: 0, thru: 0 });
          v.points += r.points * spec.victor.pct;
          v.thru = Math.max(v.thru, r.thru);
        }
      }
      if (spec.hector?.source === "betterIndividual") {
        for (const pair of pairs) {
          const rows = result.players.filter((r) => r.playerId === pair.aId || r.playerId === pair.bId);
          if (rows.length === 0) continue;
          const best = rows.reduce((a, b) => (b.value > a.value ? b : a));
          const points = hectorContribution({
            value: best.value,
            kind: "stableford",
            par,
            pct: spec.hector.pct,
          });
          addHector(
            pair.id,
            {
              formatId: spec.id,
              label: spec.label,
              raw: best.value,
              converted: stablefordToStrokes(best.value, par),
              who: byId.get(best.playerId)?.name,
              pct: spec.hector.pct,
              points,
            },
            Math.max(...rows.map((r) => r.thru)),
          );
        }
      }
    }

    if (spec.kind === "strokeplay") {
      for (const p of field) {
        const r = strokePlayResult(cards[p.id], ctxFor(p, course, tee, spec, round), spec.net);
        result.players.push({
          playerId: p.id,
          name: p.name,
          value: r.strokes,
          toPar: r.toPar,
          thru: r.thru,
          playingHcp: r.playingHcp,
        });
      }
      if (spec.hector?.source === "bothIndividuals") {
        for (const pair of pairs) {
          const rows = result.players.filter((r) => r.playerId === pair.aId || r.playerId === pair.bId);
          for (const row of rows) {
            const points = hectorContribution({
              value: row.value,
              kind: "strokeplay",
              par,
              pct: spec.hector.pct,
            });
            addHector(
              pair.id,
              {
                formatId: `${spec.id}:${row.playerId}`,
                label: `${spec.label} — ${byId.get(row.playerId)?.name ?? row.playerId}`,
                raw: row.value,
                pct: spec.hector.pct,
                points,
              },
              row.thru,
            );
          }
        }
      }
    }

    if (spec.kind === "betterball") {
      for (const pair of pairs) {
        const a = byId.get(pair.aId);
        const b = byId.get(pair.bId);
        if (!a || !b) continue;
        const r = betterBallResult(
          cards[a.id],
          cards[b.id],
          { ...ctxFor(a, course, tee, spec, round), playerId: a.id },
          { ...ctxFor(b, course, tee, spec, round), playerId: b.id },
        );
        result.teams.push({
          pairId: pair.id,
          label: `${a.name} + ${b.name}`,
          value: r.strokes,
          toPar: r.toPar,
          thru: r.thru,
          birdies: r.birdies,
          eagles: r.eagles,
        });
        if (spec.hector) {
          const points = hectorContribution({
            value: r.strokes,
            kind: "betterball",
            par,
            pct: spec.hector.pct,
          });
          addHector(
            pair.id,
            { formatId: spec.id, label: spec.label, raw: r.strokes, pct: spec.hector.pct, points },
            r.thru,
          );
        }
      }
    }

    if (spec.kind === "scramble") {
      for (const pair of pairs) {
        const a = byId.get(pair.aId);
        const b = byId.get(pair.bId);
        if (!a || !b) continue;
        const teamHcp = scrambleTeamHandicap(
          courseHandicap(hiFor(round, a), tee),
          courseHandicap(hiFor(round, b), tee),
          spec.allowance,
          input.scrambleMethod,
        );
        const card = cards[teamCardId(pair.id)];
        const r = scrambleResult(card, course, teamHcp);
        result.teams.push({
          pairId: pair.id,
          label: `${a.name} + ${b.name}`,
          value: r.strokes,
          toPar: r.toPar,
          thru: r.thru,
          birdies: r.birdies,
          eagles: r.eagles,
          playingHcp: teamHcp,
        });
        if (spec.hector) {
          const base = hectorContribution({
            value: r.strokes,
            kind: "scramble",
            par,
            pct: spec.hector.pct,
          });
          const bonus =
            (spec.bonuses?.birdie ?? 0) * r.birdies + (spec.bonuses?.eagle ?? 0) * r.eagles;
          addHector(
            pair.id,
            {
              formatId: spec.id,
              label: spec.label,
              raw: r.strokes,
              pct: spec.hector.pct,
              ...(spec.bonuses
                ? { bonus: { points: bonus, birdies: r.birdies, eagles: r.eagles } }
                : {}),
              points: applyBonuses(base, bonus),
            },
            r.thru,
          );
        }
      }
    }

    formats.push(result);
  }

  return { roundId: round.id, formats, hector, victor };
}

export function teamCardId(pairId: string): string {
  return `team__${pairId}`;
}

export interface TournamentRow<T> {
  key: string;
  label: string;
  points: number;
  thru: number;
  roundsPlayed: number;
  perRound: Record<string, T>;
}

export interface TournamentTotals {
  hector: TournamentRow<{ points: number; detail: ContributionDetail[] }>[];
  victor: TournamentRow<{ points: number }>[];
  rounds: RoundResult[];
}

/** Sum the per-round results into running Hector and Victor tables. */
export function computeTournament(
  roundResults: RoundResult[],
  players: FieldPlayer[],
  pairs: Pair[],
): TournamentTotals {
  const byId = new Map(players.map((p) => [p.id, p]));

  const hector = pairs.map((pair) => {
    const a = byId.get(pair.aId);
    const b = byId.get(pair.bId);
    const row: TournamentRow<{ points: number; detail: ContributionDetail[] }> = {
      key: pair.id,
      label: `${a?.name ?? "?"} + ${b?.name ?? "?"}`,
      points: 0,
      thru: 0,
      roundsPlayed: 0,
      perRound: {},
    };
    for (const rr of roundResults) {
      const entry = rr.hector[pair.id];
      if (!entry || entry.thru === 0) continue;
      row.points += entry.points;
      row.perRound[rr.roundId] = { points: entry.points, detail: entry.detail };
      row.roundsPlayed += 1;
      row.thru += entry.thru;
    }
    return row;
  });

  const victor = players.map((p) => {
    const row: TournamentRow<{ points: number }> = {
      key: p.id,
      label: p.name,
      points: 0,
      thru: 0,
      roundsPlayed: 0,
      perRound: {},
    };
    for (const rr of roundResults) {
      const entry = rr.victor[p.id];
      if (!entry || entry.thru === 0) continue;
      row.points += entry.points;
      row.perRound[rr.roundId] = { points: entry.points };
      row.roundsPlayed += 1;
      row.thru += entry.thru;
    }
    return row;
  });

  return { hector, victor, rounds: roundResults };
}

export { holesPlayed };
