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
