import { describe, expect, it } from "vitest";
import type { FieldPlayer, Round } from "../types";
import { driftedSince, freezeNow, shouldFreeze } from "./freeze";

const players = [
  { id: "a", name: "A", hi: 13.1, bucket: 2 },
  { id: "b", name: "B", hi: 8.2, bucket: 1 },
] as FieldPlayer[];
const round = (extra: Partial<Round>): Round => ({ id: "r1", status: "upcoming", ...extra }) as Round;
const sep9 = new Date(2026, 8, 9, 12).getTime();
const sep5 = new Date(2026, 8, 5, 15).getTime();

describe("shouldFreeze", () => {
  it("freezes a round with no snapshot when it leaves upcoming", () => {
    expect(shouldFreeze(round({}), "open", sep9)).toBe(true);
    expect(shouldFreeze(round({}), "final", sep9)).toBe(true);
    expect(shouldFreeze(round({}), "upcoming", sep9)).toBe(false);
  });
  it("retakes a stray snapshot from an earlier day, or one without a date", () => {
    const snap = { a: 13.3, b: 7.9 };
    expect(shouldFreeze(round({ handicaps: snap, handicapsAt: sep5 }), "open", sep9)).toBe(true);
    expect(shouldFreeze(round({ handicaps: snap }), "open", sep9)).toBe(true);
  });
  it("keeps a snapshot taken today — a flight teed off before the organiser opened", () => {
    expect(shouldFreeze(round({ handicaps: { a: 13.1 }, handicapsAt: sep9 - 3600_000 }), "open", sep9)).toBe(false);
  });
  it("never touches the snapshot of a round that is already open or final", () => {
    expect(shouldFreeze(round({ status: "final", handicaps: { a: 13.3 }, handicapsAt: sep5 }), "open", sep9)).toBe(false);
  });
});

describe("freezeNow and driftedSince", () => {
  it("stamps every current index and reports who has moved since", () => {
    const frozen = freezeNow(players, sep5);
    expect(frozen).toEqual({ handicaps: { a: 13.1, b: 8.2 }, handicapsAt: sep5 });
    const moved = [{ ...players[0] }, { ...players[1], hi: 8.4 }] as FieldPlayer[];
    expect(driftedSince(round(frozen), moved).map((p) => p.id)).toEqual(["b"]);
    expect(driftedSince(round({}), moved)).toEqual([]);
  });
});
