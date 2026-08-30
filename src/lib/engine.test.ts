import { describe, expect, it } from "vitest";
import { courses } from "../data/courses";
import type { Card, FieldPlayer, Pair, Round } from "../types";
import { defaultRounds } from "../data/rounds";
import {
  courseHandicap,
  playingHandicap,
  scrambleTeamHandicap,
  strokeAllocation,
} from "./handicap";
import {
  betterBallResult,
  scrambleResult,
  stablefordPoints,
  stablefordResult,
  strokePlayResult,
} from "./formats";
import { effectiveTee, evaluateRound, teamCardId } from "./engine";
import { formatDiff, formatThru, rank } from "./leaderboard";

const radecky = courses.radecky;
const yellow = radecky.tees.yellow; // CR 72.2, slope 142, par 72

const jari: FieldPlayer = { id: "jari-k", name: "Jari K", hi: 1.5, bucket: 1 };
const lasse: FieldPlayer = { id: "lasse-k", name: "Lasse K", hi: 14.8, bucket: 2 };
const pair: Pair = { id: "p1", aId: jari.id, bId: lasse.id };

/** A card where every hole is played in `strokes` over par. */
function cardAtPar(subjectId: string, over = 0): Card {
  const holes: Record<string, number> = {};
  radecky.par.forEach((par, i) => {
    holes[String(i + 1)] = par + over;
  });
  return { id: `r1__${subjectId}`, roundId: "r1", subjectId, holes };
}

describe("handicap", () => {
  it("applies slope and the CR − par adjustment", () => {
    // 1.5 × 142/113 = 1.885, + (72.2 − 72) = 2.085 → 2
    expect(courseHandicap(jari.hi, yellow)).toBe(2);
    // 14.8 × 142/113 = 18.60, + 0.2 = 18.80 → 19
    expect(courseHandicap(lasse.hi, yellow)).toBe(19);
  });

  it("gives a second stroke on the hardest hole above 18", () => {
    const strokes = strokeAllocation(19, radecky.si);
    // SI 1 is hole 14 on Radecký
    expect(strokes[13]).toBe(2);
    expect(strokes[0]).toBe(1); // SI 10
    expect(strokes.reduce((a, b) => a + b, 0)).toBe(19);
  });

  it("takes strokes off the easiest holes for a plus handicap", () => {
    const strokes = strokeAllocation(-2, radecky.si);
    // SI 18 is hole 2, SI 17 is hole 13
    expect(strokes[1]).toBe(-1);
    expect(strokes[12]).toBe(-1);
    expect(strokes.reduce((a, b) => a + b, 0)).toBe(-2);
  });

  it("rounds the playing handicap after the allowance", () => {
    expect(playingHandicap(19, 1.0)).toBe(19);
    expect(playingHandicap(19, 0.2)).toBe(4);
  });

  it("computes a scramble team handicap both ways", () => {
    // 20% of (2 + 19) = 4.2 → 4
    expect(scrambleTeamHandicap(2, 19, 0.2)).toBe(4);
    // 0.35 × 2 + 0.15 × 19 = 3.55 → 4
    expect(scrambleTeamHandicap(2, 19, 0.2, "split")).toBe(4);
  });
});

describe("stableford", () => {
  it("scores 2 for a net par and 0 for a net double bogey", () => {
    expect(stablefordPoints(4, 4)).toBe(2);
    expect(stablefordPoints(4, 3)).toBe(3);
    expect(stablefordPoints(4, 5)).toBe(1);
    expect(stablefordPoints(4, 6)).toBe(0);
    expect(stablefordPoints(4, 8)).toBe(0);
  });

  it("gives a gross-par round 36 points plus one per stroke received", () => {
    const ctx = { hi: lasse.hi, course: radecky, tee: yellow, allowance: 1.0 };
    const r = stablefordResult(cardAtPar(lasse.id), ctx);
    expect(r.playingHcp).toBe(19);
    expect(r.thru).toBe(18);
    // 36 for gross par, +19 for the strokes received
    expect(r.points).toBe(55);
  });

  it("counts only the holes played", () => {
    const ctx = { hi: jari.hi, course: radecky, tee: yellow, allowance: 1.0 };
    const card: Card = {
      id: "x",
      roundId: "r1",
      subjectId: jari.id,
      holes: { "1": 5, "2": 4, "3": 4 },
    };
    const r = stablefordResult(card, ctx);
    expect(r.thru).toBe(3);
    // holes 1–3 are par 5/4/4, SI 10/18/4 — a 2 handicap gets a stroke on SI 1–2 only
    expect(r.points).toBe(6);
  });
});

