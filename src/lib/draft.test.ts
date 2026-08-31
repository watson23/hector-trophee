import { describe, expect, it } from "vitest";
import { draftPairs } from "./simulate";
import type { EventDoc, FieldPlayer } from "../types";

/** Six players, three per bucket — enough to exercise every draft rule. */
const players: FieldPlayer[] = [
  { id: "a1", name: "A One", hi: 2, bucket: 1 },
  { id: "a2", name: "A Two", hi: 5, bucket: 1 },
  { id: "a3", name: "A Three", hi: 8, bucket: 1 },
  { id: "b1", name: "B One", hi: 11, bucket: 2 },
  { id: "b2", name: "B Two", hi: 13, bucket: 2 },
  { id: "b3", name: "B Three", hi: 15, bucket: 2 },
];

function event(defendingPair: EventDoc["defendingPair"]): EventDoc {
  return {
    id: "TEST",
    name: "",
    venue: "",
    dates: "",
    pinHash: "",
    adminPinHash: "",
    players,
    pairs: [],
    defendingPair,
  };
}

// Round-1 Stableford order, best first — b2 won the day.
const order = ["b2", "a1", "b3", "a3", "b1", "a2"];

describe("draftPairs", () => {
  it("pairs the defenders first, by right, and keeps them out of the draft", () => {
    const pairs = draftPairs(order, event(["a3", "b1"]));
    expect(pairs[0]).toMatchObject({ aId: "a3", bId: "b1", defending: true });
    // The rest drafted in round-1 order, always from the other bucket.
    expect(pairs.slice(1).map((p) => [p.aId, p.bId])).toEqual([
      ["b2", "a1"],
      ["b3", "a2"],
    ]);
  });

  it("picks the best available from the opposite bucket, in round-1 order", () => {
    const pairs = draftPairs(order, event(null));
    expect(pairs.map((p) => [p.aId, p.bId])).toEqual([
      ["b2", "a1"], // winner picks the best bucket-1 round
      ["b3", "a3"], // a1 is taken, so next unpaired in order picks
      ["b1", "a2"],
    ]);
    expect(pairs.some((p) => p.defending)).toBe(false);
  });

  it("never pairs within a bucket", () => {
    for (const p of draftPairs(order, event(["a1", "b1"]))) {
      const a = players.find((x) => x.id === p.aId)!;
      const b = players.find((x) => x.id === p.bId)!;
      expect(a.bucket).not.toBe(b.bucket);
    }
  });
});
