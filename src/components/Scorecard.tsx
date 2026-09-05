import { useState } from "react";
import type { Card, Course, EventDoc } from "../types";
import type { FormatResult } from "../lib/engine";
import { formatToPar } from "../lib/leaderboard";
import ScoreMark, { ScoreLegend } from "./ScoreMark";

/** A card being shown: one per player, or one per pair in a scramble. */
interface Subject {
  id: string;
  name: string;
  strokes: number[];
  mine?: boolean;
}

/** How a board's cells read: gross strokes (score marks), net strokes, or points. */
type CellKind = "gross" | "net" | "points";

interface Row {
  key: string;
  label: string;
  mine: boolean;
  perHole: (number | null)[];
  /** Handicap strokes per hole, for the dots above gross and net cells. */
  strokes?: number[];
  /** On a points board, the gross strokes behind the points — the number a golfer reads first. */
  gross?: (number | null)[];
  headline: string;
  /**
   * Running gross stroke total over the holes played, and whether all 18 are in. Shown
   * from the first hole (nothing appears by surprise on the 18th), quiet until final.
   * Individual cards only — a pair's counted strokes are not a stroke total.
   */
  total?: { strokes: number; holes: number };
}

interface Board {
  id: string;
  label: string;
  kind: CellKind;
  rows: Row[];
}

/**
 * The scorecard, one nine at a time, with the same boards as the Round tab: every
 * format the round is played in, plus Scratch (the raw gross card). Each board's
 * cells are what that format counted on each hole — gross as score marks, net or
 * points as numbers — so a Better Ball day shows the pair's counted score per hole.
 * Tapping a hole number opens the entry sheet on that hole.
 */
