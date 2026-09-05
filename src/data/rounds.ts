import type { FormatSpec, PlayingGroup, Round } from "../types";

/**
 * The six 2026 rounds, per the official programme (received 1.9.2026).
 *
 * The formats confirmed the 2025 shape exactly; only the tees were news:
 * yellow / blue / white / white / blue / yellow. The rules committee is still
 * mulling whether to reshuffle the schedule (two scrambles on d'Este) — if they
 * do, courses and tees move here and in Admin, the formats travel with them.
 *
 * ⚠️ r2 and r5 play off blue, whose published CR/slope look like the ladies'
 * rating (see courses.ts) — the suspect-tee warning stays on in Admin/Info until
 * someone checks the club scorecard on site and sets a CR override if needed.
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

/**
 * The formats an organiser can put on a round, as Admin offers them — the same specs the
 * programme uses, so a field test plays exactly what the tournament will, and a reshuffle
 * by the rules committee is a matter of ticking boxes.
 */
export const FORMAT_PRESETS: { id: string; label: string; spec: FormatSpec }[] = [
  { id: "stableford", label: "Stableford NET", spec: stablefordVictor() },
  { id: "strokeplay-net", label: "Stroke Play NET", spec: strokePlayNet },
  { id: "strokeplay-scr", label: "Stroke Play SCR", spec: strokePlayGross },
  { id: "betterball", label: "Better Ball NET", spec: betterBall },
  { id: "scramble", label: "Scramble NET", spec: scramble(1.0) },
];

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
  },
  {
    id: "r2",
    seq: 2,
    day: "Fri 25.9",
    date: "2026-09-25",
    courseId: "deste",
    tee: "blue",
    status: "upcoming",
    teeTimeWindow: "08:36–09:21",
    groups: defaultGroups("08:36–09:21"),
    formats: [betterBall, stablefordVictor()],
  },
  {
    id: "r3",
    seq: 3,
    day: "Fri 25.9",
    date: "2026-09-25",
    courseId: "radecky",
    tee: "white",
    status: "upcoming",
    teeTimeWindow: "14:27–15:12",
    groups: defaultGroups("14:27–15:12"),
    formats: [strokePlayNet, stablefordVictor()],
  },
  {
    id: "r4",
    seq: 4,
    day: "Sat 26.9",
    date: "2026-09-26",
    courseId: "deste",
    tee: "white",
    status: "upcoming",
    teeTimeWindow: "08:36–09:21",
    groups: defaultGroups("08:36–09:21"),
    formats: [scramble(0.5)],
  },
  {
    id: "r5",
    seq: 5,
    day: "Sat 26.9",
    date: "2026-09-26",
    courseId: "radecky",
    tee: "blue",
    status: "upcoming",
    teeTimeWindow: "14:27–15:12",
    groups: defaultGroups("14:27–15:12"),
    formats: [betterBall, stablefordVictor()],
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
  },
];


/**
 * Field-test events get their own single round instead of the Konopiště programme:
 * seeded when the event's rounds collection is empty, editable in Admin like any round.
 */
export function defaultRoundsFor(eventId: string): Round[] {
  if (eventId === "TAPIOLA-FIELD") {
    return [
      {
        id: "r1",
        seq: 1,
        day: "Sat 5.9",
        date: "2026-09-05",
        courseId: "tapiola",
        tee: "yellow",
        status: "upcoming",
        teeTimeWindow: "06:30–06:30",
        // Lasse is already in the 06:30 flight, so the round is playable the moment it opens.
        groups: [{ ...defaultGroups("06:30–06:30", 1)[0], playerIds: ["lasse-k"] }],
        formats: [stablefordVictor(), strokePlayGross],
      },
    ];
  }
  return defaultRounds;
}
