/**
 * Hector Trophée 2025 — the real results, from the spreadsheet the organiser kept by hand.
 *
 * This is the only ground truth available for the scoring rules, so it guards them. The
 * per-round figures are as they were recorded: Stableford points for the draft round,
 * net strokes for the individual stroke play, and scores against par for the three team
 * rounds. `total` is the official Hector total for that pair.
 *
 * Two things this fixture pins down that nothing else did:
 *
 * 1. The draft round's weight is exactly 1/3, not the 33% the published rules round it to.
 *    Lasse's 42 points converts to 66 strokes, and the sheet records 22.000 — 1/3 × 66.
 *    0.33 × 66 would be 21.78, and every total downstream would be wrong.
 *
 * 2. Birdies in the final scramble are counted GROSS. Lasse and Jari went round in net −4
 *    with 1 birdie and 0 eagles recorded. One net birdie cannot produce a net −4, so the
 *    count cannot be net.
 */
export interface Hector2025Row {
  pair: string;
  /** Draft round, both players. The better one counts. */
  r1Stableford: [number, number];
  r2BetterBallToPar: number;
  /** Both players' net strokes; both count, at 25% each. */
  r3StrokePlayNet: [number, number];
  r4ScrambleToPar: number;
  r5BetterBallToPar: number;
  r6ScrambleToPar: number;
  r6Birdies: number;
  r6Eagles: number;
  total: number;
}

/** Par is 72 on both Empordà courses, as it is on both Konopiště courses. */
export const PAR_2025 = 72;

export const hector2025: Hector2025Row[] = [
  {
    pair: "Harri V + Pasi H",
    r1Stableford: [32, 31],
    r2BetterBallToPar: -4,
    r3StrokePlayNet: [73, 80],
    r4ScrambleToPar: -4,
    r5BetterBallToPar: -8,
    r6ScrambleToPar: -1,
    r6Birdies: 1,
    r6Eagles: 0,
    total: 234.083333,
  },
  {
    pair: "Lasse K + Jari K",
    r1Stableford: [42, 36],
    r2BetterBallToPar: -9,
    r3StrokePlayNet: [70, 74],
    r4ScrambleToPar: -7,
    r5BetterBallToPar: -7,
    r6ScrambleToPar: -4,
    r6Birdies: 1,
    r6Eagles: 0,
    total: 222,
  },
  {
    pair: "Toni M + Simo L",
    r1Stableford: [37, 32],
    r2BetterBallToPar: -8,
    r3StrokePlayNet: [69, 74],
    r4ScrambleToPar: -2,
    r5BetterBallToPar: -7,
    r6ScrambleToPar: -4,
    r6Birdies: 4,
    r6Eagles: 0,
    total: 224.916667,
  },
  {
    pair: "Eero H + Jarkko K",
    r1Stableford: [36, 34],
    r2BetterBallToPar: -1,
    r3StrokePlayNet: [75, 76],
    r4ScrambleToPar: 0,
    r5BetterBallToPar: -14,
    r6ScrambleToPar: -3,
    r6Birdies: 3,
    r6Eagles: 0,
    total: 229.75,
  },
  {
    pair: "Marcus M + Olli V",
    r1Stableford: [36, 34],
    r2BetterBallToPar: -4,
    r3StrokePlayNet: [84, 69],
    r4ScrambleToPar: -6,
    r5BetterBallToPar: -2,
    r6ScrambleToPar: -3,
    r6Birdies: 2,
    r6Eagles: 0,
    total: 232.25,
  },
  {
    pair: "Lassi K + Mikko O",
    r1Stableford: [35, 27],
    r2BetterBallToPar: -6,
    r3StrokePlayNet: [86, 77],
    r4ScrambleToPar: -6,
    r5BetterBallToPar: -4,
    r6ScrambleToPar: -1,
    r6Birdies: 1,
    r6Eagles: 0,
    total: 235.583333,
  },
  {
    pair: "Tommy G + Jaakko S",
    r1Stableford: [34, 34],
    r2BetterBallToPar: -10,
    r3StrokePlayNet: [84, 80],
    r4ScrambleToPar: 4,
    r5BetterBallToPar: -4,
    r6ScrambleToPar: -2,
    r6Birdies: 5,
    r6Eagles: 0,
    total: 236.166667,
  },
  {
    pair: "Olli A + Ossi L",
    r1Stableford: [33, 28],
    r2BetterBallToPar: -1,
    r3StrokePlayNet: [69, 70],
    r4ScrambleToPar: -2,
    r5BetterBallToPar: -2,
    r6ScrambleToPar: -4,
    r6Birdies: 4,
    r6Eagles: 0,
    total: 231.25,
  },
  {
    pair: "Lauri P + Sami H",
    r1Stableford: [30, 24],
    r2BetterBallToPar: 4,
    r3StrokePlayNet: [86, 78],
    r4ScrambleToPar: -11,
    r5BetterBallToPar: -8,
    r6ScrambleToPar: -6,
    r6Birdies: 3,
    r6Eagles: 0,
    total: 232,
  },
  {
    pair: "Miso K + Okko P",
    r1Stableford: [29, 26],
    r2BetterBallToPar: -4,
    r3StrokePlayNet: [78, 78],
    r4ScrambleToPar: 1,
    r5BetterBallToPar: -4,
    r6ScrambleToPar: -2,
    r6Birdies: 1,
    r6Eagles: 0,
    total: 239.333333,
  },
  {
    pair: "Martin S + Pekka S",
    r1Stableford: [26, 26],
    r2BetterBallToPar: -3,
    r3StrokePlayNet: [74, 91],
    r4ScrambleToPar: -1,
    r5BetterBallToPar: -8,
    r6ScrambleToPar: 0,
    r6Birdies: 0,
    r6Eagles: 0,
    total: 242.583333,
  },
  {
    pair: "Ofri P + Janne V",
    r1Stableford: [25, 25],
    r2BetterBallToPar: -2,
    r3StrokePlayNet: [75, 79],
    r4ScrambleToPar: -3,
    r5BetterBallToPar: 0,
    r6ScrambleToPar: -3,
    r6Birdies: 3,
    r6Eagles: 0,
    total: 239.166667,
  },
];
