import { describe, expect, it } from "vitest";
import type { Card, EventDoc, Round } from "../types";
import { todayTasks } from "./today";

const players = Array.from({ length: 6 }, (_, i) => ({ id: `p${i + 1}`, name: `P ${i + 1}`, hi: 10, bucket: (i % 2) + 1 }));
const event = (patch: Partial<EventDoc> = {}): EventDoc =>
  ({ id: "E", players, pairs: [], announcements: [], ...patch }) as unknown as EventDoc;

const round = (seq: number, status: Round["status"], groups: string[][] = [], team = false): Round =>
  ({
    id: `r${seq}`,
    seq,
    day: `Day ${seq}`,
    date: "2026-09-24",
    courseId: "radecky",
    tee: "yellow",
    status,
    teeTimeWindow: "12:03–12:48",
    groups: groups.map((ids, i) => ({ id: `g${i}`, teeTime: "12:03", playerIds: ids })),
    // Round 1 is the draft round: its individual result sets the pick order.
    formats: [
      {
        id: team ? "scramble" : "stableford",
        kind: team ? "scramble" : "stableford",
        label: "x",
        net: true,
        allowance: 1,
        teamCard: team,
        ...(seq === 1 ? { hector: { source: "betterIndividual", pct: 1 / 3 } } : {}),
      },
    ],
  }) as unknown as Round;

const full = { holes: Object.fromEntries(Array.from({ length: 18 }, (_, i) => [String(i + 1), 4])) } as unknown as Card;
const half = { holes: { "1": 4, "2": 5 } } as unknown as Card;

describe("todayTasks", () => {
  it("before round 1, with names in the hat: draw first, then open", () => {
    const t = todayTasks(event(), [round(1, "upcoming", [["p1", "p2"]]), round(2, "upcoming")], {});
    expect(t.map((x) => x.action)).toEqual(["draw", "open"]);
    expect(t[0].body).toContain("4 of 6 still in the hat");
    expect(t[1].body).toContain("Draw the tee times first");
  });

  it("with the tee sheet drawn: open round 1", () => {
    const t = todayTasks(event(), [round(1, "upcoming", [["p1", "p2", "p3"], ["p4", "p5", "p6"]])], {});
    expect(t.map((x) => x.action)).toEqual(["open"]);
    expect(t[0].title).toBe("Open round 1");
  });

  it("a live round owns the screen and counts cards", () => {
    const rounds = [round(1, "open", [["p1", "p2"], ["p3", "p4"]]), round(2, "upcoming")];
    const t = todayTasks(event(), rounds, { r1: { p1: full, p2: full, p3: half } });
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ action: "close", enabled: false, title: "Round 1 is live" });
    expect(t[0].body).toContain("2 of 4 cards complete");
  });

  it("all cards in: close the round", () => {
    const rounds = [round(1, "open", [["p1", "p2"]])];
    const t = todayTasks(event(), rounds, { r1: { p1: full, p2: full } });
    expect(t[0]).toMatchObject({ action: "close", enabled: true, title: "Close round 1", roundId: "r1" });
  });

  it("a scramble counts one card per pair", () => {
    const ev = event({ pairs: [{ id: "x", aId: "p1", bId: "p2" }, { id: "y", aId: "p3", bId: "p4" }] as EventDoc["pairs"] });
    const rounds = [round(4, "open", [["p1", "p2", "p3", "p4"]], true)];
    const t = todayTasks(ev, rounds, { r4: { team__x: full } });
    expect(t[0].body).toContain("1 of 2 cards complete");
  });

  it("round 1 final and no pairs yet: run the draft, then open round 2 — with a quiet way back", () => {
    const t = todayTasks(event(), [round(1, "final"), round(2, "upcoming")], {});
    expect(t.map((x) => x.action)).toEqual(["draft", "reopen", "open"]);
    expect(t.find((x) => x.action === "reopen")).toMatchObject({ roundId: "r1", quiet: true });
    expect(t[0].body).toContain("0 of 3 pairs");
  });

  it("all pairs standing: conclude the draft", () => {
    const ev = event({ pairs: [1, 2, 3].map((i) => ({ id: `q${i}`, aId: "a", bId: "b" })) as EventDoc["pairs"] });
    const t = todayTasks(ev, [round(1, "final"), round(2, "upcoming")], {});
    expect(t[0].action).toBe("conclude");
  });

  it("draft concluded: the next round, and reopening the last one", () => {
    const t = todayTasks(event({ draftConcluded: true }), [round(1, "final"), round(2, "upcoming")], {});
    expect(t.map((x) => x.action)).toEqual(["reopen", "open"]);
  });

  it("everything final: the week is played, with the last round reopenable", () => {
    const t = todayTasks(event({ draftConcluded: true }), [round(1, "final"), round(2, "final")], {});
    expect(t[0]).toMatchObject({ action: "done", enabled: false });
    expect(t[1]).toMatchObject({ action: "reopen", roundId: "r2" });
  });
});
