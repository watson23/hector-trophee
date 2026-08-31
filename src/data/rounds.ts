import type { FormatSpec, PlayingGroup, Round } from "../types";

/**
 * The six 2026 rounds.
 *
 * Courses and tee-time windows are confirmed. The game formats are seeded from
 * Hector Trophée 2025, which had the identical 1–2–2–1 round shape; every round is
 * marked `provisional` until the official 2026 programme is published, and all of it
 * is editable in Admin.
 *
 * Tees default to yellow throughout rather than mirroring 2025's yellow/blue/yellow/
 * white/blue/white pattern — guessing an unannounced tee would silently change every
 * course handicap in the app.
 */

/**
 * The draft round's weight is exactly one third, not the 0.33 the published rules round
 * it to. The 2025 sheet records Lasse's 42 points as 22.000 Hector strokes — 1/3 × 66.
 * At 0.33 it would be 21.78, and every total downstream would drift.
 */
export const DRAFT_ROUND_WEIGHT = 1 / 3;

const stablefordVictor = (hectorPct?: number): FormatSpec => ({
  id: "stableford",
  kind: "stableford",
  label: "Stableford NET",
  net: true,
  allowance: 1.0,
  teamCard: false,
  ...(hectorPct ? { hector: { source: "betterIndividual" as const, pct: hectorPct } } : {}),
  victor: { pct: 1.0 },
});

const strokePlayGross: FormatSpec = {
  id: "strokeplay-scr",
  kind: "strokeplay",
  label: "Stroke Play SCR",
  net: false,
  allowance: 0,
  teamCard: false,
};

const betterBall: FormatSpec = {
  id: "betterball",
  kind: "betterball",
  label: "Better Ball Stroke Play NET",
  net: true,
  allowance: 1.0,
  teamCard: false,
  hector: { source: "team", pct: 0.5 },
};

const strokePlayNet: FormatSpec = {
  id: "strokeplay-net",
  kind: "strokeplay",
  label: "Stroke Play NET",
  net: true,
  allowance: 1.0,
  teamCard: false,
  hector: { source: "bothIndividuals", pct: 0.25 },
};

const scramble = (pct: number, bonuses?: FormatSpec["bonuses"]): FormatSpec => ({
  id: "scramble",
  kind: "scramble",
  label: "Scramble Stroke Play NET",
  net: true,
  allowance: 0.2,
  teamCard: true,
  hector: { source: "team", pct },
  ...(bonuses ? { bonuses } : {}),
});

/** The resort books five tee times per round — the sheet's size is a fact, not a preference. */
export const DEFAULT_FLIGHT_COUNT = 5;

/** Five flights of four, times spread evenly across the published window. */
export function defaultGroups(window: string, count = DEFAULT_FLIGHT_COUNT): PlayingGroup[] {
  const [start, end] = window.split("–");
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const fmt = (mins: number) =>
    `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  const from = toMin(start);
  const step = count > 1 ? (toMin(end) - from) / (count - 1) : 0;
  return Array.from({ length: count }, (_, i) => ({
    id: `g${i + 1}`,
    teeTime: fmt(Math.round(from + step * i)),
    playerIds: [],
  }));
}

export const defaultRounds: Round[] = [
  {
    id: "r1",
    seq: 1,
    day: "Thu 24.9",
    date: "2026-09-24",
    courseId: "radecky",
    tee: "yellow",
    status: "upcoming",
    teeTimeWindow: "12:03–12:48",
    groups: defaultGroups("12:03–12:48"),
    formats: [stablefordVictor(DRAFT_ROUND_WEIGHT), strokePlayGross],
    provisional: true,
  },
  {
    id: "r2",
    seq: 2,
    day: "Fri 25.9",
    date: "2026-09-25",
    courseId: "deste",
    tee: "yellow",
    status: "upcoming",
    teeTimeWindow: "08:36–09:21",
    groups: defaultGroups("08:36–09:21"),
    formats: [betterBall, stablefordVictor()],
    provisional: true,
  },
  {
    id: "r3",
    seq: 3,
    day: "Fri 25.9",
    date: "2026-09-25",
    courseId: "radecky",
    tee: "yellow",
    status: "upcoming",
    teeTimeWindow: "14:27–15:12",
    groups: defaultGroups("14:27–15:12"),
    formats: [strokePlayNet, stablefordVictor()],
    provisional: true,
  },
  {
    id: "r4",
    seq: 4,
    day: "Sat 26.9",
    date: "2026-09-26",
    courseId: "deste",
    tee: "yellow",
    status: "upcoming",
    teeTimeWindow: "08:36–09:21",
    groups: defaultGroups("08:36–09:21"),
    formats: [scramble(0.5)],
    provisional: true,
  },
  {
    id: "r5",
    seq: 5,
    day: "Sat 26.9",
    date: "2026-09-26",
    courseId: "radecky",
    tee: "yellow",
    status: "upcoming",
    teeTimeWindow: "14:27–15:12",
    groups: defaultGroups("14:27–15:12"),
    formats: [betterBall, stablefordVictor()],
    provisional: true,
  },
  {
    id: "r6",
    seq: 6,
    day: "Sun 27.9",
    date: "2026-09-27",
    courseId: "deste",
    tee: "yellow",
    status: "upcoming",
    teeTimeWindow: "09:03–09:48",
    groups: defaultGroups("09:03–09:48"),
    formats: [scramble(1.0, { birdie: 0.5, eagle: 1 })],
    provisional: true,
  },
];
