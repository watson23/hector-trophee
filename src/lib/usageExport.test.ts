import { describe, expect, it } from "vitest";
import type { FieldPlayer, UsageDay } from "../types";
import { summarizeUsage, usageCsv, usageText, viewColumns } from "./usageExport";

const players = [
  { id: "jarkko-k", name: "Jarkko K" },
  { id: "lasse-k", name: "Lasse K" },
  { id: "olli-v", name: "Olli V" },
] as FieldPlayer[];

const days: UsageDay[] = [
  {
    date: "2026-09-05",
    players: {
      "jarkko-k": { lastSeen: Date.UTC(2026, 8, 5, 10), opens: 3, views: { info: 5, tournament: 2 } },
      "olli-v": { lastSeen: Date.UTC(2026, 8, 5, 16), opens: 2, views: { play: 11, round: 1 } },
    },
  },
  {
    date: "2026-09-07",
    players: {
      "jarkko-k": { lastSeen: Date.UTC(2026, 8, 7, 17), opens: 15, views: { info: 10, tournament: 10, weird: 1 } },
    },
  },
];

describe("summarizeUsage", () => {
  it("sums opens and views over days, keeps the latest sighting, sorts by it", () => {
    const rows = summarizeUsage(days, players);
    expect(rows.map((r) => r.name)).toEqual(["Jarkko K", "Olli V"]);
    expect(rows[0]).toMatchObject({ days: 2, opens: 18, views: { info: 15, tournament: 12, weird: 1 } });
    expect(rows[0].lastSeen).toBe(Date.UTC(2026, 8, 7, 17));
  });
});

describe("usageCsv", () => {
  it("writes one row per player per day with a column per view, known views first", () => {
    expect(viewColumns(days)).toEqual(["play", "round", "tournament", "info", "weird"]);
    const csv = usageCsv(days, players);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("date,player,opens,last_seen,play,round,tournament,info,weird");
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe("2026-09-05,Jarkko K,3,2026-09-05T10:00:00.000Z,0,0,2,5,0");
    expect(lines[3]).toBe("2026-09-07,Jarkko K,15,2026-09-07T17:00:00.000Z,0,0,10,10,1");
  });
});

describe("usageText", () => {
  it("reads as the card does and names who has not opened the app", () => {
    const text = usageText(days, players, new Date(Date.UTC(2026, 8, 7, 18)));
    expect(text).toContain("2 of 3 have opened the app");
    expect(text).toContain("Jarkko K: 2 days, 18 opens, info 15, tournament 12, weird 1");
    expect(text).toContain("Not yet: Lasse K");
  });
});
