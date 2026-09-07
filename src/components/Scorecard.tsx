import { useState } from "react";
import type { Card, Course, EventDoc, FormatSpec } from "../types";
import type { FormatResult } from "../lib/engine";
import { formatToPar } from "../lib/leaderboard";
import ScoreMark, { type ScoreSize } from "./ScoreMark";

/** A card being shown: one per player, or one per pair in a scramble. */
interface Subject {
  id: string;
  name: string;
  strokes: number[];
  mine?: boolean;
}

/** One hole on one card, under the selected format. */
interface Cell {
  gross: number | null;
  strokes: number;
  /** What the selected format made of the hole: net strokes or points. Null on a gross tab. */
  sub: number | null;
  /** Better Ball: this ball counted for the pair on this hole (ties count both). */
  counted: boolean;
}

/** One card's two rows — the gross marks and the figure beneath them. */
interface Line {
  id: string;
  name: string;
  /** First name, for a pair label when the engine has not built one yet. */
  first: string;
  mine: boolean;
  cells: Cell[];
  headline: string;
  caption: string;
  /** A small companion after the headline — Stableford's points beside the to-par. */
  aside?: string;
  /** Stableford points over the holes played, for a pair block's combined figure. */
  points?: number;
  /** Scramble: whose drive on each hole, as an initial; and the penalty the marks add up to. */
  drives?: (string | null)[];
  penalty?: number;
}

/** A section of the card: a pair with its two players, or a single card. */
interface Block {
  key: string;
  label: string;
  mine: boolean;
  headline: string;
  caption: string;
  unit: string;
  lines: Line[];
  /** Better Ball tab only: the pair's counted net per hole, as its own row. */
  pairRow?: (number | null)[];
}

/** How the selected format is read: points, net strokes, or gross. */
type Figure = "pts" | "net" | "gross";

/** The three densities the design set: pair blocks, single cards, scramble team cards. */
type Variant = "pair" | "card" | "team";

const METRICS: Record<
  Variant,
  { block: string; head: string; headline: string; mark: ScoreSize; grossPad: string; total: string; sub: string; subPad: string }
> = {
  // Handoff 3a: a four-ball's whole card fits one 390×844 screen, so every gap is measured.
  pair: {
    block: "mt-1.5 pt-1",
    head: "h-[22px] mt-0.5",
    headline: "text-[22px]",
    mark: "pair",
    grossPad: "pb-2",
    total: "h-7 text-[17px]",
    sub: "text-[12px]",
    subPad: "pb-[3px]",
  },
  card: {
    block: "mt-2 pt-[5px]",
    head: "h-[26px]",
    headline: "text-2xl",
    mark: "card",
    grossPad: "pb-[9px]",
    total: "h-[30px] text-lg",
    sub: "text-[12px]",
    subPad: "pb-1",
  },
  team: {
    block: "mt-3.5 pt-2",
    head: "h-7",
    headline: "text-[26px]",
    mark: "lg",
    grossPad: "pb-2.5",
    total: "h-8 text-lg",
    sub: "text-[13px]",
    subPad: "pt-1 pb-1.5",
  },
};

/** Name column, nine holes, the nine's total — the one grid every row sits on. */
const GRID =
  "grid grid-cols-[44px_repeat(9,minmax(0,1fr))_32px] min-[390px]:grid-cols-[50px_repeat(9,minmax(0,1fr))_34px] gap-x-0.5";

/**
 * The scorecard, one nine at a time, laid out the way the Claude Design handoff of
 * 6.9.2026 settled it (layouts 1c / 2a / 2b): one shared Hole · HCP · Par header (HCP is what this group calls the hole's stroke index), then a
 * block per pair on a Better Ball day — the two players' gross marks with the counted
 * ball as a row beneath — or a block per card on any other day, where the name column
 * turns into the row labels "gross" and "net" (or "pts") so the two figures are never
 * confused. The tabs are the round's formats; the headline figure follows the selected
 * one (net to par, points, or gross to par) with the gross total in the caption.
 *
 * The gross score is always the big coloured mark against par with the stroke dot above
 * where a handicap stroke was received — the notation everyone learnt from GameBook.
 * Tapping a hole number opens the entry sheet on that hole.
 */
