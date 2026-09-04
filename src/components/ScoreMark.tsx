/**
 * One hole's score, drawn the way a paper scorecard draws it: the number carries the
 * stroke count, the shape around it carries the result.
 *
 *   ◎ eagle or better   ○ birdie   (bare) par   □ bogey   ⊡ double bogey or worse
 *
 * Shape reads faster than colour on a phone-sized grid, and it's the notation every
 * golfer already knows — which is the point, because a nine-hole row is a lot of numbers
 * to scan. Colour is kept, but only in the ring: the numerals themselves all stay bright
 * so no score is harder to read than any other.
 *
 * Holes where a handicap stroke was received get a violet dot above the mark, clear of
 * the ring rather than tucked into its corner.
 */

export type ScoreSize = "sm" | "md" | "lg";

const GEOM = {
  /** Inside an expanded leaderboard row — about 25px of column to work with. */
  sm: { box: "w-6 h-6", text: "text-[12px]", face: "num font-bold", dot: "w-[3px] h-[3px]", lane: "h-[5px]" },
  /** Round-tab breakdowns, which have the full width of the card. */
  md: { box: "w-[25px] h-[25px]", text: "text-[13px]", face: "num font-bold", dot: "w-[3.5px] h-[3.5px]", lane: "h-[6px]" },
  /** The scorecard showing one nine — nine cells across the card, in the scoreboard
      face so the numbers read from a cart. */
  lg: { box: "w-8 h-8", text: "text-[20px]", face: "score", dot: "w-1 h-1", lane: "h-[6px]" },
} as const;

export interface MarkStyle {
  /** Border colour of the ring, or undefined for par — which is drawn bare. */
  ring?: string;
  radius: string;
  /** Eagles and double bogeys take a second ring outside the first. */
  double?: boolean;
  text: string;
}

export function markStyle(diff: number): MarkStyle {
  if (diff <= -2)
    return { ring: "border-amber-300", radius: "rounded-full", double: true, text: "text-amber-200" };
  if (diff === -1) return { ring: "border-rose-400", radius: "rounded-full", text: "text-rose-200" };
  if (diff === 0) return { radius: "rounded-full", text: "text-slate-50" };
  // Over par goes blue in two steps, as golf TV does: light for a bogey, a deeper blue
  // for double or worse — deep enough to read as "worse", light enough for black. The
  // bogey ring sits quiet since for this field most holes are one over.
  if (diff === 1) return { ring: "border-sky-500/50", radius: "rounded", text: "text-sky-300" };
  return { ring: "border-blue-500/80", radius: "rounded", double: true, text: "text-blue-400" };
}

export default function ScoreMark({
  value,
  par,
  strokes = 0,
  size = "md",
  /** Points and net rows: numbers, no shapes — the shapes mean "against par". */
  plain = false,
  emphasis = false,
}: {
  value: number | null | undefined;
  par: number;
  strokes?: number;
  size?: ScoreSize;
  plain?: boolean;
  emphasis?: boolean;
}) {
  const g = GEOM[size];

  if (value === null || value === undefined) {
    return (
      <span className={`inline-flex ${g.box} items-center justify-center text-slate-700`}>·</span>
    );
  }

  // A hole-in-one is gold whatever the row — the one score that outranks eagle colour.
  const ace = value === 1;
  const style = ace
    ? { ring: "border-gold-400", radius: "rounded-full", double: true, text: "text-gold-300" }
    : plain
      ? null
      : markStyle(value - par);
  const text = style ? style.text : emphasis ? "text-slate-100" : "text-slate-300";

  return (
    <span className="inline-flex flex-col items-center">
      <span className={`flex ${g.lane} items-center gap-[2px]`}>
        {Array.from({ length: Math.min(strokes, 2) }, (_, i) => (
          <span key={i} className={`${g.dot} rounded-full bg-violet-400/70`} />
        ))}
      </span>
      <span className={`relative inline-flex ${g.box} items-center justify-center`}>
        {style?.ring && (
          <>
            <span
              className={`absolute ${style.double ? "inset-[3px]" : "inset-[2px]"} border ${style.radius} ${style.ring}`}
            />
            {style.double && (
              <span className={`absolute inset-0 border ${style.radius} ${style.ring} opacity-60`} />
            )}
          </>
        )}
        <span className={`relative ${g.face} ${g.text} ${text}`}>{value}</span>
      </span>
      {strokes > 0 && <span className="sr-only">{strokes} handicap stroke</span>}
    </span>
  );
}

/** An empty version of a mark, for the legend. */
function Glyph({ diff }: { diff: number }) {
  const style = markStyle(diff);
  return (
    <span className="relative inline-flex w-[18px] h-[18px] items-center justify-center">
      {style.ring ? (
        <>
          <span
            className={`absolute ${style.double ? "inset-[3px]" : "inset-[1px]"} border ${style.radius} ${style.ring}`}
          />
          {style.double && (
            <span className={`absolute inset-0 border ${style.radius} ${style.ring} opacity-60`} />
          )}
        </>
      ) : (
        <span className="w-1 h-1 rounded-full bg-slate-500" />
      )}
    </span>
  );
}

export function ScoreLegend() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
      {[
        { diff: -2, label: "Eagle" },
        { diff: -1, label: "Birdie" },
        { diff: 0, label: "Par" },
        { diff: 1, label: "Bogey" },
        { diff: 2, label: "Double +" },
      ].map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1">
          <Glyph diff={i.diff} />
          {i.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1">
        <span className="w-[3.5px] h-[3.5px] rounded-full bg-violet-400" />
        Stroke received
      </span>
    </div>
  );
}
