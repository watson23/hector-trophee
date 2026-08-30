import { describe, expect, it } from "vitest";
import { hector2025, PAR_2025 as PAR, type Hector2025Row } from "./hector2025.fixture";
import { applyBonuses, hectorContribution, stablefordToStrokes } from "./hector";
import { DRAFT_ROUND_WEIGHT } from "../data/rounds";
import { rank } from "./leaderboard";

/**
 * The 2025 event, replayed through the scoring engine.
 *
 * This is the strongest check available on the Hector rules: twelve real pairs, six real
 * rounds, against totals a human computed by hand at the time. If the engine drifts, this
 * is what catches it.
 *
 * The fixture holds round results rather than hole-by-hole scores, because that is all the
 * spreadsheet recorded — so this exercises the weighting and the Stableford conversion,
 * not the per-hole formats, which are covered in engine.test.ts.
 */

/** The whole Hector total for one pair, using only the engine's own functions. */
function hectorTotal(row: Hector2025Row): number {
  const strokes = (toPar: number) => PAR + toPar;

  const contributions = [
    // Draft round: the better individual's Stableford, converted to strokes.
    hectorContribution({
      value: Math.max(...row.r1Stableford),
      kind: "stableford",
      par: PAR,
      pct: DRAFT_ROUND_WEIGHT,
    }),
    hectorContribution({
      value: strokes(row.r2BetterBallToPar),
      kind: "betterball",
      par: PAR,
      pct: 0.5,
    }),
    // Individual stroke play counts BOTH players at 25% each.
    ...row.r3StrokePlayNet.map((net) =>
      hectorContribution({ value: net, kind: "strokeplay", par: PAR, pct: 0.25 }),
    ),
    hectorContribution({
      value: strokes(row.r4ScrambleToPar),
      kind: "scramble",
      par: PAR,
      pct: 0.5,
    }),
    hectorContribution({
      value: strokes(row.r5BetterBallToPar),
      kind: "betterball",
      par: PAR,
      pct: 0.5,
    }),
    // The final scramble carries the birdie and eagle bonuses.
    applyBonuses(
      hectorContribution({
        value: strokes(row.r6ScrambleToPar),
        kind: "scramble",
        par: PAR,
        pct: 1.0,
      }),
      0.5 * row.r6Birdies + 1.0 * row.r6Eagles,
    ),
  ];

  return contributions.reduce((a, b) => a + b, 0);
}

describe("Hector Trophée 2025, replayed", () => {
  it.each(hector2025)("reproduces $pair on $total", (row) => {
    expect(hectorTotal(row)).toBeCloseTo(row.total, 6);
  });

  it("puts the same pairs in the same order, with the same gaps", () => {
    const ranked = rank(hector2025, hectorTotal, true);
    expect(ranked.slice(0, 3).map((r) => r.item.pair)).toEqual([
      "Lasse K + Jari K",
      "Toni M + Simo L",
      "Eero H + Jarkko K",
    ]);
    // The gaps hector.golf published: +2.9 and +7.8.
    expect(ranked[1].diff).toBeCloseTo(2.9166, 3);
    expect(ranked[2].diff).toBeCloseTo(7.75, 3);
    expect(ranked[ranked.length - 1].item.pair).toBe("Martin S + Pekka S");
  });

  it("matches the spread the organiser recorded", () => {
    const totals = hector2025.map(hectorTotal).sort((a, b) => a - b);
    expect(totals[0]).toBeCloseTo(222.0, 4);
    expect(totals[totals.length - 1]).toBeCloseTo(242.5833, 3);
    const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
    expect(mean).toBeCloseTo(233.2569, 3);
  });

  it("needs the draft weight to be exactly one third", () => {
    // Lasse's 42 points is 66 strokes; the sheet records 22.000 for that round.
    const strokes = stablefordToStrokes(42, PAR);
    expect(strokes).toBe(66);
    expect(DRAFT_ROUND_WEIGHT * strokes).toBeCloseTo(22.0, 9);
    // The published rules round the weight to 33%, which does not reproduce the sheet.
    expect(0.33 * strokes).not.toBeCloseTo(22.0, 2);
  });

  it("counts the final scramble's birdies gross, not net", () => {
    // Lasse and Jari: net −4 with 1 birdie and 0 eagles recorded. One net birdie can put
    // a team at most 1 under, so that count cannot be measured against net scores.
    const row = hector2025.find((r) => r.pair === "Lasse K + Jari K")!;
    expect(row.r6ScrambleToPar).toBe(-4);
    expect(row.r6Birdies).toBe(1);
    expect(row.r6Eagles).toBe(0);
    const bestPossibleNetUnder = row.r6Birdies * 1 + row.r6Eagles * 2;
    expect(bestPossibleNetUnder).toBeLessThan(Math.abs(row.r6ScrambleToPar));
  });

  it("lets the bonuses help rather than hurt", () => {
    const row = hector2025.find((r) => r.pair === "Toni M + Simo L")!;
    expect(row.r6Birdies).toBe(4);
    const withBonus = hectorTotal(row);
    const withoutBonus = hectorTotal({ ...row, r6Birdies: 0, r6Eagles: 0 });
    expect(withBonus).toBeCloseTo(withoutBonus - 2, 6);
  });
});
