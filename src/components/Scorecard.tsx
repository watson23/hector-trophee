import type { Card, Course } from "../types";
import { netScore } from "../lib/formats";
import ScoreMark, { ScoreLegend } from "./ScoreMark";

interface Subject {
  id: string;
  name: string;
  strokes: number[];
}

/**
 * Front/back nine grid. Split into two tables rather than one 18-column scroll —
 * on a phone a wide table is unreadable, and nine columns fit.
 */
export default function Scorecard({
  course,
  subjects,
  cards,
}: {
  course: Course;
  subjects: Subject[];
  cards: Record<string, Card | undefined>;
}) {
  return (
    <div className="space-y-4">
      <Nine course={course} subjects={subjects} cards={cards} from={0} label="Out" />
      <Nine course={course} subjects={subjects} cards={cards} from={9} label="In" />
      <Totals course={course} subjects={subjects} cards={cards} />
      <ScoreLegend />
    </div>
  );
}

function Nine({
  course,
  subjects,
  cards,
  from,
  label,
}: {
  course: Course;
  subjects: Subject[];
  cards: Record<string, Card | undefined>;
  from: number;
  label: string;
}) {
  const holes = Array.from({ length: 9 }, (_, i) => from + i);
  const parSum = holes.reduce((a, i) => a + course.par[i], 0);

  return (
    <div className="card overflow-hidden">
      {/*
        table-fixed with explicit widths: the score marks are a fixed 25px, so the nine
        hole columns have to be guaranteed the room rather than negotiated against a
        long name.
      */}
      <table className="w-full table-fixed num border-collapse">
        <colgroup>
          <col className="w-[4.6rem]" />
          {holes.map((i) => (
            <col key={i} />
          ))}
          <col className="w-[1.9rem]" />
        </colgroup>
        <thead>
          {/* Hole numbers, par and SI are reference: small and quiet, so the scores lead. */}
          <tr className="bg-slate-800 text-slate-400 text-[10px]">
            <th className="text-left font-semibold px-2 py-1 font-sans">Hole</th>
            {holes.map((i) => (
              <th key={i} className="py-1 font-semibold">
                {i + 1}
              </th>
            ))}
            <th className="py-1 font-semibold">{label}</th>
          </tr>
        </thead>
        <tbody>
          <tr className="text-slate-500 text-[10px] border-b border-slate-800">
            <td className="px-2 py-0.5 font-sans">Par</td>
            {holes.map((i) => (
              <td key={i} className="text-center py-0.5">
                {course.par[i]}
              </td>
            ))}
            <td className="text-center py-0.5 font-semibold">{parSum}</td>
          </tr>
          <tr className="text-slate-500/90 text-[10px] border-b border-slate-800">
            <td className="px-2 py-0.5 font-sans">SI</td>
            {holes.map((i) => (
              <td key={i} className="text-center py-0.5">
                {course.si[i]}
              </td>
            ))}
            <td className="py-0.5" />
          </tr>
          {subjects.map((s) => {
            const card = cards[s.id];
            let sum = 0;
            return (
              <tr key={s.id} className="border-b border-slate-800 last:border-0">
                <td className="px-2 py-1 font-sans text-[11px] font-medium text-slate-300 truncate">
                  {s.name}
                </td>
                {holes.map((i) => {
                  const gross = card?.holes?.[String(i + 1)];
                  if (gross) sum += gross;
                  return (
                    <td key={i} className="text-center py-1">
                      <ScoreMark value={gross ?? null} par={course.par[i]} strokes={s.strokes[i]} />
                    </td>
                  );
                })}
                <td className="text-center py-1 text-[13px] font-bold text-slate-100">
                  {sum || "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Totals({
  course,
  subjects,
  cards,
}: {
  course: Course;
  subjects: Subject[];
  cards: Record<string, Card | undefined>;
}) {
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm num">
        <thead>
          <tr className="bg-slate-800 text-slate-400 text-[10px]">
            <th className="text-left px-3 py-1.5 font-sans font-semibold">Total</th>
            <th className="px-2 py-1.5 font-semibold">Thru</th>
            <th className="px-2 py-1.5 font-semibold">Gross</th>
            <th className="px-2 py-1.5 font-semibold">Net</th>
            <th className="px-3 py-1.5 font-semibold">Pts</th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((s) => {
            const card = cards[s.id];
            let gross = 0;
            let net = 0;
            let points = 0;
            let thru = 0;
            course.par.forEach((par, i) => {
              const g = card?.holes?.[String(i + 1)];
              if (!g) return;
              thru += 1;
              gross += g;
              const n = netScore(g, s.strokes[i]);
              net += n;
              points += Math.max(0, 2 + par - n);
            });
            return (
              <tr key={s.id} className="border-t border-slate-800">
                <td className="px-3 py-2 font-sans font-medium text-slate-200 truncate max-w-[8rem]">
                  {s.name}
                </td>
                <td className="text-center px-2 text-slate-400 text-xs">
                  {thru === 18 ? "F" : thru || "—"}
                </td>
                <td className="text-center px-2 font-bold">{gross || "—"}</td>
                <td className="text-center px-2 font-bold text-emerald-400">{net || "—"}</td>
                <td className="text-center px-3 font-bold text-violet-300">{points || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
