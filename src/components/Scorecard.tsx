import { useState } from "react";
import type { Card, Course, FormatKind } from "../types";
import { netScore, stablefordPoints } from "../lib/formats";
import { formatToPar } from "../lib/leaderboard";
import ScoreMark, { ScoreLegend } from "./ScoreMark";

/** A card being shown: one per player, or one per pair in a scramble. */
interface Subject {
  id: string;
  name: string;
  strokes: number[];
  mine?: boolean;
}

/**
 * The scorecard, one nine at a time. Nine columns give every cell room for a real
 * mark and a real number; the other nine is one tap away. Each card is a block: the
 * name and the round's running headline figure on top, the nine cells and the nine's
 * total beneath — one table, no separate summary to cross-reference. Tapping a hole
 * number opens the entry sheet on that hole.
 */
export default function Scorecard({
  course,
  subjects,
  cards,
  mainKind,
  currentHole,
  onPickHole,
}: {
  course: Course;
  subjects: Subject[];
  cards: Record<string, Card | undefined>;
  /** The round's main format — decides which figure leads the headline. */
  mainKind: FormatKind;
  currentHole: number;
  onPickHole: (hole: number) => void;
}) {
  const [nine, setNine] = useState<"out" | "in">(currentHole > 9 ? "in" : "out");
  const from = nine === "in" ? 9 : 0;
  const holes = Array.from({ length: 9 }, (_, i) => from + i);
  const nineLabel = nine === "in" ? "In" : "Out";
  const nineParSum = holes.reduce((a, i) => a + course.par[i], 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-1.5">
          {(["out", "in"] as const).map((n) => (
            <button
              key={n}
              onClick={() => setNine(n)}
              className={`pill font-semibold ${
                nine === n
                  ? "bg-violet-600 text-white"
                  : "border border-slate-700 bg-slate-900 text-slate-400"
              }`}
            >
              {n === "out" ? "Out · 1–9" : "In · 10–18"}
            </button>
          ))}
        </div>
        <div className="text-[12px] text-slate-500 num">Par {nineParSum}</div>
      </div>

      {/* Header: hole numbers (tap to score that hole) and par. Same grid as the
          cells below so everything lines up without a table. */}
      <div className="grid grid-cols-[repeat(9,minmax(0,1fr))_2.4rem] gap-x-0.5 items-end">
        {holes.map((i) => {
          const h = i + 1;
          const current = h === currentHole;
          return (
            <button
              key={h}
              onClick={() => onPickHole(h)}
              aria-label={`Score hole ${h}`}
              className={`num text-[13px] font-semibold py-1 rounded-md ${
                current ? "text-violet-300 bg-violet-950/60" : "text-slate-300"
              }`}
            >
              {h}
            </button>
          );
        })}
        <div className="num text-[12px] font-semibold text-slate-400 text-center py-1">{nineLabel}</div>
        {holes.map((i) => (
          <div key={`p${i}`} className="num text-[11px] text-slate-500 text-center">
            {course.par[i]}
          </div>
        ))}
        <div className="num text-[11px] text-slate-500 text-center">{nineParSum}</div>
      </div>

      {subjects.map((s) => {
        const sum = summary(course, s, cards[s.id]);
        const head = headline(mainKind, sum);
        const nineGross = holes.reduce((a, i) => a + (cards[s.id]?.holes?.[String(i + 1)] ?? 0), 0);
        const nineEntered = holes.filter((i) => cards[s.id]?.holes?.[String(i + 1)]).length;
        return (
          <div key={s.id} className="border-t border-slate-800 mt-3 pt-2.5">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span className={`text-base font-semibold truncate ${s.mine ? "text-violet-300" : ""}`}>
                {s.name}
              </span>
              <span className="shrink-0 flex items-baseline gap-2">
                <span className={`score text-2xl ${s.mine ? "text-violet-300" : ""}`}>{head.primary}</span>
                {head.secondary && <span className="text-[12px] text-slate-500 num">{head.secondary}</span>}
              </span>
            </div>
            <div className="grid grid-cols-[repeat(9,minmax(0,1fr))_2.4rem] gap-x-0.5 items-end">
              {holes.map((i) => (
                <div key={i} className="flex justify-center">
                  <ScoreMark
                    value={cards[s.id]?.holes?.[String(i + 1)] ?? null}
                    par={course.par[i]}
                    strokes={s.strokes[i]}
                    size="lg"
                  />
                </div>
              ))}
              <div
                className={`score text-lg text-center self-center ${
                  nineEntered === 9 ? "text-slate-100" : "text-slate-500"
                }`}
              >
                {nineEntered > 0 ? nineGross : "–"}
              </div>
            </div>
          </div>
        );
      })}

      <div className="mt-4">
        <ScoreLegend />
      </div>
    </div>
  );
}

interface Summary {
  thru: number;
  gross: number;
  grossToPar: number;
  netToPar: number;
  pts: number;
}

/** The whole round so far for one card — the headline is about the round, not the nine. */
function summary(course: Course, s: Subject, card: Card | undefined): Summary {
  let thru = 0;
  let gross = 0;
  let net = 0;
  let pts = 0;
  let parPlayed = 0;
  course.par.forEach((par, i) => {
    const g = card?.holes?.[String(i + 1)];
    if (!g) return;
    thru += 1;
    gross += g;
    parPlayed += par;
    const n = netScore(g, s.strokes[i]);
    net += n;
    pts += stablefordPoints(par, n);
  });
  return { thru, gross, grossToPar: gross - parPlayed, netToPar: net - parPlayed, pts };
}

/**
 * Display = how the score is spoken for the round's main format: Stableford leads with
 * points, stroke formats with to-par, a scramble with its net to-par.
 */
function headline(kind: FormatKind, sum: Summary): { primary: string; secondary?: string } {
  if (sum.thru === 0) return { primary: "—" };
  if (kind === "stableford") {
    return { primary: `${sum.pts} pts`, secondary: formatToPar(sum.grossToPar) };
  }
  if (kind === "scramble") {
    return { primary: `${formatToPar(sum.netToPar)} net`, secondary: `${sum.gross} gross` };
  }
  return { primary: `${formatToPar(sum.grossToPar)} (${sum.gross})`, secondary: `${sum.pts} pts` };
}
