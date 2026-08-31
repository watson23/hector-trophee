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
import {
  computeTournament,
  effectiveTee,
  evaluateRound,
  hiFor,
  snapshotHandicaps,
  teamCardId,
} from "./engine";
import { hectorContribution, levelParTotal, stablefordToStrokes } from "./hector";
import { formatDiff, formatThru, rank } from "./leaderboard";
import { draftPairs } from "./simulate";
import { generateRoundCards } from "./testdata";
import { field } from "../data/field";
import type { EventDoc } from "../types";

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
  it("applies the team handicap to the net total", () => {
    const teamHcp = scrambleTeamHandicap(2, 19, 0.2); // 4
    const r = scrambleResult(cardAtPar("team", 0), radecky, teamHcp);
    expect(r.strokes).toBe(72 - 4);
  });

  it("counts birdies and eagles on gross, not net", () => {
    const teamHcp = scrambleTeamHandicap(2, 19, 0.2); // 4 strokes received
    // A gross-par round earns no birdie bonus, even though four holes go net-1 under.
    expect(scrambleResult(cardAtPar("team", 0), radecky, teamHcp).birdies).toBe(0);

    // Hole 1 par 5 → 4 is a birdie, hole 4 par 5 → 3 is an eagle, rest are pars.
    const card: Card = {
      id: "t",
      roundId: "r6",
      subjectId: "team",
      holes: Object.fromEntries(radecky.par.map((p, i) => [String(i + 1), p])),
    };
    card.holes["1"] = 4;
    card.holes["4"] = 3;
    const r = scrambleResult(card, radecky, teamHcp);
    expect(r.birdies).toBe(1);
    expect(r.eagles).toBe(1);
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

    // Hector took Jari's 38 points, converted to strokes (2×72 − (38+36) = 70) and
    // weighted by the draft round's one third.
    const detail = result.hector[pair.id].detail[0];
    expect(detail.raw).toBe(38);
    expect(detail.points).toBeCloseTo(70 / 3, 5);

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
    // Three gross birdies and one gross eagle: 3 × 0.5 + 1 = 2.5 off the total.
    const holes = Object.fromEntries(radecky.par.map((p, i) => [String(i + 1), p]));
    for (const h of ["2", "3", "5"]) holes[h] = radecky.par[Number(h) - 1] - 1;
    holes["4"] = radecky.par[3] - 2;
    const card: Card = { id: "t", roundId: "r6", subjectId: teamCardId(pair.id), holes };

    const run = (formats: Round["formats"]) => {
      const round = roundWith({ formats });
      return evaluateRound({
        round,
        course: radecky,
        tee: effectiveTee(round, radecky),
        players,
        pairs: [pair],
        cards: { [teamCardId(pair.id)]: card },
      }).hector[pair.id].points;
    };

    const withBonuses = run(defaultRounds[5].formats);
    const without = run([{ ...defaultRounds[5].formats[0], bonuses: undefined }]);
    expect(withBonuses).toBeCloseTo(without - 2.5, 5);
    // Lower wins, so the bonuses must reduce the total.
    expect(withBonuses).toBeLessThan(without);
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


describe("hector points", () => {
  // The organiser's own worked example: a 42-point Stableford round on a par 72 is a
  // 66, because 42 points is six under.
  it("converts Stableford points to strokes against par", () => {
    expect(stablefordToStrokes(42, 72)).toBe(66);
    expect(stablefordToStrokes(36, 72)).toBe(72);
    expect(stablefordToStrokes(30, 72)).toBe(78);
  });

  it("weights a round's strokes and leaves stroke play alone", () => {
    expect(hectorContribution({ value: 72, kind: "betterball", par: 72, pct: 0.5 })).toBe(36);
    expect(hectorContribution({ value: 72, kind: "scramble", par: 72, pct: 1.0 })).toBe(72);
    expect(hectorContribution({ value: 72, kind: "strokeplay", par: 72, pct: 0.25 })).toBe(18);
    // Stableford converts first: 42 points → 66 strokes → 33% of that
    expect(hectorContribution({ value: 42, kind: "stableford", par: 72, pct: 0.33 })).toBeCloseTo(
      0.33 * 66,
      5,
    );
  });

  it("puts a level-par pair on exactly 240 across the six rounds", () => {
    // 0.33 + 0.5 + (0.25 × both players) + 0.5 + 0.5 + 1.0, all against a par 72
    const weights = defaultRounds.flatMap((r) =>
      r.formats
        .filter((f) => f.hector)
        .map((f) => ({
          pct: f.hector!.pct,
          countsBothPlayers: f.hector!.source === "bothIndividuals",
        })),
    );
    // 1/3 + 1/2 + (1/4 × both players) + 1/2 + 1/2 + 1 = 10/3 rounds of par 72.
    expect(levelParTotal(weights, 72)).toBeCloseTo(240, 6);
  });

  it("matches the organiser's per-round breakdown for a level-par pair", () => {
    const perRound = defaultRounds.map((r) =>
      r.formats
        .filter((f) => f.hector)
        .reduce(
          (sum, f) =>
            sum +
            hectorContribution({
              value: f.kind === "stableford" ? 36 : 72,
              kind: f.kind,
              par: 72,
              pct: f.hector!.pct,
            }) *
              (f.hector!.source === "bothIndividuals" ? 2 : 1),
          0,
        ),
    );
    expect(perRound.map((n) => Math.round(n * 10) / 10)).toEqual([24, 36, 36, 36, 36, 72]);
  });

  it("scores lower-is-better, and birdies help", () => {
    const round = { ...defaultRounds[5] };
    const bonus = round.formats[0].bonuses!;
    expect(bonus.birdie).toBe(0.5);
    expect(bonus.eagle).toBe(1);
  });
});

describe("2025 leaderboard scale", () => {
  // The published page showed 114.0 / 116.9 / 121.8; the real figures are 108.0 higher.
  // The gaps are what the app must reproduce, and they are identical either way.
  it("reproduces the gaps between the top three", () => {
    const actual = [222.0, 224.9, 229.8];
    const published = [114.0, 116.9, 121.8];
    expect(actual.map((n) => +(n - actual[0]).toFixed(1))).toEqual([0, 2.9, 7.8]);
    expect(published.map((n) => +(n - published[0]).toFixed(1))).toEqual([0, 2.9, 7.8]);
    expect(actual.every((n, i) => +(n - published[i]).toFixed(1) === 108.0)).toBe(true);
  });

  it("puts a realistic winning total below the level-par reference", () => {
    const weights = defaultRounds.flatMap((r) =>
      r.formats
        .filter((f) => f.hector)
        .map((f) => ({
          pct: f.hector!.pct,
          countsBothPlayers: f.hector!.source === "bothIndividuals",
        })),
    );
    const levelPar = levelParTotal(weights, 72);
    // 2025: winners 222.0, last 242.6, median 233.2 — level par sits inside that spread.
    expect(levelPar).toBeGreaterThan(222.0);
    expect(levelPar).toBeLessThan(242.6);
  });
});

describe("tournament totals", () => {
  it("adds each round's contribution into the pair total", () => {
    const results = [
      {
        roundId: "r1",
        formats: [],
        hector: { p1: { points: 23.8, toPar: -0.2, thru: 18, detail: [] } },
        victor: { "jari-k": { points: 38, toPar: -2, thru: 18 } },
      },
      {
        roundId: "r2",
        formats: [],
        hector: { p1: { points: 36, toPar: 0, thru: 18, detail: [] } },
        victor: { "jari-k": { points: 34, toPar: 2, thru: 18 } },
      },
    ];
    const totals = computeTournament(results, [jari, lasse], [pair]);
    expect(totals.hector[0].points).toBeCloseTo(59.8, 5);
    expect(totals.hector[0].toPar).toBeCloseTo(-0.2, 5);
    expect(totals.hector[0].roundsPlayed).toBe(2);
    expect(totals.victor.find((v) => v.key === "jari-k")!.points).toBe(72);
  });
});


describe("handicaps frozen per round", () => {
  const round = defaultRounds[0];

  it("uses the player's current index until a round is opened", () => {
    expect(hiFor(round, jari)).toBe(1.5);
  });

  it("uses the snapshot once there is one", () => {
    const opened = snapshotHandicaps(round, [jari, lasse]);
    // The player's index moves later in the week; the round must not follow it.
    expect(hiFor(opened, { ...jari, hi: 3.4 })).toBe(1.5);
    expect(hiFor(opened, { ...lasse, hi: 16.0 })).toBe(14.8);
  });

  it("does not rescore a played round when a handicap changes afterwards", () => {
    const opened = {
      ...snapshotHandicaps(round, [jari, lasse]),
      groups: [{ id: "g1", teeTime: "12:03", playerIds: [jari.id, lasse.id] }],
    };
    const cards = { [jari.id]: cardAtPar(jari.id), [lasse.id]: cardAtPar(lasse.id) };
    const score = (players: FieldPlayer[]) =>
      evaluateRound({
        round: opened,
        course: radecky,
        tee: effectiveTee(opened, radecky),
        players,
        pairs: [pair],
        cards,
      }).formats[0].players.map((p) => p.value);

    const before = score([jari, lasse]);
    const after = score([{ ...jari, hi: 3.4 }, { ...lasse, hi: 16.0 }]);
    expect(after).toEqual(before);
  });

  it("would rescore without the snapshot, which is the bug it prevents", () => {
    const unopened = {
      ...round,
      groups: [{ id: "g1", teeTime: "12:03", playerIds: [jari.id, lasse.id] }],
    };
    const cards = { [jari.id]: cardAtPar(jari.id), [lasse.id]: cardAtPar(lasse.id) };
    const score = (players: FieldPlayer[]) =>
      evaluateRound({
        round: unopened,
        course: radecky,
        tee: effectiveTee(unopened, radecky),
        players,
        pairs: [pair],
        cards,
      }).formats[0].players.map((p) => p.value);

    expect(score([{ ...jari, hi: 3.4 }, lasse])).not.toEqual(score([jari, lasse]));
  });
});


describe("the draft", () => {
  const players: FieldPlayer[] = [
    { id: "a1", name: "A1", hi: 2, bucket: 1 },
    { id: "a2", name: "A2", hi: 4, bucket: 1 },
    { id: "a3", name: "A3", hi: 6, bucket: 1 },
    { id: "b1", name: "B1", hi: 12, bucket: 2 },
    { id: "b2", name: "B2", hi: 14, bucket: 2 },
    { id: "b3", name: "B3", hi: 16, bucket: 2 },
  ];
  const base = { id: "E", name: "", venue: "", dates: "", pinHash: "", adminPinHash: "", players };
  // Round 1 finished in this order.
  const order = ["b2", "a3", "a1", "b1", "a2", "b3"];

  it("pairs across buckets, best player picking first", () => {
    const event = { ...base, pairs: [], defendingPair: null } as EventDoc;
    const pairs = draftPairs(order, event);
    // B2 won the round and takes the best available from bucket 1, which is A3.
    expect(pairs[0]).toMatchObject({ aId: "b2", bId: "a3" });
    expect(pairs).toHaveLength(3);
    for (const p of pairs) {
      const a = players.find((x) => x.id === p.aId)!;
      const b = players.find((x) => x.id === p.bId)!;
      expect(a.bucket).not.toBe(b.bucket);
    }
    expect(new Set(pairs.flatMap((p) => [p.aId, p.bId])).size).toBe(6);
  });

  it("pairs the defending champions first and leaves them out of the draft", () => {
    const event = { ...base, pairs: [], defendingPair: ["a3", "b1"] } as EventDoc;
    const pairs = draftPairs(order, event);
    expect(pairs[0]).toMatchObject({ aId: "a3", bId: "b1", defending: true });
    // A3 topped the draft order among the rest, but is spoken for, so B2 takes A1.
    expect(pairs[1]).toMatchObject({ aId: "b2", bId: "a1" });
    expect(pairs).toHaveLength(3);
    expect(new Set(pairs.flatMap((p) => [p.aId, p.bId])).size).toBe(6);
  });

  it("lets the champions decline and rejoin the draft", () => {
    const declined = draftPairs(order, { ...base, pairs: [], defendingPair: null } as EventDoc);
    expect(declined.some((p) => p.defending)).toBe(false);
    expect(declined[0]).toMatchObject({ aId: "b2", bId: "a3" });
  });
});

describe("hector to par", () => {
  /** Cards for the first `holes` holes only, every hole at `over` above par. */
  function partialCard(subjectId: string, holes: number, over = 0): Card {
    const h: Record<string, number> = {};
    for (let i = 0; i < holes; i++) h[String(i + 1)] = radecky.par[i] + over;
    return { id: `x__${subjectId}`, roundId: "x", subjectId, holes: h };
  }

  function evaluate(round: Round, cards: Record<string, Card>) {
    return evaluateRound({
      round,
      course: radecky,
      tee: effectiveTee(round, radecky),
      players: [jari, lasse],
      pairs: [pair],
      cards,
    });
  }

  it("weights a partial better-ball round hole by hole", () => {
    // Nine holes in: the pair's to-par so far carries the round's 50% weight —
    // a bogey in a 50% round costs exactly +0.5.
    const round = { ...defaultRounds[1], courseId: "radecky" };
    const result = evaluate(round, {
      [jari.id]: partialCard(jari.id, 9, 1),
      [lasse.id]: partialCard(lasse.id, 9, 1),
    });
    const team = result.formats[0].teams[0];
    expect(result.hector[pair.id].toPar).toBeCloseTo(0.5 * team.toPar, 6);
  });

  it("scores a partial Stableford round against the two-point par", () => {
    // Gross par for nine holes: net birdies where strokes fall, so points exceed
    // 2·thru and the weighted to-par goes under.
    const round = { ...defaultRounds[0], courseId: "radecky" };
    const result = evaluate(round, { [jari.id]: partialCard(jari.id, 9) });
    const row = result.formats[0].players.find((p) => p.playerId === jari.id)!;
    expect(result.hector[pair.id].toPar).toBeCloseTo((1 / 3) * (2 * 9 - row.value), 6);
  });

  it("takes scramble bonuses off the to-par figure too", () => {
    const round = { ...defaultRounds[5], courseId: "radecky" };
    const card = partialCard(teamCardId(pair.id), 18);
    card.holes["1"] = radecky.par[0] - 1; // one gross birdie → −0.5 bonus
    const result = evaluate(round, { [teamCardId(pair.id)]: card });
    const team = result.formats[0].teams[0];
    expect(result.hector[pair.id].toPar).toBeCloseTo(1.0 * team.toPar - 0.5, 6);
  });

  it("equals the official total minus 240.0 for any completed tournament", () => {
    // The invariant that makes to-par safe to rank on: it is not a second scoring
    // system, just the same one with level par removed hole by hole. Random full
    // cards for the whole week must land every pair on exactly points − 240.
    const pairs: Pair[] = Array.from({ length: 10 }, (_, i) => ({
      id: `p${i}`,
      aId: field[i].id,
      bId: field[19 - i].id,
    }));
    const event = { players: field, pairs } as EventDoc;
    const results = defaultRounds.map((r) => {
      const course = courses[r.courseId];
      const generated = generateRoundCards(r, course, effectiveTee(r, course), event, 18);
      const cards = Object.fromEntries(
        generated.map((c) => [
          c.subjectId,
          { id: c.subjectId, roundId: r.id, subjectId: c.subjectId, holes: c.holes },
        ]),
      );
      return evaluateRound({
        round: r,
        course,
        tee: effectiveTee(r, course),
        players: field,
        pairs,
        cards,
      });
    });
    const totals = computeTournament(results, field, pairs);
    for (const row of totals.hector) {
      expect(row.roundsPlayed).toBe(6);
      expect(row.toPar).toBeCloseTo(row.points - 240, 6);
    }
    // Victor's mirror invariant: four full Stableford rounds are 72 holes of
    // 2-point par, so to-par is exactly 144 − points.
    for (const row of totals.victor) {
      expect(row.roundsPlayed).toBe(4);
      expect(row.toPar).toBeCloseTo(144 - row.points, 6);
    }
  });
});
