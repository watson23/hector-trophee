import type { Card, Course } from "../types";

export interface HoleRow {
  label: string;
  /** One entry per hole; null where nothing has been played. */
  values: (number | null)[];
  /** Colour the numbers against par, the way a scorecard does. */
  colourVsPar?: boolean;
  /** Mark the holes where a handicap stroke was received. */
  strokes?: number[];
  emphasis?: boolean;
}

/**
 * Eighteen holes in two rows of nine, sized to sit inside an expanded leaderboard row.
 *
 * The full Scorecard component is the right thing on the Play tab, where it has the whole
 * width. Here it has about 300px inside a table cell, so this is a tighter variant: no
 * metres, no stroke index, and the front and back nines stacked.
 */
export default function HoleByHole({
  course,
  rows,
  footer,
}: {
  course: Course;
  rows: HoleRow[];
  footer?: string;
}) {
  return (
    <div className="space-y-2">
      {[0, 9].map((from) => (
        <Nine key={from} course={course} rows={rows} from={from} />
      ))}
      {footer && <p className="text-[10px] text-slate-500 leading-relaxed">{footer}</p>}
    </div>
  );
}

function Nine({ course, rows, from }: { course: Course; rows: HoleRow[]; from: number }) {
  const holes = Array.from({ length: 9 }, (_, i) => from + i);
  const parSum = holes.reduce((a, i) => a + course.par[i], 0);

  return (
    <table className="w-full table-fixed text-[10px] num">
      <colgroup>
        {/* Wide enough for a name like "Kristian H" without truncating. */}
        <col className="w-16" />
        {holes.map((i) => (
          <col key={i} />
        ))}
        <col className="w-7" />
      </colgroup>
      <tbody>
        <tr className="text-slate-500">
          <td className="text-left font-sans">{from === 0 ? "Out" : "In"}</td>
          {holes.map((i) => (
            <td key={i} className="text-center">
              {i + 1}
            </td>
          ))}
          <td className="text-center font-semibold">Σ</td>
        </tr>
        <tr className="text-slate-600">
          <td className="text-left font-sans">Par</td>
          {holes.map((i) => (
            <td key={i} className="text-center">
              {course.par[i]}
            </td>
          ))}
          <td className="text-center">{parSum}</td>
        </tr>
        {rows.map((row) => {
          const played = holes.filter((i) => row.values[i] !== null);
          const sum = played.reduce((a, i) => a + (row.values[i] ?? 0), 0);
          return (
            <tr key={row.label} className="border-t border-slate-800/70">
              <td className="text-left font-sans text-slate-400 py-0.5 truncate">{row.label}</td>
              {holes.map((i) => (
                <td key={i} className="text-center py-0.5">
                  <Cell
                    value={row.values[i]}
                    par={course.par[i]}
                    colourVsPar={row.colourVsPar}
                    strokes={row.strokes?.[i] ?? 0}
                  />
                </td>
              ))}
              <td
                className={`text-center py-0.5 font-bold ${row.emphasis ? "text-slate-100" : "text-slate-300"}`}
              >
                {played.length ? sum : "—"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Cell({
  value,
  par,
  colourVsPar,
  strokes,
}: {
  value: number | null;
  par: number;
  colourVsPar?: boolean;
  strokes: number;
}) {
  if (value === null) return <span className="text-slate-700">·</span>;
  const diff = value - par;
  const colour = !colourVsPar
    ? "text-slate-300"
    : diff <= -2
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
      {value}
      {strokes > 0 && (
        <span className="absolute -top-1 -right-1.5 text-[7px] text-violet-400">
          {strokes > 1 ? strokes : "•"}
        </span>
      )}
    </span>
  );
}

/** Gross scores straight off a card, for the rows that show them. */
export function grossRow(card: Card | undefined, label: string, strokes?: number[]): HoleRow {
  return {
    label,
    values: Array.from({ length: 18 }, (_, i) => {
      const v = card?.holes?.[String(i + 1)];
      return typeof v === "number" && v > 0 ? v : null;
    }),
    colourVsPar: true,
    strokes,
  };
}
