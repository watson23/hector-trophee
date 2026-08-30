import { Fragment, useState, type ReactNode } from "react";
import { formatDiff, formatThru, rank } from "../lib/leaderboard";
import HectorMark from "./HectorMark";

export interface LeaderRow {
  key: string;
  label: string;
  /** The value the table is ranked on. */
  value: number;
  /** What's rendered in the score column, if different from `value`. */
  display?: string;
  extra?: string;
  thru: number;
  played: boolean;
  detail?: ReactNode;
}

export default function LeaderTable({
  rows,
  lowerIsBetter,
  scoreHeader,
  decimals = 0,
  totalHoles = 18,
}: {
  rows: LeaderRow[];
  lowerIsBetter: boolean;
  scoreHeader: string;
  decimals?: number;
  totalHoles?: number;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const ranked = rank(
    rows,
    (r) => r.value,
    lowerIsBetter,
    (r) => r.played,
  );

  if (rows.length === 0) {
    return (
      <p className="text-sm text-slate-500 px-4 py-6 text-center">Nothing to show yet.</p>
    );
  }

  return (
    <div className="card overflow-hidden">
      {/*
        table-fixed matters here: an expanded detail row spans all five columns, and with
        auto layout its content widens the whole table past the card, clipping the score
        and thru columns.
      */}
      <table className="w-full table-fixed text-sm">
        {/* Widths are tuned so a pair name like "Sami H + Kristian H" fits on a 375px screen. */}
        <colgroup>
          <col className="w-8" />
          <col />
          <col className="w-[4.9rem]" />
          <col className="w-[2.9rem]" />
          <col className="w-10" />
        </colgroup>
        <thead>
          {/* No tracking on these: the last two headers are narrow and letter-spacing runs "DIFF" into "THRU". */}
          <tr className="bg-slate-800 text-slate-400 text-[10px] uppercase">
            <th className="text-left pl-2.5 py-2 font-semibold">#</th>
            <th className="text-left py-2 font-semibold">Name</th>
            <th className="text-right py-2 font-semibold px-1.5">{scoreHeader}</th>
            <th className="text-right py-2 font-semibold px-0.5">Diff</th>
            <th className="text-right py-2 font-semibold pl-1.5 pr-2.5">Thru</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((r) => {
            const expandable = Boolean(r.item.detail);
            const isOpen = open === r.item.key;
            return (
              <Fragment key={r.item.key}>
                <tr
                  onClick={() => expandable && setOpen(isOpen ? null : r.item.key)}
                  className={`border-t border-slate-800 ${expandable ? "cursor-pointer active:bg-slate-800/60" : ""} ${
                    r.leader ? "bg-amber-400/5" : ""
                  }`}
                >
                  <td
                    className={`pl-2.5 py-2.5 num text-xs font-semibold ${
                      r.leader ? "text-amber-400" : "text-slate-500"
                    }`}
                  >
                    {r.label}
                  </td>
                  <td className="py-2.5 pr-2">
                    <div
                      className={`font-medium truncate flex items-center gap-1.5 ${
                        r.leader ? "text-amber-200" : "text-slate-100"
                      }`}
                    >
                      {r.leader && (
                        <HectorMark className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                      )}
                      <span className="truncate">{r.item.label}</span>
                    </div>
                    {r.item.extra && (
                      <div className="text-[11px] text-slate-500 num truncate">{r.item.extra}</div>
                    )}
                  </td>
                  <td className="text-right px-1.5 num font-bold tabular-nums whitespace-nowrap">
                    {r.item.played
                      ? (r.item.display ?? r.item.value.toFixed(decimals))
                      : "—"}
                  </td>
                  <td className="text-right px-0.5 num text-[11px] text-slate-400 whitespace-nowrap">
                    {r.item.played ? formatDiff(r.diff, Math.max(decimals, 1)) : "—"}
                  </td>
                  <td className="text-right pl-1.5 pr-2.5 num text-[11px] text-slate-400">
                    {formatThru(r.item.thru, totalHoles)}
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