describe("stroke play", () => {
  it("reports gross and net separately", () => {
    const ctx = { hi: lasse.hi, course: radecky, tee: yellow, allowance: 1.0 };
    const card = cardAtPar(lasse.id, 1); // 90 gross
    expect(strokePlayResult(card, ctx, false).strokes).toBe(90);
    expect(strokePlayResult(card, ctx, true).strokes).toBe(90 - 19);
    expect(strokePlayResult(card, ctx, true).toPar).toBe(-1);
  });

  it("never lets a net score go below 1", () => {
    const ctx = { hi: lasse.hi, course: radecky, tee: yellow, allowance: 1.0 };
    const card: Card = { id: "x", roundId: "r1", subjectId: lasse.id, holes: { "16": 1 } };
    // hole 16 is a par 3 with SI 3 — one stroke, but net cannot drop under 1
    expect(strokePlayResult(card, ctx, true).strokes).toBe(1);
  });
});

describe("better ball", () => {
  it("takes the lower net ball and names the contributor", () => {
    const ctxA = {
      hi: jari.hi,
      course: radecky,
      tee: yellow,
      allowance: 1.0,
      playerId: jari.id,
    };
    const ctxB = {
      hi: lasse.hi,
      course: radecky,
      tee: yellow,
      allowance: 1.0,
      playerId: lasse.id,
    };
    // Hole 1 is par 5 / SI 10: Jari's 2 handicap gets no stroke, Lasse's 19 gets one,
    // so their matching 6s become net 6 and net 5 and Lasse's ball counts.
    // Hole 2 is par 4 / SI 18: Lasse still has a stroke but is two worse, so Jari counts.
    const a: Card = { id: "a", roundId: "r1", subjectId: jari.id, holes: { "1": 6, "2": 4 } };
    const b: Card = { id: "b", roundId: "r1", subjectId: lasse.id, holes: { "1": 6, "2": 6 } };
    const r = betterBallResult(a, b, ctxA, ctxB);
    expect(r.thru).toBe(2);
    expect(r.perHole.slice(0, 2)).toEqual([5, 4]);
    expect(r.contributor?.slice(0, 2)).toEqual([lasse.id, jari.id]);
    expect(r.strokes).toBe(9);
  });

  it("uses whichever player has a score when only one has played", () => {
    const ctxA = { hi: jari.hi, course: radecky, tee: yellow, allowance: 1.0, playerId: jari.id };
    const ctxB = { hi: lasse.hi, course: radecky, tee: yellow, allowance: 1.0, playerId: lasse.id };
    const only: Card = { id: "x", roundId: "r1", subjectId: jari.id, holes: { "1": 5 } };
    const r = betterBallResult(only, undefined, ctxA, ctxB);
    expect(r.thru).toBe(1);
    expect(r.strokes).toBe(5); // par 5, no stroke on SI 10 for a 2 handicap
    expect(r.contributor?.[0]).toBe(jari.id);
  });
});

describe("scramble", () => {
  it("applies the team handicap and counts net birdies and eagles", () => {
    const teamHcp = scrambleTeamHandicap(2, 19, 0.2); // 4
    const r = scrambleResult(cardAtPar("team", 0), radecky, teamHcp);
    expect(r.strokes).toBe(72 - 4);
    // four strokes → four net birdies, no eagles
    expect(r.birdies).toBe(4);
    expect(r.eagles).toBe(0);
  });
});

