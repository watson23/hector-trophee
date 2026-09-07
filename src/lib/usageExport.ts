import type { FieldPlayer, UsageDay } from "../types";

/**
 * Usage bookkeeping, flattened two ways: per player for the card, per player per day
 * for the CSV. Nothing here touches scores; it is the after-the-trip curiosity ("who
 * actually used it, and for what") in a form a spreadsheet can take.
 */

export interface UsageSummary {
  playerId: string;
  name: string;
  days: number;
  opens: number;
  lastSeen: number;
  /** View name → count, summed over days. */
  views: Record<string, number>;
}

export function summarizeUsage(days: UsageDay[], players: FieldPlayer[]): UsageSummary[] {
  const byPlayer = new Map<string, UsageSummary>();
  for (const day of days) {
    for (const [id, u] of Object.entries(day.players)) {
      const cur = byPlayer.get(id) ?? {
        playerId: id,
        name: players.find((p) => p.id === id)?.name ?? id,
        days: 0,
        opens: 0,
        lastSeen: 0,
        views: {},
      };
      cur.days += 1;
      cur.opens += u.opens ?? 0;
      cur.lastSeen = Math.max(cur.lastSeen, u.lastSeen ?? 0);
      for (const [k, n] of Object.entries(u.views ?? {})) cur.views[k] = (cur.views[k] ?? 0) + n;
      byPlayer.set(id, cur);
    }
  }
  return [...byPlayer.values()].sort((a, b) => b.lastSeen - a.lastSeen);
}

/** Every view name that appears anywhere, in a stable order — the CSV's columns. */
export function viewColumns(days: UsageDay[]): string[] {
  const known = ["play", "round", "tournament", "info", "admin"];
  const seen = new Set<string>();
  for (const day of days) for (const u of Object.values(day.players)) for (const k of Object.keys(u.views ?? {})) seen.add(k);
  return [...known.filter((k) => seen.has(k)), ...[...seen].filter((k) => !known.includes(k)).sort()];
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One row per player per day: date, player, opens, last seen (ISO), then a column per view. */
export function usageCsv(days: UsageDay[], players: FieldPlayer[]): string {
  const cols = viewColumns(days);
  const header = ["date", "player", "opens", "last_seen", ...cols];
  const rows = [...days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((day) =>
      Object.entries(day.players)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, u]) => [
          day.date,
          players.find((p) => p.id === id)?.name ?? id,
          u.opens ?? 0,
          u.lastSeen ? new Date(u.lastSeen).toISOString() : "",
          ...cols.map((c) => u.views?.[c] ?? 0),
        ]),
    );
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

/** The card as text: one line per player, then who has not opened the app. */
export function usageText(days: UsageDay[], players: FieldPlayer[], now = new Date()): string {
  const rows = summarizeUsage(days, players);
  const missing = players.filter((p) => !rows.some((r) => r.playerId === p.id));
  const when = (at: number) => new Date(at).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
  const lines = [
    `Hector app usage · ${now.toLocaleDateString("en-GB")}`,
    `${rows.length} of ${players.length} have opened the app`,
    "",
    ...rows.map((r) => {
      const views = Object.entries(r.views)
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `${k} ${n}`)
        .join(", ");
      return `${r.name}: ${r.days} day${r.days === 1 ? "" : "s"}, ${r.opens} open${r.opens === 1 ? "" : "s"}${views ? `, ${views}` : ""} · last ${when(r.lastSeen)}`;
    }),
  ];
  if (missing.length) lines.push("", `Not yet: ${missing.map((p) => p.name).join(", ")}`);
  return lines.join("\n") + "\n";
}

/** Hand a file to the phone's share sheet, or download it where there is none. */
export async function shareOrDownload(file: File): Promise<void> {
  try {
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: file.name });
      return;
    }
  } catch {
    /* cancelled or unsupported — fall through to a download */
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
