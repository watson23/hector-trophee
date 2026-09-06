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

/** The second, quieter line under a card's gross marks: what the main game counted. */
interface SubLine {
  /** "net" or "pts" — the caption at the row's end. */
  label: "net" | "pts";
  values: (number | null)[];
}

interface Row {
  key: string;
  label: string;
  mine: boolean;
  /** Gross strokes per hole — the big coloured marks a golfer reads first. */
  gross: (number | null)[];
  /** Handicap strokes per hole, for the dots above the marks. */
  strokes?: number[];
  /** The main game's figure per hole, small and monochrome beneath the marks. */
  sub?: SubLine;
  /** Gross to par over the holes played — the headline. */
  headline: string;
  /** Beneath the headline: "85 strokes · net −1", "43 strokes · 9 holes · 22 pts". */
  subline: string;
}

/** A pair's counted score per hole on a Better Ball day — a second board, not a second card. */
interface PairRow {
  key: string;
  label: string;
  mine: boolean;
  perHole: (number | null)[];
  headline: string;
}

interface Boards {
  players: Row[];
  /** Present only on a Better Ball day: the pairs' counted net per hole. */
  pairs?: { id: string; label: string; rows: PairRow[] };
  /** The Round-tab board the players card zooms out to. */
  playersBoardId: string;
}

