/** Ranking with ties, shared by every leaderboard in the app. */

export interface Ranked<T> {
  item: T;
  /** 1, 2, 3… — equal values share a position. */
  position: number;
  /** "1", "T5" — what actually gets rendered. */
  label: string;
  /**
   * Raw difference to the leader (own value − leader's), the way hector.golf shows it:
   * "+2.9" behind on Hector where lower wins, "−1.0" behind on Victor where higher wins.
   */
  diff: number | null;
  leader: boolean;
}

export function rank<T>(
  items: T[],
  value: (item: T) => number,
  lowerIsBetter: boolean,
  /** Rows with nothing played are pushed to the bottom and get no position. */
  hasPlayed: (item: T) => boolean = () => true,
): Ranked<T>[] {
  const played = items.filter(hasPlayed);
  const unplayed = items.filter((i) => !hasPlayed(i));

  const sorted = [...played].sort((a, b) =>
    lowerIsBetter ? value(a) - value(b) : value(b) - value(a),
  );

  const leaderValue = sorted.length ? value(sorted[0]) : 0;
  const counts = new Map<number, number>();
  for (const item of sorted) {
    const v = round1(value(item));
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }

  let position = 0;
  let lastValue: number | null = null;
  const ranked: Ranked<T>[] = sorted.map((item, index) => {
    const v = round1(value(item));
    if (lastValue === null || v !== lastValue) {
      position = index + 1;
      lastValue = v;
    }
    const tied = (counts.get(v) ?? 0) > 1;
    return {
      item,
      position,
      label: `${tied ? "T" : ""}${position}`,
      diff: position === 1 ? null : value(item) - leaderValue,
      leader: position === 1,
    };
  });

  return [
    ...ranked,
    ...unplayed.map((item) => ({
      item,
      position: 0,
      label: "–",
      diff: null,
      leader: false,
    })),
  ];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** "+2.9", "−1.0", "—" — matching how hector.golf shows the gap to the leader. */
export function formatDiff(diff: number | null, decimals = 1): string {
  if (diff === null) return "—";
  const v = Math.round(diff * 10 ** decimals) / 10 ** decimals;
  if (v === 0) return "—";
  return v > 0 ? `+${v.toFixed(decimals)}` : `−${Math.abs(v).toFixed(decimals)}`;
}

/** "F" when the round is complete, otherwise the hole count. */
export function formatThru(thru: number, holes = 18): string {
  if (thru >= holes) return "F";
  if (thru === 0) return "—";
  return String(thru);
}

/** "+3", "E", "−2" for a to-par figure. */
export function formatToPar(toPar: number): string {
  if (toPar === 0) return "E";
  return toPar > 0 ? `+${toPar}` : `−${Math.abs(toPar)}`;
}
