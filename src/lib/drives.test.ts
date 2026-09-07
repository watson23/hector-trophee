import { describe, expect, it } from "vitest";
import type { Card } from "../types";
import { courses } from "../data/courses";
import { drivePenalty, drivesRule, scrambleResult } from "./formats";

const quota = { players: ["lasse", "jari"] as [string, string], min: 6, penalty: 2 };
const marks = (lasse: number, jari: number): Record<string, string> => {
  const d: Record<string, string> = {};
  let h = 1;
  for (let i = 0; i < lasse; i++) d[String(h++)] = "lasse";
  for (let i = 0; i < jari; i++) d[String(h++)] = "jari";
  return d;
};

describe("drivePenalty", () => {
  it("charges two strokes per missing drive on a fully marked card — Lasse's example", () => {
    const r = drivePenalty(marks(4, 14), quota);
    expect(r.penalty).toBe(4);
    expect(r.drives).toEqual([
      { playerId: "lasse", used: 4, missing: 2 },
      { playerId: "jari", used: 14, missing: 0 },
    ]);
  });

  it("costs nothing when both players reach the quota", () => {
    expect(drivePenalty(marks(6, 12), quota).penalty).toBe(0);
    expect(drivePenalty(marks(9, 9), quota).penalty).toBe(0);
  });

  it("never penalises what has not been marked", () => {
    expect(drivePenalty(undefined, quota).penalty).toBe(0);
    expect(drivePenalty({}, quota).penalty).toBe(0);
    // Ten holes marked all to Jari, eight unknown: Lasse could still reach 6 of 8.
    expect(drivePenalty(marks(0, 10), quota).penalty).toBe(0);
  });

  it("charges mid-round only what can no longer be made up", () => {
    // Fourteen holes marked, one of them Lasse's; four holes remain → at most 5 → one short.
    const r = drivePenalty(marks(1, 13), quota);
    expect(r.penalty).toBe(2);
    expect(r.drives[0].missing).toBe(1);
  });

  it("can charge both players when neither is used enough", () => {
    // 18 marked: 3 and 15 → Lasse 3 short = 6. A 9/9 card with two 'unknown' would be 0.
    expect(drivePenalty(marks(3, 15), quota).penalty).toBe(6);
  });
});

describe("drivesRule", () => {
  it("defaults scrambles to 6 and 2, honours a round's own numbers, and can be switched off", () => {
    expect(drivesRule({ kind: "scramble" })).toEqual({ min: 6, penalty: 2 });
    expect(drivesRule({ kind: "scramble", drives: { min: 5, penalty: 1 } })).toEqual({ min: 5, penalty: 1 });
    expect(drivesRule({ kind: "scramble", drives: { min: 0, penalty: 2 } })).toBeNull();
    expect(drivesRule({ kind: "betterball" })).toBeNull();
  });
});

describe("scrambleResult with the drive rule", () => {
  const deste = courses.deste;
  const card: Card = {
    id: "c",
    roundId: "r4",
    subjectId: "team__x",
    holes: Object.fromEntries(deste.par.map((p, i) => [String(i + 1), p])),
    drives: marks(4, 14),
  };

  it("adds the penalty to the strokes and to par, leaving the holes alone", () => {
    const withRule = scrambleResult(card, deste, 4, quota);
    const without = scrambleResult(card, deste, 4, null);
    expect(withRule.penalty).toBe(4);
    expect(withRule.strokes).toBe(without.strokes + 4);
    expect(withRule.toPar).toBe(without.toPar + 4);
    expect(withRule.perHole).toEqual(without.perHole);
    expect(without.penalty).toBe(0);
  });

  it("is quiet before a hole has been played", () => {
    const empty = scrambleResult({ ...card, holes: {} }, deste, 4, quota);
    expect(empty.penalty).toBe(0);
    expect(empty.strokes).toBe(0);
  });
});

describe("betterBallResult birdie count", () => {
  it("counts each player's gross birdies and eagles, not the pair's net ones", async () => {
    const { betterBallResult } = await import("./formats");
    const radecky = courses.radecky;
    const ctx = (playerId: string, hi: number) => ({ playerId, hi, course: radecky, tee: radecky.tees.yellow, allowance: 1 });
    const par = (id: string): Card => ({ id, roundId: "r2", subjectId: id, holes: Object.fromEntries(radecky.par.map((p, i) => [String(i + 1), p])) });
    // A: gross birdie on 1, eagle on 4. B: par everywhere, but 18 strokes of handicap → many net birdies.
    const a = par("a");
    a.holes["1"] = radecky.par[0] - 1;
    a.holes["4"] = radecky.par[3] - 2;
    const r = betterBallResult(a, par("b"), ctx("a", 2), ctx("b", 18));
    expect(r.birdies).toBe(1);
    expect(r.eagles).toBe(1);
  });
});
