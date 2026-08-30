import type { Card, Course } from "../types";
import { holeMetres } from "../data/courses";
import { netScore } from "../lib/formats";

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
  courseId,
  tee,
  subjects,
  cards,
}: {
  course: Course;
  courseId: string;
  tee: string;
  subjects: Subject[];
  cards: Record<string, Card | undefined>;
}) {
  return (
    <div className="space-y-4">
      <Nine
        course={course}
        courseId={courseId}
        tee={tee}
        subjects={subjects}
        cards={cards}
        from={0}
        label="Out"
      />
      <Nine
        course={course}
        courseId={courseId}
        tee={tee}
        subjects={subjects}
        cards={cards}
        from={9}
        label="In"
      />
      <Totals course={course} subjects={subjects} cards={cards} />
    </div>
  );
}

function Nine({
  course,
  courseId,
  tee,
  subjects,
  cards,
  from,
  label,
}: {
  course: Course;
  courseId: string;
  tee: string;
  subjects: Subject[];
  cards: Record<string, Card | undefined>;
  from: number;
  label: string;
}) {
  const holes = Array.from({ length: 9 }, (_, i) => from + i);
  const metres = holeMetres[courseId]?.[tee];
  const parSum = holes.reduce((a, i) => a + course.par[i], 0);

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-[11px] num border-collapse">
        <thead>
          <tr className="bg-slate-800 text-slate-400">
            <th className="text-left font-semibold px-2 py-1.5 font-sans">Hole</th>
            {holes.map((i) => (
              <th key={i} className="py-1.5 font-semibold w-[9%]">
                {i + 1}
              </th>
            ))}
            <th className="py-1.5 font-semibold px-2">{label}</th>
          </tr>
        </thead>
        <tbody>
          <tr className="text-slate-500 border-b border-slate-800">
            <td className="px-2 py-1 font-sans">Par</td>
            {holes.map((i) => (
              <td key={i} className="text-center py-1">
                {course.par[i]}
              </td>
            ))}
            <td className="text-center py-1 px-2 font-semibold text-slate-400">{parSum}</td>
          </tr>
          <tr className="text-slate-600 border-b border-slate-800">
            <td className="px-2 py-1 font-sans">SI</td>
            {holes.map((i) => (
              <td key={i} className="text-center py-1">
                {course.si[i]}
              </td>
            ))}
            <td className="py-1 px-2 text-center">
              {metres ? `${holes.reduce((a, i) => a + metres[i], 0)}m` : "—"}
            </td>
          </tr>
          {subjects.map((s) => {
            const card = cards[s.id];
            let sum = 0;
            return (
              <tr key={s.id} className="border-b border-slate-800 last:border-0">
                <td className="px-2 py-1.5 font-sans font-medium text-slate-200 truncate max-w-[5.5rem]">
                  {s.name}
                </td>
                {holes.map((i) => {
                  const gross = card?.holes?.[String(i + 1)];
                  if (gross) sum += gross;
                  return (
                    <td key={i} className="text-center py-1.5">
                      <ScoreCell
                        gross={gross}
                        par={course.par[i]}
                        strokes={s.strokes[i]}
                      />
                    </td>
                  );
                })}
                <td className="text-center py-1.5 px-2 font-bold">{sum || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Gross score, coloured against par, with a dot for each handicap stroke received. */
function ScoreCell({
  gross,
  par,
  strokes,
}: {
  gross: number | undefined;
  par: number;
  strokes: number;
}) {
  if (!gross) {
    return <span className="text-slate-700">·</span>;
  }
  const diff = gross - par;
  const colour =
    diff <= -2
      ? "text-amber-300 font-bold"
      : diff === -1
        ? "text-rose-400 font-bold"
        : diff === 0
          ? "text-emerald-400"
          : diff === 1
            ? "text-sky-400"
            : "text-sky-600";
  return (
    <span className={`relative inline-block ${colour}`}>
      {gross}
      {strokes > 0 && (
        <span
          className="absolute -top-0.5 -right-1.5 text-[7px] text-violet-400"
          aria-label={`${strokes} handicap stroke`}
        >
          {strokes > 1 ? strokes : "•"}
        </span>
      )}
    </span>
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
      <table className="w-full text-xs num">
        <thead>
          <tr className="bg-slate-800 text-slate-400 text-[11px]">
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
                <td className="text-center px-2 text-slate-400">{thru === 18 ? "F" : thru || "—"}</td>
                <td className="text-center px-2 font-semibold">{gross || "—"}</td>
                <td className="text-center px-2 font-semibold text-emerald-400">{net || "—"}</td>
                <td className="text-center px-3 font-bold text-violet-300">{points || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
