import { describe, expect, it } from "vitest";
import { formatDiff, formatThru, formatToPar, rank } from "./leaderboard";

interface Row {
  id: string;
  value: number;
  played?: boolean;
}

const row = (id: string, value: number, played = true): Row => ({ id, value, played });

function ranked(rows: Row[], lowerIsBetter: boolean) {
  return rank(
    rows,
    (r) => r.value,
    lowerIsBetter,
    (r) => r.played ?? true,
  );
}

describe("rank", () => {
  it("shares a position on a tie and skips the next one, like real leaderboards", () => {
    const [a, b, c, d] = ranked(
      [row("a", 30), row("b", 28), row("c", 30), row("d", 25)],
      false,
    );
    expect([a.item.id, a.label, b.item.id, b.label]).toEqual(["a", "T1", "c", "T1"]);
    expect([c.label, d.label]).toEqual(["3", "4"]);
  });

  it("calls a tie on the displayed precision, one decimal", () => {
    // 221.99 and 222.01 both render 222.0 — showing identical numbers at different
    // positions would look like a bug to every reader.
    const [a, b] = ranked([row("a", 221.99), row("b", 222.01)], true);
    expect(a.label).toBe("T1");
    expect(b.label).toBe("T1");
  });

  it("signs the diff from the chaser's side in both directions", () => {
    // Hector (lower wins): the chaser is above the leader, +2.0 behind.
    const hector = ranked([row("lead", 220), row("chase", 222)], true);
    expect(hector[1].diff).toBe(2);
    // Victor (higher wins): the chaser is below the leader, −2.0 behind.
    const victor = ranked([row("lead", 130), row("chase", 128)], false);
    expect(victor[1].diff).toBe(-2);
    expect(hector[0].diff).toBeNull();
  });

  it("pushes unplayed rows to the bottom with no position", () => {
    const rows = ranked([row("idle", 0, false), row("out", 18)], false);
    expect(rows[0].item.id).toBe("out");
    expect(rows[1].label).toBe("–");
    expect(rows[1].position).toBe(0);
  });
});

describe("formatting", () => {
  it("renders diffs the way hector.golf does", () => {
    expect(formatDiff(null)).toBe("—");
    expect(formatDiff(0.04)).toBe("—"); // rounds to zero at one decimal
    expect(formatDiff(2.9)).toBe("+2.9");
    expect(formatDiff(-1)).toBe("−1.0");
  });

  it("says F for a finished round and — before it starts", () => {
    expect(formatThru(18)).toBe("F");
    expect(formatThru(0)).toBe("—");
    expect(formatThru(11)).toBe("11");
  });

  it("uses E for level par", () => {
    expect(formatToPar(0)).toBe("E");
    expect(formatToPar(3)).toBe("+3");
    expect(formatToPar(-2)).toBe("−2");
  });
});