describe("evaluateRound", () => {
  const players = [jari, lasse];

  function roundWith(overrides: Partial<Round>): Round {
    const base = defaultRounds[0];
    return { ...base, groups: [{ id: "g1", teeTime: "12:03", playerIds: [jari.id, lasse.id] }], ...overrides };
  }

  it("takes the better individual for the day 1 Stableford Hector points", () => {
    const round = roundWith({});
    const result = evaluateRound({
      round,
      course: radecky,
      tee: effectiveTee(round, radecky),
      players,
      pairs: [pair],
      cards: { [jari.id]: cardAtPar(jari.id), [lasse.id]: cardAtPar(lasse.id, 2) },
    });
    const stableford = result.formats[0];
    const jariRow = stableford.players.find((p) => p.playerId === jari.id)!;
    const lasseRow = stableford.players.find((p) => p.playerId === lasse.id)!;
    expect(jariRow.value).toBe(38); // 36 + 2 strokes
    expect(lasseRow.value).toBeLessThan(jariRow.value);

    // Hector took Jari's 38, weighted 33%, via the parNormalised strategy: 0.33 × (72 − 38)
    const detail = result.hector[pair.id].detail[0];
    expect(detail.raw).toBe(38);
    expect(detail.points).toBeCloseTo(0.33 * (72 - 38), 5);

    // Victor counts both players at 100%
    expect(result.victor[jari.id].points).toBe(38);
    expect(result.victor[lasse.id].points).toBe(lasseRow.value);
  });

  it("counts both individuals for the day 2 stroke play Hector points", () => {
    const round = roundWith({ formats: defaultRounds[2].formats });
    const result = evaluateRound({
      round,
      course: radecky,
      tee: effectiveTee(round, radecky),
      players,
      pairs: [pair],
      cards: { [jari.id]: cardAtPar(jari.id), [lasse.id]: cardAtPar(lasse.id) },
    });
    const detail = result.hector[pair.id].detail;
    expect(detail).toHaveLength(2);
    expect(detail.every((d) => d.pct === 0.25)).toBe(true);
  });

  it("applies birdie and eagle bonuses in the day 6 scramble", () => {
    const round = roundWith({ formats: defaultRounds[5].formats });
    const withBonuses = evaluateRound({
      round,
      course: radecky,
      tee: effectiveTee(round, radecky),
      players,
      pairs: [pair],
      cards: { [teamCardId(pair.id)]: cardAtPar("team") },
    });
    const noBonusRound = roundWith({
      formats: [{ ...defaultRounds[5].formats[0], bonuses: undefined }],
    });
    const without = evaluateRound({
      round: noBonusRound,
      course: radecky,
      tee: effectiveTee(noBonusRound, radecky),
      players,
      pairs: [pair],
      cards: { [teamCardId(pair.id)]: cardAtPar("team") },
    });
    // four net birdies at 0.5 each, and lower is better, so the total drops by 2
    expect(withBonuses.hector[pair.id].points).toBeCloseTo(
      without.hector[pair.id].points - 2,
      5,
    );
  });

  it("ignores pairs with no cards at all", () => {
    const round = roundWith({});
    const result = evaluateRound({
      round,
      course: radecky,
      tee: effectiveTee(round, radecky),
      players,
      pairs: [pair],
      cards: {},
    });
    expect(result.hector[pair.id].thru).toBe(0);
  });
});

describe("ranking", () => {
  const rows = [
    { name: "a", v: 114.0 },
    { name: "b", v: 116.9 },
    { name: "c", v: 116.9 },
    { name: "d", v: 121.8 },
  ];

  it("shares a position on ties and shows the gap to the leader", () => {
    const ranked = rank(rows, (r) => r.v, true);
    expect(ranked.map((r) => r.label)).toEqual(["1", "T2", "T2", "4"]);
    expect(ranked[0].diff).toBeNull();
    expect(formatDiff(ranked[1].diff)).toBe("+2.9");
  });

  it("reads the gap the other way when higher wins", () => {
    const ranked = rank(rows, (r) => r.v, false);
    expect(ranked[0].item.name).toBe("d");
    expect(formatDiff(ranked[3].diff)).toBe("−7.8");
  });

  it("pushes players who have not started to the bottom", () => {
    const ranked = rank(
      [...rows, { name: "e", v: 0 }],
      (r) => r.v,
      true,
      (r) => r.v > 0,
    );
    expect(ranked[ranked.length - 1].item.name).toBe("e");
    expect(ranked[ranked.length - 1].label).toBe("–");
  });

  it("formats thru as F once the round is complete", () => {
    expect(formatThru(18)).toBe("F");
    expect(formatThru(7)).toBe("7");
    expect(formatThru(0)).toBe("—");
  });
});
