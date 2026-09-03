import { Fragment, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { formatDiff, formatThru, rank } from "../lib/leaderboard";

export interface LeaderRow {
  key: string;
  label: string;
  /** The value the table is ranked on. */
  value: number;
  /** What's rendered in the score column, if different from `value`. */
  display?: string;
  extra?: string;
  /** Tone for the extra line — "warn" renders it amber, for things that need noticing. */
  extraTone?: "warn";
  thru: number;
  /** Overrides the plain hole count in the Thru column, e.g. "R6·7" or "R3 ✓". */
  thruLabel?: string;
  /** Positions gained (+) or lost (−) against a baseline, shown as ▲2 / ▼1. */
  movement?: number;
  played: boolean;
  detail?: ReactNode;
}

export default function LeaderTable({
  rows,
  lowerIsBetter,
  scoreHeader,
  decimals = 0,
  totalHoles = 18,
  leaderMark,
  wideThru = false,
  highlightKeys,
}: {
  rows: LeaderRow[];
  lowerIsBetter: boolean;
  scoreHeader: string;
  decimals?: number;
  totalHoles?: number;
  /** Shown beside whoever is leading — a pair of falcons for pairs, one for an individual. */
  leaderMark?: ReactNode;
  /** Tournament tables carry round-aware Thru labels ("R6·7"), which need a wider column. */
  wideThru?: boolean;
  /** Hector TV: rows a spectator follows — violet tint and a star, rank untouched. */
  highlightKeys?: Set<string>;
}) {
  const [open, setOpen] = useState<string | null>(null);

  /*
   * Broadcast motion, straight off live TV graphics: when the standings change, rows
   * glide to their new position (FLIP via the Web Animations API), and a row whose
   * score just changed gets a one-beat violet pulse — which is how everyone in the
   * clubhouse sees a score land from another phone. Positions are measured relative
   * to the table, not the viewport, so scrolling can never fake a move. All of it
   * sits out when the OS asks for reduced motion.
   */
  const ranked = rank(
    rows,
    (r) => r.value,
    lowerIsBetter,
    (r) => r.played,
  );

  const tableEl = useRef<HTMLTableElement | null>(null);
  const rowEls = useRef(new Map<string, HTMLTableRowElement>());
  const prevTops = useRef(new Map<string, number>());
  const prevVals = useRef(new Map<string, string | number>());
  const prevOrder = useRef("");
  useLayoutEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const origin = tableEl.current?.getBoundingClientRect().top ?? 0;
    const tops = new Map<string, number>();
    rowEls.current.forEach((el, key) => {
      if (el.isConnected) tops.set(key, el.getBoundingClientRect().top - origin);
    });
    // Glide only when the ORDER changed. Rows also move when a detail row opens or
    // closes above them, but that's plain layout flow — and WebKit renders animated
    // transforms on table rows wobbly enough to nudge the whole table sideways.
    const order = ranked.map((r) => r.item.key).join("|");
    const reordered = prevOrder.current !== "" && order !== prevOrder.current;
    prevOrder.current = order;
    if (!reduced) {
      if (reordered) {
        for (const [key, top] of tops) {
          const from = prevTops.current.get(key);
          const el = rowEls.current.get(key);
          if (el && from !== undefined && Math.abs(from - top) > 2) {
            el.animate(
              [{ transform: `translateY(${from - top}px)` }, { transform: "translateY(0)" }],
              { duration: 500, easing: "cubic-bezier(0.22, 0.8, 0.24, 1)" },
            );
          }
        }
      }
      for (const r of rows) {
        const now = r.display ?? r.value;
        const before = prevVals.current.get(r.key);
        if (before !== undefined && before !== now) {
          rowEls.current.get(r.key)?.animate(
            [{ backgroundColor: "rgba(42, 127, 87, 0.2)" }, { backgroundColor: "transparent" }],
            { duration: 900, easing: "ease-out" },
          );
        }
      }
    }
    prevTops.current = tops;
    for (const r of rows) prevVals.current.set(r.key, r.display ?? r.value);
  });

  if (rows.length === 0) {
    return (
      <p className="text-sm text-slate-500 px-4 py-6 text-center">Nothing to show yet.</p>
    );
  }

  return (
    <div className="overflow-hidden">
      {/*
        De-boxed on purpose: leaderboards read as broadcast graphics — full-bleed rows
        and hairlines — while cards are reserved for things that are objects. table-fixed
        matters here: an expanded detail row spans all five columns, and with auto layout
        its content would widen the whole table, clipping the score and thru columns.
      */}
      <table ref={tableEl} className="w-full table-fixed text-sm">
        {/* Widths are tuned so a pair name like "Sami H + Kristian H" fits on a 375px screen. */}
        <colgroup>
          <col className="w-8" />
          <col />
          <col className={wideThru ? "w-[4rem]" : "w-[4.5rem]"} />
          <col className="w-[2.9rem]" />
          <col className={wideThru ? "w-12" : "w-10"} />
        </colgroup>
        <thead>
          {/* No tracking on these: the last two headers are narrow and letter-spacing runs "GAP" into "THRU". */}
          <tr className="text-slate-500 text-[11px] uppercase">
            <th className="text-left pl-2.5 py-2 font-semibold">#</th>
            <th className="text-left py-2 font-semibold">Name</th>
            <th className="text-right py-2 font-semibold px-1.5">{scoreHeader}</th>
            <th className="text-right py-2 font-semibold px-0.5">Gap</th>
            <th className="text-right py-2 font-semibold pl-1.5 pr-2.5">Thru</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((r) => {
            const expandable = Boolean(r.item.detail);
            const isOpen = open === r.item.key;
            // The leader's amber wins over the favourite's violet when they coincide.
            const fav = !r.leader && highlightKeys?.has(r.item.key);
            return (
              <Fragment key={r.item.key}>
                <tr
                  ref={(el) => {
                    if (el) rowEls.current.set(r.item.key, el);
                    else rowEls.current.delete(r.item.key);
                  }}
                  onClick={() => expandable && setOpen(isOpen ? null : r.item.key)}
                  className={`border-t border-slate-800 ${expandable ? "cursor-pointer active:bg-slate-800/60" : ""} ${
                    r.leader
                      ? "shadow-[inset_3px_0_0_theme(colors.gold.400)]"
                      : fav
                        ? "bg-violet-500/10 shadow-[inset_2px_0_0_theme(colors.violet.500)]"
                        : ""
                  }`}
                >
                  <td
                    className={`pl-2.5 py-2.5 num text-xs font-semibold ${
                      r.leader ? "text-gold-400" : "text-slate-500"
                    }`}
                  >
                    {r.label}
                  </td>
                  <td className="py-2.5 pr-2">
                    <div
                      className={`font-medium truncate flex items-center gap-1 ${
                        r.leader ? "text-gold-300" : "text-slate-100"
                      }`}
                    >
                      {/* The glyph is singular by nature — on a tie every leader
                          keeps the gold, but nobody holds the trophy yet. */}
                      {r.leader && ranked.filter((x) => x.leader).length === 1 && leaderMark}
                      {fav && <span className="text-violet-400 shrink-0">★</span>}
                      <span
                        className={`truncate ${fav ? "text-violet-200 font-semibold" : ""} ${
                          r.item.label.length > 17 ? "text-[15px] tracking-tight" : ""
                        }`}
                      >
                        {r.item.label}
                      </span>
                      {r.item.movement !== undefined && r.item.movement !== 0 && (
                        <span
                          className={`shrink-0 num text-[11px] font-bold ${
                            r.item.movement > 0 ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {r.item.movement > 0 ? "▲" : "▼"}
                          {Math.abs(r.item.movement)}
                        </span>
                      )}
                    </div>
                    {r.item.extra && (
                      <div
                        className={`text-[12px] num truncate ${
                          r.item.extraTone === "warn" ? "text-amber-500/90" : "text-slate-500"
                        }`}
                      >
                        {r.item.extra}
                      </div>
                    )}
                  </td>
                  <td
                    className={`text-right px-1.5 score text-[17px] whitespace-nowrap ${
                      r.leader ? "text-gold-300" : ""
                    }`}
                  >
                    {r.item.played
                      ? (r.item.display ?? r.item.value.toFixed(decimals))
                      : "—"}
                  </td>
                  <td className="text-right px-0.5 num text-[12px] text-slate-400 whitespace-nowrap">
                    {r.item.played ? formatDiff(r.diff, Math.max(decimals, 1)) : "—"}
                  </td>
                  <td className="text-right pl-1.5 pr-2.5 num text-[12px] text-slate-400 whitespace-nowrap">
                    {r.item.thruLabel ?? formatThru(r.item.thru, totalHoles)}
                  </td>
                </tr>
                {isOpen && r.item.detail && (
                  <tr className="border-t border-slate-800 bg-slate-950/60">
                    <td colSpan={5} className="px-3 py-3">
                      {r.item.detail}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
