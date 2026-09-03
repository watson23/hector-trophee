import type { Card, Course } from "../types";
import ScoreMark from "./ScoreMark";

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
 * metres, no stroke index, and the front and back nines stacked. The score marks
 * themselves are the same ones the Scorecard uses, one size down.
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
      {footer && <p className="text-[11px] text-slate-500 leading-relaxed">{footer}</p>}
    </div>
  );
}

function Nine({ course, rows, from }: { course: Course; rows: HoleRow[]; from: number }) {
  const holes = Array.from({ length: 9 }, (_, i) => from + i);
  const parSum = holes.reduce((a, i) => a + course.par[i], 0);

  return (
    <table className="w-full table-fixed num">
      <colgroup>
        {/* Wide enough for a name like "Kristian H" without truncating. */}
        <col className="w-[3.6rem]" />
        {holes.map((i) => (
          <col key={i} />
        ))}
        <col className="w-7" />
      </colgroup>
      <tbody>
        {/* Hole numbers and par sit under the scores in weight, not over them. */}
        <tr className="text-slate-500 text-[11px]">
          <td className="text-left font-sans">{from === 0 ? "Out" : "In"}</td>
          {holes.map((i) => (
            <td key={i} className="text-center">
              {i + 1}
            </td>
          ))}
          <td className="text-center font-semibold">Σ</td>
        </tr>
        <tr className="text-slate-500/90 text-[11px]">
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
              <td className="text-left font-sans text-[12px] text-slate-400 py-0.5 truncate">
                {row.label}
              </td>
              {holes.map((i) => (
                <td key={i} className="text-center py-0.5">
                  <ScoreMark
                    size="sm"
                    value={row.values[i]}
                    par={course.par[i]}
                    plain={!row.colourVsPar}
                    emphasis={row.emphasis}
                    strokes={row.strokes?.[i] ?? 0}
                  />
                </td>
              ))}
              <td
                className={`text-center py-0.5 text-[13px] font-bold ${row.emphasis ? "text-slate-100" : "text-slate-300"}`}
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