export default function Scorecard({
  course,
  subjects,
  cards,
  event,
  flightIds,
  specs,
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
  /** The round's formats, in programme order — the tabs, present before any score is in. */
  specs: FormatSpec[];
  /** The round's computed formats (may be empty before any scores). */
  formats: FormatResult[];
  /** Id of the round's main format — the tab the card opens on. */
  mainId: string | undefined;
  currentHole: number;
  onPickHole: (hole: number) => void;
  /** Back to the course view — named by where it lands, the current hole. */
  onBack: () => void;
  /** Zoom out to the Round tab on this board — the third step of hole → group → field. */
  onShowWholeRound?: (boardId: string) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const selected = specs.find((s) => s.id === picked) ?? specs.find((s) => s.id === mainId) ?? specs[0];
  const [nine, setNine] = useState<"out" | "in">(currentHole > 9 ? "in" : "out");
  const from = nine === "in" ? 9 : 0;
  const holes = Array.from({ length: 9 }, (_, i) => from + i);
  const nineLabel = nine === "in" ? "In" : "Out";
  const nineParSum = holes.reduce((a, i) => a + course.par[i], 0);

  const scramble = subjects.some((s) => s.id.startsWith("team__"));
  const figure: Figure = !selected ? "gross" : selected.kind === "stableford" ? "pts" : selected.net ? "net" : "gross";
  const { blocks, grouped, unit } = buildBlocks(course, subjects, cards, event, flightIds, specs, formats, selected, figure);
  const variant: Variant = scramble ? "team" : grouped ? "pair" : "card";
  const m = METRICS[variant];
  const subLabel = figure === "pts" ? "pts" : figure === "net" ? "net" : null;
  const bbTab = selected?.kind === "betterball";

  return (
    <div>
      {/* Format tabs on the left — one per format on the round, so a single format is a
          label — and the nine on the right: the two controls that change what the grid says.
          The nine's buttons carry the hole ranges, the plain reading; the golf words Out
          and In stand in the header's last column, over that nine's totals. */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex gap-1.5 flex-wrap min-w-0">
          {specs.map((s) => {
            const on = s.id === selected?.id;
            return (
              <button
                key={s.id}
                onClick={() => setPicked(s.id)}
                className={`rounded-full px-2.5 py-1 text-[13px] font-semibold leading-[1.4] whitespace-nowrap border ${
                  on ? "bg-violet-600 border-violet-600 text-white" : "bg-slate-900 border-slate-700 text-slate-400"
                }`}
              >
                {tabLabel(s)}
              </button>
            );
          })}
        </div>
        <div className="flex gap-0.5 bg-slate-900 border border-slate-800 rounded-full p-0.5 shrink-0">
          {(["out", "in"] as const).map((n) => (
            <button
              key={n}
              onClick={() => setNine(n)}
              className={`rounded-full px-2.5 py-[3px] num text-[12px] font-semibold ${
                nine === n ? "bg-slate-700 text-slate-100" : "text-slate-500"
              }`}
            >
              {n === "out" ? "1–9" : "10–18"}
            </button>
          ))}
        </div>
      </div>

      {/* The shared header: hole numbers (tappable), stroke index, par. */}
      {/* Rows centre on their content: a bottom alignment sat the small labels a notch
          below the numbers they name. */}
      <div className={`${GRID} gap-y-0.5 items-center`}>
        <div className="num text-[11px] font-semibold text-slate-500 tracking-[.06em] leading-none">HOLE</div>
        {holes.map((i) => {
          const h = i + 1;
          const current = h === currentHole;
          return (
            <button
              key={h}
              onClick={() => onPickHole(h)}
              aria-label={`Score hole ${h}`}
              className={`num text-[12px] font-semibold leading-none py-1 rounded-md ${
                current ? "text-violet-300 bg-violet-950/80" : "text-slate-500"
              }`}
            >
              {h}
            </button>
          );
        })}
        <div className="num text-[11px] font-semibold text-slate-500 text-center leading-none">{nineLabel}</div>

        <div className="num text-[11px] font-semibold text-slate-600 tracking-[.06em] leading-none">HCP</div>
        {holes.map((i) => (
          <div key={`si${i}`} className="num text-[11px] text-slate-600 text-center leading-none">
            {course.si[i]}
          </div>
        ))}
        <div />

        <div className="num text-[11px] font-semibold text-slate-500 tracking-[.06em] leading-none">PAR</div>
        {holes.map((i) => (
          <div key={`p${i}`} className="score text-[17px] leading-[1.1] text-slate-300 text-center">
            {course.par[i]}
          </div>
        ))}
        <div className="score text-[17px] leading-[1.1] text-slate-400 text-center">{nineParSum}</div>
      </div>

      {blocks.map((b) => {
        const pairBlock = b.lines.length > 1;
        return (
          <div key={b.key} className={`border-t border-slate-700 ${m.block}`}>
            {pairBlock && (
              /* The pair's line: a small mono label, since the players' names are the
                 ones read, and the pair's figure — counted net to par, or both cards' points. */
              <div className="flex items-baseline justify-between gap-2 h-6">
                <span className={`num text-[12px] font-semibold tracking-wider truncate ${b.mine ? "text-violet-300" : "text-slate-100"}`}>
                  {b.label}
                </span>
                <Figure caption={b.caption} headline={b.headline} unit={b.unit} mine={b.mine} size="text-[22px]" />
              </div>
            )}

            {b.lines.map((line) => {
              const entered = holes.filter((i) => line.cells[i].gross !== null);
              const nineGross = entered.reduce((a, i) => a + (line.cells[i].gross ?? 0), 0);
              const subEntered = holes.filter((i) => line.cells[i].sub !== null);
              const nineSub = subEntered.reduce((a, i) => a + (line.cells[i].sub ?? 0), 0);
              return (
                <div key={line.id}>
                  {/* The name line: whole-round totals — gross (to par) in the caption, the
                      selected format's figure as the headline. */}
                  <div className={`flex items-baseline justify-between gap-2 ${m.head}`}>
                    <span
                      className={`${variant === "team" ? "text-base" : "text-[15px]"} font-semibold leading-none truncate ${
                        line.mine ? "text-violet-300" : "text-slate-100"
                      }`}
                    >
                      {line.name}
                    </span>
                    <Figure
                      caption={line.penalty ? `${line.caption} · +${line.penalty} pen` : line.caption}
                      headline={line.headline}
                      aside={line.aside}
                      unit={unit}
                      mine={line.mine}
                      size={m.headline}
                    />
                  </div>

                  <div className={`${GRID} items-end`}>
                    {/* Row 1: the marks and the nine's strokes. Labelled "gross" where a net
                        or points row follows; "strokes" on a scratch tab, where it is the
                        only row and everyone knows scratch is gross. */}
                    <div className={`self-end num text-[11px] leading-none text-slate-600 ${m.grossPad}`}>
                      {figure === "gross" ? "strokes" : "gross"}
                    </div>
                    {holes.map((i) => (
                      <div key={i} className="flex justify-center">
                        <ScoreMark
                          value={line.cells[i].gross}
                          par={course.par[i]}
                          strokes={line.cells[i].strokes}
                          size={m.mark}
                        />
                      </div>
                    ))}
                    <div
                      className={`score text-center flex items-center justify-center ${m.total} ${
                        entered.length === 9 ? "text-slate-100" : "text-slate-500"
                      }`}
                    >
                      {entered.length > 0 ? nineGross : "–"}
                    </div>

                    {/* Scramble: whose drive, by initial, under the marks. */}
                    {line.drives && (
                      <>
                        <div className="num text-[11px] leading-tight text-slate-600 pb-1">tee</div>
                        {holes.map((i) => (
                          <div key={`d${i}`} className="num text-center text-[12px] leading-tight text-slate-300 pb-1">
                            {line.drives?.[i] ?? ""}
                          </div>
                        ))}
                        <div />
                      </>
                    )}

                    {/* Row 2: what the selected format made of each hole. On a Better Ball
                        tab the counted ball is bright and bold, the other one quiet. */}
                    {subLabel && (
                      <>
                        <div className={`num text-[11px] leading-tight text-slate-600 ${m.subPad}`}>{subLabel}</div>
                        {holes.map((i) => {
                          const c = line.cells[i];
                          const tone = !bbTab ? "text-slate-400" : c.counted ? "text-slate-100 font-bold" : "text-slate-600";
                          return (
                            <div key={`s${i}`} className={`num text-center leading-tight ${m.sub} ${m.subPad} ${tone}`}>
                              {c.sub ?? ""}
                            </div>
                          );
                        })}
                        <div className={`num text-center leading-tight text-slate-500 ${m.sub} ${m.subPad}`}>
                          {subEntered.length > 0 ? nineSub : ""}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            {b.pairRow && (
              <div className={`${GRID} mt-0.5`}>
                <div className="num text-[11px] font-semibold tracking-wider text-violet-300 border-t border-slate-800 h-[26px] flex items-center">
                  PAIR
                </div>
                {holes.map((i) => (
                  <div
                    key={`pr${i}`}
                    className={`border-t border-slate-800 h-[26px] flex items-center justify-center score text-[18px] ${netTint(
                      b.pairRow?.[i] ?? null,
                      course.par[i],
                    )}`}
                  >
                    {b.pairRow?.[i] ?? "·"}
                  </div>
                ))}
                <PairNine values={b.pairRow} holes={holes} />
              </div>
            )}
          </div>
        );
      })}

      {/* Navigation lives at the bottom, in the same slot on every view, each button
          named by where it lands: the current hole on the left (zoom in), the round's
          leaderboard on the right (zoom out). */}
      <div className="mt-2 flex gap-2">
        <button className="btn-ghost basis-1/2 py-2.5" onClick={onBack}>
          ← Hole {currentHole}
        </button>
        {onShowWholeRound && selected && (
          <button className="btn-ghost basis-1/2 py-2.5" onClick={() => onShowWholeRound(selected.id)}>
            Leaderboard →
          </button>
        )}
      </div>
    </div>
  );
}

/** Caption · headline · unit, the cluster at the right of every name line. */
function Figure({
  caption,
  headline,
  aside,
  unit,
  mine,
  size,
}: {
  caption: string;
  headline: string;
  aside?: string;
  unit: string;
  mine: boolean;
  size: string;
}) {
  return (
    <span className="flex items-baseline gap-1.5 shrink-0">
      {caption && <span className="num text-[12px] leading-none text-slate-400">{caption}</span>}
      <span className={`score ${size} leading-none ${mine ? "text-violet-300" : "text-slate-100"}`}>{headline}</span>
      {aside && <span className="num text-[12px] leading-none text-slate-400">{aside}</span>}
      {unit && <span className="num text-[11px] font-semibold leading-none tracking-[.08em] text-slate-500">{unit}</span>}
    </span>
  );
}

function PairNine({ values, holes }: { values: (number | null)[]; holes: number[] }) {
  const entered = holes.filter((i) => values[i] !== null && values[i] !== undefined);
  const sum = entered.reduce((a, i) => a + (values[i] ?? 0), 0);
  return (
    <div
      className={`border-t border-slate-800 pt-1 h-[26px] flex items-center justify-center score text-[17px] ${
        entered.length === 9 ? "text-slate-100" : "text-slate-500"
      }`}
    >
      {entered.length > 0 ? sum : "–"}
    </div>
  );
}

/** A counted net figure tinted against par, the same steps as the marks; an empty hole is a dot. */
function netTint(value: number | null, par: number): string {
  if (value === null) return "text-slate-700";
  if (value <= 0) return "text-gold-300";
  const d = value - par;
  return d <= -2 ? "text-amber-200" : d === -1 ? "text-rose-300" : d === 0 ? "text-slate-50" : d === 1 ? "text-sky-300" : "text-blue-400";
}

/** Short in the tab: two formats must fit beside the nine switch, and the header already says the game. */
export function tabLabel(spec: FormatSpec): string {
  return spec.label.replace(/^(Better Ball|Scramble) Stroke Play/, "$1").replace(/^Stableford NET$/, "Stableford");
}

function buildBlocks(
  course: Course,
  subjects: Subject[],
  cards: Record<string, Card | undefined>,
  event: EventDoc,
  flightIds: string[],
  specs: FormatSpec[],
  formats: FormatResult[],
  selected: FormatSpec | undefined,
  figure: Figure,
): { blocks: Block[]; grouped: boolean; unit: string } {
  const result = selected ? formats.find((f) => f.spec.id === selected.id) : undefined;
  // NET is the one unit worth saying: the other tabs lead with gross to par, which a
  // golfer reads without a label, and "GROSS" beside a scratch score said it twice.
  const unit = figure === "net" ? "NET" : "";

  const lineFor = (s: Subject): Line => {
    const gross = course.par.map((_, i) => cards[s.id]?.holes?.[String(i + 1)] ?? null);
    const engineRow = s.id.startsWith("team__")
      ? result?.teams.find((t) => `team__${t.pairId}` === s.id)
      : result?.players.find((p) => p.playerId === s.id);
    const cells: Cell[] = gross.map((g, i) => {
      // On a gross tab the handicap plays no part, so the dots would only ask a question.
      const strokes = figure === "gross" ? 0 : (s.strokes[i] ?? 0);
      let sub: number | null = null;
      if (g !== null) {
        // Points come from the engine (it knows the rules); net is gross minus strokes,
        // the one rule the app scores by, so it agrees with every board.
        if (figure === "pts") sub = engineRow?.perHole[i] ?? null;
        else if (figure === "net") sub = g - strokes;
      }
      return { gross: g, strokes, sub, counted: false };
    });
    const played = cells.filter((c) => c.gross !== null);
    const grossTotal = played.reduce((a, c) => a + (c.gross ?? 0), 0);
    const parPlayed = cells.reduce((a, c, i) => a + (c.gross === null ? 0 : course.par[i]), 0);
    const subTotal = cells.reduce((a, c) => a + (c.sub ?? 0), 0);
    const headline =
      played.length === 0
        ? "—"
        : figure === "net"
          ? formatToPar(subTotal - parPlayed)
          : // Stableford and scratch alike lead with gross to par — the number a golfer
            // reads first; Stableford's points follow it in parentheses.
            formatToPar(grossTotal - parPlayed);
    const aside = figure === "pts" && played.length > 0 ? `(${subTotal} pts)` : undefined;
    const grossPart = `${grossTotal} (${formatToPar(grossTotal - parPlayed)})`;
    const caption =
      played.length === 0
        ? ""
        : figure === "gross"
          ? `${grossTotal} strokes`
          : figure === "pts"
            ? ""
            : `${grossPart} gross`;
    const team = s.id.startsWith("team__") ? result?.teams.find((t) => `team__${t.pairId}` === s.id) : undefined;
    // Drive marks show only once the pair has made one: an empty row and "0 · 0" would
    // nag every pair that has not started marking, on a rule that never penalises silence.
    const initial = (pid: string) => event.players.find((p) => p.id === pid)?.name.charAt(0) ?? "?";
    const marked = team?.drives && team.drives.some((d) => d.used > 0);
    const drives = marked
      ? course.par.map((_, i) => {
          const pid = cards[s.id]?.drives?.[String(i + 1)];
          return pid ? initial(pid) : null;
        })
      : undefined;
    const driveCounts = marked ? team!.drives!.map((d) => `${initial(d.playerId)} ${d.used}`).join(" · ") : "";
    return {
      id: s.id,
      name: s.name,
      first: s.name.split(" ")[0],
      mine: Boolean(s.mine),
      cells,
      headline,
      ...(aside ? { aside } : {}),
      ...(figure === "pts" ? { points: subTotal } : {}),
      caption: driveCounts ? `${caption}${caption ? " · " : ""}tee shots ${driveCounts}` : caption,
      ...(drives ? { drives } : {}),
      ...(team?.penalty ? { penalty: team.penalty } : {}),
    };
  };

  const lines = new Map(subjects.map((s) => [s.id, lineFor(s)]));

  // Pair blocks only where the round is played in pairs on the players' own cards (Better
  // Ball); a scramble is one card per pair already, and an individual day stays individual.
  const bbSpec = specs.find((s) => s.kind === "betterball");
  const bbResult = bbSpec ? formats.find((f) => f.spec.id === bbSpec.id) : undefined;
  const blocks: Block[] = [];
  const used = new Set<string>();

  if (bbSpec && !subjects.some((s) => s.id.startsWith("team__"))) {
    const pairs = event.pairs
      .filter((p) => lines.has(p.aId) && lines.has(p.bId))
      .sort((a, b) => firstIndex(a.aId, a.bId, flightIds) - firstIndex(b.aId, b.bId, flightIds));
    for (const pair of pairs) {
      const a = lines.get(pair.aId);
      const b = lines.get(pair.bId);
      if (!a || !b) continue;
      used.add(a.id).add(b.id);
      const team = bbResult?.teams.find((t) => t.pairId === pair.id);
      const label = team?.label ?? `${a.first} & ${b.first}`;
      if (selected?.id === bbSpec.id) {
        const perHole = team?.perHole ?? course.par.map(() => null);
        for (const line of [a, b]) {
          line.cells.forEach((c, i) => {
            c.counted = c.sub !== null && c.sub === perHole[i];
          });
        }
        const thru = team?.thru ?? 0;
        blocks.push({
          key: pair.id,
          label,
          mine: a.mine || b.mine,
          headline: thru > 0 && team ? formatToPar(team.toPar) : "—",
          caption: thru > 0 ? `thru ${thru}` : "",
          unit: "PAIR NET",
          lines: [a, b],
          pairRow: perHole,
        });
      } else {
        // An individual format read per pair: both cards together.
        const played = [a, b].some((l) => l.cells.some((c) => c.gross !== null));
        let headline = "—";
        if (played) {
          const sum = [a, b].reduce((acc, l) => acc + (figure === "pts" ? (l.points ?? 0) : toNumber(l.headline)), 0);
          headline = figure === "pts" ? String(sum) : formatToPar(sum);
        }
        blocks.push({
          key: pair.id,
          label,
          mine: a.mine || b.mine,
          headline,
          caption: played ? "both cards" : "",
          unit: figure === "pts" ? "PTS" : unit,
          lines: [a, b],
        });
      }
    }
  }

  for (const s of subjects) {
    if (used.has(s.id)) continue;
    const line = lines.get(s.id);
    if (!line) continue;
    blocks.push({ key: s.id, label: line.name, mine: line.mine, headline: line.headline, caption: line.caption, unit, lines: [line] });
  }

  return { blocks, grouped: blocks.some((b) => b.lines.length > 1), unit };
}

/** "+3" → 3, "−2" → −2, "E" → 0, "17" → 17. */
function toNumber(headline: string): number {
  if (headline === "E" || headline === "—") return 0;
  return Number(headline.replace("−", "-").replace("+", ""));
}

function firstIndex(aId: string, bId: string, flightIds: string[]): number {
  const ia = flightIds.indexOf(aId);
  const ib = flightIds.indexOf(bId);
  return Math.min(ia < 0 ? 99 : ia, ib < 0 ? 99 : ib);
}
