import { retimeGroups } from "../data/rounds";
import { describe, expect, it } from "vitest";
import { pairFlightAssignments, flightsForPairs } from "./flights";
import type { Pair, Round } from "../types";

const pairs: Pair[] = Array.from({ length: 10 }, (_, i) => ({
  id: `p${i + 1}`,
  aId: `a${i + 1}`,
  bId: `b${i + 1}`,
}));

const roundAt = (seq: number): Round =>
  ({ id: `r${seq}`, seq, teeTimeWindow: "08:36–09:21", groups: [] }) as unknown as Round;

describe("rotating pair flights", () => {
  it("puts two pairs in each of five flights", () => {
    const flights = pairFlightAssignments(pairs, 2);
    expect(flights).toHaveLength(5);
    for (const f of flights) expect(f).toHaveLength(2);
    expect(flights.flat().map((p) => p.id).sort()).toEqual(pairs.map((p) => p.id).sort());
  });

  it("gives every round a different arrangement", () => {
    const seen = new Set<string>();
    for (let seq = 2; seq <= 6; seq++) {
      const key = pairFlightAssignments(pairs, seq)
        .map((f) => f.map((p) => p.id).sort().join("+"))
        .sort()
        .join("|");
      seen.add(key);
    }
    expect(seen.size).toBe(5);
  });

  it("never puts the same two pairs together twice across the pair rounds", () => {
    const met = new Set<string>();
    for (let seq = 2; seq <= 6; seq++) {
      for (const f of pairFlightAssignments(pairs, seq)) {
        const key = f.map((p) => p.id).sort().join("+");
        expect(met.has(key)).toBe(false);
        met.add(key);
      }
    }
  });

  it("is stable: the same round always fills the same way", () => {
    expect(pairFlightAssignments(pairs, 4)).toEqual(pairFlightAssignments(pairs, 4));
  });

  it("keeps both halves of a pair in one flight, on a tee time", () => {
    const groups = flightsForPairs(roundAt(3), pairs);
    expect(groups).toHaveLength(5);
    for (const g of groups) {
      expect(g.playerIds).toHaveLength(4);
      expect(g.teeTime).toMatch(/^\d\d:\d\d$/);
      for (const p of pairs) {
        const a = g.playerIds.includes(p.aId);
        const b = g.playerIds.includes(p.bId);
        expect(a).toBe(b);
      }
    }
  });

  it("sends an odd pair count out with a two-ball at the end", () => {
    const nine = pairs.slice(0, 9);
    const flights = pairFlightAssignments(nine, 2);
    expect(flights.flat()).toHaveLength(9);
    expect(flights[flights.length - 1]).toHaveLength(1);
  });
});

describe("flightsForPairs and the tee sheet", () => {
  const round = {
    id: "r2",
    seq: 2,
    teeTimeWindow: "08:36\u201309:21",
    groups: [],
  } as unknown as Round;

  const pair = (n: number): Pair => ({ id: `p${n}`, aId: `a${n}`, bId: `b${n}` });

  it("keeps all five booked tee times even mid-draft with few pairs", () => {
    // Five pairs make three flights of company — but the resort still holds five
    // tee times, and shrinking the sheet left nowhere to put the rest of the field.
    const groups = flightsForPairs(round, [1, 2, 3, 4, 5].map(pair));
    expect(groups).toHaveLength(5);
    expect(groups.map((g) => g.teeTime)).toEqual(["08:36", "08:47", "08:59", "09:10", "09:21"]);
    expect(groups.flatMap((g) => g.playerIds)).toHaveLength(10);
  });

  it("still fills five flights exactly with the full ten pairs", () => {
    const groups = flightsForPairs(round, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(pair));
    expect(groups).toHaveLength(5);
    expect(groups.every((g) => g.playerIds.length === 4)).toBe(true);
  });
});

describe("retimeGroups", () => {
  it("moves every flight to the new sheet and keeps the players in place", () => {
    const old = [
      { id: "g1", teeTime: "12:03", playerIds: ["a", "b", "c", "d"] },
      { id: "g2", teeTime: "12:14", playerIds: ["e", "f"] },
      { id: "g3", teeTime: "12:25", playerIds: [] },
      { id: "g4", teeTime: "12:37", playerIds: ["g"] },
      { id: "g5", teeTime: "12:48", playerIds: [] },
    ];
    const next = retimeGroups(old, "12:03\u201312:39");
    expect(next.map((g) => g.teeTime)).toEqual(["12:03", "12:12", "12:21", "12:30", "12:39"]);
    expect(next.map((g) => g.playerIds)).toEqual(old.map((g) => g.playerIds));
  });
});