/**
 * The scorecard, one nine at a time — one card per player, the way GameBook taught
 * everyone to read one: the gross score big and coloured against par, with the stroke
 * dot above where a handicap stroke was received, and beneath it, small and plain, what
 * the round's main game made of the hole (net strokes, or Stableford points). The Round
 * tab still has a board per format; the card is where you read your own round.
 *
 * On a Better Ball day a second board shows the pairs' counted score per hole. A scramble
 * is scored on one card per pair, so its players card already is the team card.
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
  /** Id of the round's main format — its figure is the one beneath the marks. */
  mainId: string | undefined;
  currentHole: number;
  onPickHole: (hole: number) => void;
  /** Back to the course view — named by where it lands, the current hole. */
  onBack: () => void;
  /** Zoom out to the Round tab on this board — the third step of hole → group → field. */
  onShowWholeRound?: (boardId: string) => void;
}) {
  const boards = buildBoards(course, subjects, cards, event, flightIds, formats, mainId);
  const [view, setView] = useState<"players" | "pairs">("players");
  const showPairs = view === "pairs" && boards.pairs;
  const [nine, setNine] = useState<"out" | "in">(currentHole > 9 ? "in" : "out");
  const from = nine === "in" ? 9 : 0;
  const holes = Array.from({ length: 9 }, (_, i) => from + i);
  const nineLabel = nine === "in" ? "In" : "Out";
  const nineParSum = holes.reduce((a, i) => a + course.par[i], 0);
  const grid = "grid grid-cols-[repeat(9,minmax(0,1fr))_2.4rem] gap-x-0.5";

  return (
    <div>
      {boards.pairs && (
        <div className="flex gap-1.5 flex-wrap mb-3">
          {(["players", "pairs"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`pill font-semibold ${
                view === v ? "bg-violet-600 text-white" : "border border-slate-700 bg-slate-900 text-slate-400"
              }`}
            >
              {v === "players" ? "Cards" : boards.pairs!.label}
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
                nine === n ? "bg-slate-700 text-slate-100" : "border border-slate-700 bg-slate-900 text-slate-400"
              }`}
            >
              {n === "out" ? "Out · 1–9" : "In · 10–18"}
            </button>
          ))}
        </div>
        <div className="text-[12px] text-slate-500 num">Par {nineParSum}</div>
      </div>

      <div className={`${grid} items-end`}>
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

      {!showPairs &&
        boards.players.map((r) => {
          const entered = holes.filter((i) => r.gross[i] !== null);
          const nineGross = entered.reduce((a, i) => a + (r.gross[i] ?? 0), 0);
          const subEntered = r.sub ? holes.filter((i) => r.sub!.values[i] !== null && r.sub!.values[i] !== undefined) : [];
          const nineSub = subEntered.reduce((a, i) => a + (r.sub!.values[i] ?? 0), 0);
          return (
            <div key={r.key} className="border-t border-slate-800 mt-3 pt-2.5">
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className={`text-base font-semibold truncate ${r.mine ? "text-violet-300" : ""}`}>
                  {r.label}
                </span>
                <span className="shrink-0 text-right">
                  <span className={`score text-2xl block leading-none ${r.mine ? "text-violet-300" : ""}`}>
                    {r.headline}
                  </span>
                  {r.subline && <span className="num text-[12px] text-slate-400 block mt-0.5">{r.subline}</span>}
                </span>
              </div>
              <div className={`${grid} items-end`}>
                {holes.map((i) => (
                  <div key={i} className="flex justify-center">
                    <ScoreMark value={r.gross[i]} par={course.par[i]} strokes={r.strokes?.[i] ?? 0} size="lg" />
                  </div>
                ))}
                {/* The marks carry a 6px stroke-dot lane above a 32px box; the total sits
                    on the same 32px line at the bottom, so it reads level with the digits. */}
                <div
                  className={`score text-lg text-center self-end h-8 flex items-center justify-center ${
                    entered.length === 9 ? "text-slate-100" : "text-slate-500"
                  }`}
                >
                  {entered.length > 0 ? nineGross : "–"}
                </div>
              </div>
              {r.sub && (
                /* What the main game made of each hole — net strokes or points — small
                   and plain, the colour having done its work on the gross marks above. */
                <div className={`${grid} mt-0.5 num text-[12px] text-slate-400`}>
                  {holes.map((i) => (
                    <div key={`s${i}`} className="text-center">
                      {r.sub!.values[i] ?? ""}
                    </div>
                  ))}
                  <div className="text-center text-slate-500">
                    {subEntered.length > 0 ? `${nineSub} ${r.sub.label}` : r.sub.label}
                  </div>
                </div>
              )}
            </div>
          );
        })}

      {showPairs &&
        boards.pairs!.rows.map((r) => {
          const entered = holes.filter((i) => r.perHole[i] !== null && r.perHole[i] !== undefined);
          const nineSum = entered.reduce((a, i) => a + (r.perHole[i] ?? 0), 0);
          return (
            <div key={r.key} className="border-t border-slate-800 mt-3 pt-2.5">
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <span className={`text-base font-semibold truncate ${r.mine ? "text-violet-300" : ""}`}>
                  {r.label}
                </span>
                <span className={`score text-2xl shrink-0 ${r.mine ? "text-violet-300" : ""}`}>{r.headline}</span>
              </div>
              <div className={`${grid} items-end`}>
                {holes.map((i) => (
                  <div key={i} className="flex justify-center">
                    <NetCell value={r.perHole[i] ?? null} par={course.par[i]} />
                  </div>
                ))}
                <div
                  className={`score text-lg text-center self-end h-8 flex items-center justify-center ${
                    entered.length === 9 ? "text-slate-100" : "text-slate-500"
                  }`}
                >
                  {entered.length > 0 ? nineSum : "–"}
                </div>
              </div>
            </div>
          );
        })}

      <div className="mt-4">
        <ScoreLegend />
      </div>

      {/* Navigation lives at the bottom, in the same slot on every view, each button
          named by where it lands: the current hole on the left (zoom in), the round's
          leaderboard on the right (zoom out). */}
      <div className="mt-4 flex gap-2">
        <button className="btn-ghost basis-1/2 py-3" onClick={onBack}>
          ← Hole {currentHole}
        </button>
        {onShowWholeRound && (
          <button
            className="btn-ghost basis-1/2 py-3"
            onClick={() => onShowWholeRound(showPairs ? boards.pairs!.id : boards.playersBoardId)}
          >
            Leaderboard →
          </button>
        )}
      </div>
    </div>
  );
}

/** A pair's counted net on a hole: a number tinted against par, the same steps as the marks. */
function NetCell({ value, par }: { value: number | null; par: number }) {
  if (value === null) {
    return <span className="inline-flex w-8 h-8 items-center justify-center text-slate-700">·</span>;
  }
  const tint =
    value <= 0
      ? "text-gold-300"
      : value - par <= -2
        ? "text-amber-200"
        : value - par === -1
          ? "text-rose-300"
          : value - par === 0
            ? "text-slate-50"
            : value - par === 1
              ? "text-sky-300"
              : "text-blue-400";
  return <span className={`inline-flex w-8 h-8 items-center justify-center score text-[20px] ${tint}`}>{value}</span>;
}

function buildBoards(
  course: Course,
  subjects: Subject[],
  cards: Record<string, Card | undefined>,
  event: EventDoc,
  flightIds: string[],
  formats: FormatResult[],
  mainId: string | undefined,
): Boards {
  const flight = new Set(flightIds);

  // The main game's individual figure: the main format if it is played per player,
  // else the first per-player net or Stableford format on the round.
  const individual = formats.filter((f) => f.teams.length === 0 || f.spec.teamCard);
  const mainFormat =
    individual.find((f) => f.spec.id === mainId && (f.spec.net || f.spec.kind === "stableford")) ??
    individual.find((f) => f.spec.net || f.spec.kind === "stableford");

  const players: Row[] = subjects.map((s) => {
    const gross = course.par.map((_, i) => cards[s.id]?.holes?.[String(i + 1)] ?? null);
    let strokesTotal = 0;
    let parPlayed = 0;
    course.par.forEach((par, i) => {
      const g = gross[i];
      if (!g) return;
      strokesTotal += g;
      parPlayed += par;
    });
    const thru = gross.filter((v) => v !== null).length;

    let sub: SubLine | undefined;
    let subFigure: string | null = null;
    if (mainFormat) {
      if (s.id.startsWith("team__")) {
        const t = mainFormat.teams.find((x) => `team__${x.pairId}` === s.id);
        if (t) {
          sub = { label: "net", values: t.perHole };
          subFigure = t.thru > 0 ? `net ${formatToPar(t.toPar)}` : null;
        }
      } else {
        const p = mainFormat.players.find((x) => x.playerId === s.id);
        if (p) {
          const pts = mainFormat.spec.kind === "stableford";
          sub = { label: pts ? "pts" : "net", values: p.perHole };
          subFigure = p.thru > 0 ? (pts ? `${p.value} pts` : `net ${formatToPar(p.toPar ?? 0)}`) : null;
        }
      }
    }
    const strokesText = thru > 0 ? `${strokesTotal} strokes${thru < 18 ? ` · ${thru} holes` : ""}` : "";
    return {
      key: s.id,
      label: s.name,
      mine: Boolean(s.mine),
      gross,
      strokes: s.strokes,
      sub,
      headline: thru > 0 ? formatToPar(strokesTotal - parPlayed) : "—",
      subline: [strokesText, subFigure].filter(Boolean).join(" · "),
    };
  });

  // Better Ball: the pairs' counted net per hole. (A scramble's team card is the players
  // card itself, so it gets no second board.)
  const bb = formats.find((f) => f.teams.length > 0 && !f.spec.teamCard);
  let pairs: Boards["pairs"];
  if (bb) {
    const rows: PairRow[] = [];
    for (const t of bb.teams) {
      const pair = event.pairs.find((p) => p.id === t.pairId);
      if (!pair || !(flight.has(pair.aId) || flight.has(pair.bId))) continue;
      rows.push({
        key: t.pairId,
        label: t.label,
        mine: subjects.some((s) => s.mine && (s.id === pair.aId || s.id === pair.bId)),
        perHole: t.perHole,
        headline: t.thru > 0 ? formatToPar(t.toPar) : "—",
      });
    }
    rows.sort((a, b) => firstIndex(a.key, event, flightIds) - firstIndex(b.key, event, flightIds));
    pairs = { id: bb.spec.id, label: bb.spec.label.replace(/ Stroke Play NET$/, ""), rows };
  }

  return { players, pairs, playersBoardId: mainFormat?.spec.id ?? "scratch" };
}

function firstIndex(pairId: string, event: EventDoc, flightIds: string[]): number {
  const pair = event.pairs.find((p) => p.id === pairId);
  if (!pair) return 99;
  const ia = flightIds.indexOf(pair.aId);
  const ib = flightIds.indexOf(pair.bId);
  return Math.min(ia < 0 ? 99 : ia, ib < 0 ? 99 : ib);
}