export default function Scorecard({
  course,
  subjects,
  cards,
  event,
  flightIds,
  formats,
  mainId,
  currentHole,
  onPickHole,
  onBack,
  onShowWholeRound,
}: {
  course: Course;
  subjects: Subject[];
  cards: Record<string, Card | undefined>;
  event: EventDoc;
  flightIds: string[];
  /** The round's computed formats (may be empty before any scores). */
  formats: FormatResult[];
  /** Id of the round's main format — the board that opens first. */
  mainId: string | undefined;
  currentHole: number;
  onPickHole: (hole: number) => void;
  /** Back to the course view — named by where it lands, the current hole. */
  onBack: () => void;
  /** Zoom out to the Round tab on this board — the third step of hole → group → field. */
  onShowWholeRound?: (boardId: string) => void;
}) {
  const boards = buildBoards(course, subjects, cards, event, flightIds, formats);
  const [boardSel, setBoardSel] = useState<string | null>(null);
  const board = boards.find((b) => b.id === boardSel) ?? boards.find((b) => b.id === mainId) ?? boards[0];
  const [nine, setNine] = useState<"out" | "in">(currentHole > 9 ? "in" : "out");
  const from = nine === "in" ? 9 : 0;
  const holes = Array.from({ length: 9 }, (_, i) => from + i);
  const nineLabel = nine === "in" ? "In" : "Out";
  const nineParSum = holes.reduce((a, i) => a + course.par[i], 0);

  return (
    <div>
      {boards.length > 1 && (
        <div className="flex gap-1.5 flex-wrap mb-3">
          {boards.map((b) => (
            <button
              key={b.id}
              onClick={() => setBoardSel(b.id)}
              className={`pill font-semibold ${
                board?.id === b.id
                  ? "bg-violet-600 text-white"
                  : "border border-slate-700 bg-slate-900 text-slate-400"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-1.5">
          {(["out", "in"] as const).map((n) => (
            <button
              key={n}
              onClick={() => setNine(n)}
              className={`pill font-semibold ${
                nine === n
                  ? "bg-slate-700 text-slate-100"
                  : "border border-slate-700 bg-slate-900 text-slate-400"
              }`}
            >
              {n === "out" ? "Out · 1–9" : "In · 10–18"}
            </button>
          ))}
        </div>
        <div className="text-[12px] text-slate-500 num">Par {nineParSum}</div>
      </div>

      <div className="grid grid-cols-[repeat(9,minmax(0,1fr))_2.4rem] gap-x-0.5 items-end">
        {holes.map((i) => {
          const h = i + 1;
          const current = h === currentHole;
          return (
            <button
              key={h}
              onClick={() => onPickHole(h)}
              aria-label={`Score hole ${h}`}
              /* The hole number is an index, so it is set as a caption; the par
                 beneath is data — in the score face, at the scores' colour for par,
                 so it reads as the row every result is measured against. */
              className={`num text-[11px] font-semibold py-1 rounded-md ${
                current ? "text-violet-300 bg-violet-950/60" : "text-slate-500"
              }`}
            >
              {h}
            </button>
          );
        })}
        <div className="num text-[11px] font-semibold text-slate-500 text-center py-1">{nineLabel}</div>
        {holes.map((i) => (
          <div key={`p${i}`} className="score text-[17px] text-slate-300 text-center">
            {course.par[i]}
          </div>
        ))}
        <div className="score text-[17px] text-slate-400 text-center">{nineParSum}</div>
      </div>

      {board?.rows.map((r) => {
        const entered = holes.filter((i) => r.perHole[i] !== null && r.perHole[i] !== undefined);
        const nineSum = entered.reduce((a, i) => a + (r.perHole[i] ?? 0), 0);
        return (
          <div key={r.key} className="border-t border-slate-800 mt-3 pt-2.5">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span className={`text-base font-semibold truncate ${r.mine ? "text-violet-300" : ""}`}>
                {r.label}
              </span>
              <span className="shrink-0 flex items-baseline gap-2">
                {r.total && r.total.holes > 0 && (
                  <span
                    className={`num text-[12px] ${
                      r.total.holes === 18 ? "text-slate-200 font-semibold" : "text-slate-500"
                    }`}
                  >
                    {r.total.strokes} strokes{r.total.holes < 18 ? ` · ${r.total.holes} holes` : ""}
                  </span>
                )}
                <span className={`score text-2xl ${r.mine ? "text-violet-300" : ""}`}>{r.headline}</span>
              </span>
            </div>
            <div className="grid grid-cols-[repeat(9,minmax(0,1fr))_2.4rem] gap-x-0.5 items-end">
              {holes.map((i) => (
                <div key={i} className="flex justify-center">
                  <Cell kind={board.kind} value={r.perHole[i] ?? null} par={course.par[i]} strokes={r.strokes?.[i] ?? 0} />
                </div>
              ))}
              {/* The marks carry a 6px stroke-dot lane above a 32px box; the total sits
                  on the same 32px line at the bottom, so it reads level with the digits. */}
              <div
                className={`score text-lg text-center self-end h-8 flex items-center justify-center ${
                  entered.length === 9 ? "text-slate-100" : "text-slate-500"
                }`}
              >
                {entered.length > 0 ? nineSum : "–"}
              </div>
            </div>
            {/* Stableford: the strokes behind the points, in a quiet line beneath — a
                golfer reads "5" before "1 pt", and the Scratch board is a tab away. */}
            {r.gross && (
              <div className="grid grid-cols-[repeat(9,minmax(0,1fr))_2.4rem] gap-x-0.5 mt-0.5 num text-[11px] text-slate-500">
                {holes.map((i) => (
                  <div key={`g${i}`} className="text-center">
                    {r.gross![i] ?? ""}
                  </div>
                ))}
                <div className="text-center">
                  {holes.some((i) => r.gross![i] != null)
                    ? holes.reduce((a, i) => a + (r.gross![i] ?? 0), 0)
                    : ""}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {board?.kind === "gross" && (
        <div className="mt-4">
          <ScoreLegend />
        </div>
      )}
      {board && board.kind !== "gross" && board.rows.some((r) => r.strokes?.some((n) => n > 0)) && (
        <div className="mt-4 flex items-center justify-center gap-1 text-[11px] text-slate-500">
          <span className="w-[3.5px] h-[3.5px] rounded-full bg-violet-400" />
          Stroke received
        </div>
      )}

      {/* Navigation lives at the bottom, in the same slot on every view, each button
          named by where it lands: the current hole on the left (zoom in), the round's
          leaderboard on the right (zoom out). */}
      <div className="mt-4 flex gap-2">
        <button className="btn-ghost basis-1/2 py-3" onClick={onBack}>
          ← Hole {currentHole}
        </button>
        {onShowWholeRound && board && (
          <button className="btn-ghost basis-1/2 py-3" onClick={() => onShowWholeRound(board.id)}>
            Leaderboard →
          </button>
        )}
      </div>
    </div>
  );
}

/** One cell: a score mark for gross, a tinted number for net, a weighted number for points. */
function Cell({ kind, value, par, strokes }: { kind: CellKind; value: number | null; par: number; strokes: number }) {
  if (kind === "gross") return <ScoreMark value={value} par={par} strokes={strokes} size="lg" />;
  if (value === null) {
    return <span className="inline-flex w-8 h-8 items-center justify-center text-slate-700">·</span>;
  }
  // Net cells tint against par like gross marks; points map onto the same scale
  // (3 = birdie-red, 2 = par-white, 1 = bogey-blue, 0 = the deeper blue).
  const tint =
    kind === "net"
      ? value <= 0
        ? "text-gold-300"
        : value - par <= -2
        ? "text-amber-200"
        : value - par === -1
          ? "text-rose-300"
          : value - par === 0
            ? "text-slate-50"
            : value - par === 1
              ? "text-sky-300"
              : "text-blue-400"
      : value >= 4
        ? "text-amber-200"
        : value === 3
          ? "text-rose-300"
          : value === 2
            ? "text-slate-50"
            : value === 1
              ? "text-sky-300"
              : "text-blue-400";
  // The same stroke dots as the gross marks, so a net eagle shows the stroke that
  // made it and a real one doesn't — "eagle or NET eagle" answered at a glance.
  return (
    <span className="inline-flex flex-col items-center">
      <span className="flex h-[6px] items-center gap-[2px]">
        {Array.from({ length: Math.min(strokes, 2) }, (_, i) => (
          <span key={i} className="w-1 h-1 rounded-full bg-violet-400/70" />
        ))}
      </span>
      <span className={`inline-flex w-8 h-8 items-center justify-center score text-[20px] ${tint}`}>
        {value}
      </span>
      {strokes > 0 && <span className="sr-only">{strokes} handicap stroke</span>}
    </span>
  );
}

function buildBoards(
  course: Course,
  subjects: Subject[],
  cards: Record<string, Card | undefined>,
  event: EventDoc,
  flightIds: string[],
  formats: FormatResult[],
): Board[] {
  const flight = new Set(flightIds);
  const isMine = (playerIds: string[]) => subjects.some((s) => s.mine && (s.id.startsWith("team__") ? true : playerIds.includes(s.id)));
  const boards: Board[] = [];

  for (const f of formats) {
    // "Stroke Play NET" keeps its NET — it is the one label where gross vs net is
    // the whole question. Team formats drop the middle: "Better Ball", "Scramble".
    const short = f.spec.label.replace(/^(Better Ball|Scramble) Stroke Play NET$/, "$1").replace(/ SCR$/, "");
    if (f.teams.length > 0) {
      const rows: Row[] = [];
      for (const t of f.teams) {
        const pair = event.pairs.find((p) => p.id === t.pairId);
        if (!pair || !(flight.has(pair.aId) || flight.has(pair.bId))) continue;
        rows.push({
          key: t.pairId,
          label: t.label,
          mine: subjects.some((s) => s.mine && (s.id === `team__${pair.id}` || s.id === pair.aId || s.id === pair.bId)),
          perHole: t.perHole,
          headline: t.thru > 0 ? formatToPar(t.toPar) : "—",
        });
      }
      // Flight order: by the first partner's position in the flight.
      rows.sort((a, b) => firstIndex(a.key, event, flightIds) - firstIndex(b.key, event, flightIds));
      boards.push({ id: f.spec.id, label: short, kind: "net", rows });
    } else {
      const kind: CellKind = f.spec.kind === "stableford" ? "points" : f.spec.net ? "net" : "gross";
      const rows: Row[] = [];
      for (const p of f.players) {
        if (!flight.has(p.playerId)) continue;
        const toPar = p.toPar ?? 0;
        rows.push({
          key: p.playerId,
          label: p.name,
          mine: isMine([p.playerId]),
          perHole: p.perHole,
          strokes: p.strokes,
          gross:
            kind === "points"
              ? course.par.map((_, i) => cards[p.playerId]?.holes?.[String(i + 1)] ?? null)
              : undefined,
          total: grossTotal(cards[p.playerId]),
          // The nine's total (strokes or points) already ends the hole row, so the
          // headline is always to par — on Stableford, points against two a hole.
          headline: p.thru === 0 ? "—" : formatToPar(toPar),
        });
      }
      rows.sort((a, b) => flightIds.indexOf(a.key) - flightIds.indexOf(b.key));
      boards.push({ id: f.spec.id, label: short, kind, rows });
    }
  }

  // Scratch: the raw gross card, unless a gross format already is one.
  if (!boards.some((b) => b.kind === "gross")) {
    const rows: Row[] = subjects.map((s) => {
      const perHole = course.par.map((_, i) => cards[s.id]?.holes?.[String(i + 1)] ?? null);
      let gross = 0;
      let parPlayed = 0;
      course.par.forEach((par, i) => {
        const g = perHole[i];
        if (!g) return;
        gross += g;
        parPlayed += par;
      });
      const thru = perHole.filter((v) => v !== null).length;
      return {
        key: s.id,
        label: s.name,
        mine: Boolean(s.mine),
        perHole,
        strokes: s.strokes,
        headline: thru > 0 ? formatToPar(gross - parPlayed) : "—",
        total: grossTotal(cards[s.id]),
      };
    });
    boards.push({ id: "scratch", label: "Scratch", kind: "gross", rows });
  }
  return boards;
}

/** Gross strokes over the holes entered on a card, and how many holes that is. */
function grossTotal(card: Card | undefined): { strokes: number; holes: number } | undefined {
  if (!card?.holes) return undefined;
  const values = Object.values(card.holes).filter((v): v is number => typeof v === "number" && v > 0);
  return { strokes: values.reduce((a, b) => a + b, 0), holes: values.length };
}

function firstIndex(pairId: string, event: EventDoc, flightIds: string[]): number {
  const pair = event.pairs.find((p) => p.id === pairId);
  if (!pair) return 99;
  const ia = flightIds.indexOf(pair.aId);
  const ib = flightIds.indexOf(pair.bId);
  return Math.min(ia < 0 ? 99 : ia, ib < 0 ? 99 : ib);
}

