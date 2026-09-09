import { describe, expect, it } from "vitest";
import { featAnnouncement, featFor, featId, featsLive, ordinal } from "./announce";

const base = { hole: 14, who: "Jarkko K", team: false, course: "Radecký", roundSeq: 3 };

describe("featFor", () => {
  it("classifies against par", () => {
    expect(featFor(1, 3)).toBe("ace");
    expect(featFor(1, 5)).toBe("ace");
    expect(featFor(3, 5)).toBe("eagle");
    expect(featFor(2, 4)).toBe("eagle");
    expect(featFor(2, 5)).toBe("albatross");
    expect(featFor(4, 5)).toBeNull();
    expect(featFor(5, 5)).toBeNull();
    expect(featFor(null, 4)).toBeNull();
    expect(featFor(0, 4)).toBeNull();
  });
});

describe("featAnnouncement", () => {
  it("says nothing for a birdie", () => {
    expect(featAnnouncement({ ...base, value: 4, par: 5 })).toBeNull();
  });

  it("names the player, the hole and the round for an eagle", () => {
    const a = featAnnouncement({ ...base, value: 3, par: 5 });
    expect(a?.kind).toBe("eagle");
    expect(a?.text).toBe("🦅 Eagle! Jarkko K made 3 on the par-5 14th at Radecký in round 3.");
  });

  it("calls a scramble eagle a team eagle", () => {
    const a = featAnnouncement({ ...base, value: 2, par: 4, who: "Olli A + Jarkko K", team: true });
    expect(a?.text.startsWith("🦅 Team eagle! Olli A + Jarkko K made 2")).toBe(true);
  });

  it("keeps the champagne and the beer clause for an ace", () => {
    const a = featAnnouncement({ ...base, value: 1, par: 3, hole: 11 });
    expect(a?.kind).toBe("ace");
    expect(a?.text).toContain("HOLE-IN-ONE! Jarkko K aced the 11th at Radecký in round 3");
    expect(a?.text).toContain("round of beers");
  });

  it("treats a 2 on a par 5 as an albatross, with a nudge to check the card", () => {
    const a = featAnnouncement({ ...base, value: 2, par: 5 });
    expect(a?.kind).toBe("albatross");
    expect(a?.text).toContain("double-check");
  });
});

describe("ids and ordinals", () => {
  it("keys one announcement per feat, round, card and hole", () => {
    expect(featId("eagle", "r3", "jarkko-k", 14)).toBe("eagle-r3-jarkko-k-14");
    expect(featId("ace", "r1", "team__p1", 7)).toBe("ace-r1-team__p1-7");
  });

  it("spells ordinals the English way", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 18].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "18th"]);
  });
});

describe("featsLive", () => {
  const rounds = [{ date: "2026-09-25" }, { date: "2026-09-24" }, { date: "2026-09-27" }];
  it("keeps Hector quiet until the first round day, local time", () => {
    expect(featsLive(rounds, new Date(2026, 8, 23, 23, 59))).toBe(false);
    expect(featsLive(rounds, new Date(2026, 8, 24, 0, 1))).toBe(true);
    expect(featsLive(rounds, new Date(2026, 8, 27, 18))).toBe(true);
  });
  it("speaks when there is no programme to wait for", () => {
    expect(featsLive([])).toBe(true);
  });
});
