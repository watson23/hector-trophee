import { usePersistentState } from "../hooks/usePersistentState";
import type { Round } from "../types";
import type { TournamentTotals } from "../lib/engine";
import { hectorLowerIsBetter, levelParTotal, weightLabel } from "../lib/hector";
import { formatToPar, formatToParFine, rank } from "../lib/leaderboard";
import { courses } from "../data/courses";
import LeaderTable, { type LeaderRow } from "../components/LeaderTable";
import { Header, Segmented } from "../components/Chrome";
import HectorMark from "../components/HectorMark";
import Champions, { isTournamentComplete } from "../components/Champions";
import { PREVIOUS } from "../data/history";

interface Props {
  rounds: Round[];
  hector: TournamentTotals["hector"];
  victor: TournamentTotals["victor"];
  /** Positions gained/lost against the standings before the open round. */
  movement: Record<string, number>;
  highlightPlayers?: Set<string>;
  highlightPairs?: Set<string>;
}

/**
 * Round-aware Thru for a tournament table. A raw hole count ("97") means nothing
 * across six rounds; what a reader wants is where a row is right now: mid-round
 * ("R6·7"), between rounds ("R3 ✓"), or done ("F").
 */
function tournamentThru(
  rounds: Round[],
  perRound: Record<string, { thru: number }>,
  counted: number,
): string {
  const played = rounds.filter((r) => perRound[r.id]);
  if (played.length === 0) return "—";
  const live = played.find((r) => perRound[r.id].thru < 18);
  if (live) return `R${live.seq}·${perRound[live.id].thru}`;
  if (played.length >= counted) return "F";
  return `R${played[played.length - 1].seq} ✓`;
}

/**
 * The rounds the field has actually begun. A round counts once it is open or final,
 * or once more than one row has scores in it — a single stray card in an upcoming
 * round (a tester, a flight teeing off early) must not make every other pair read
 * "4 of 5 rounds".
 */
function begunRounds(rounds: Round[], rows: { perRound: Record<string, unknown> }[]): Set<string> {
  const rowsIn = new Map<string, number>();
  rows.forEach((r) => Object.keys(r.perRound).forEach((id) => rowsIn.set(id, (rowsIn.get(id) ?? 0) + 1)));
  const begun = new Set<string>();
  for (const [id, n] of rowsIn) {
    const status = rounds.find((r) => r.id === id)?.status;
    if (status === "open" || status === "final" || n > 1) begun.add(id);
  }
  return begun;
}

/** "1st", "T3", "10th" — a round's placing, the way it's said. */
function placeText(label: string): string {
  if (label.startsWith("T")) return label;
  const n = Number(label);
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}

/**
 * Where every row placed on one round. The breakdown's figures explain the total's
 * arithmetic; the placings explain its shape — a week of "1st, T3, 10th" and a week
 * of "4th, 4th, 4th" can add up to the same number.
 */
function placesOn<E extends { thru: number }>(
  table: { key: string; perRound: Record<string, E> }[],
  roundId: string,
  value: (e: E) => number,
  lowerIsBetter: boolean,
): Map<string, string> {
  const entries = table.flatMap((r) => (r.perRound[roundId] ? [{ key: r.key, e: r.perRound[roundId] }] : []));
  const ranked = rank(entries, (x) => value(x.e), lowerIsBetter, (x) => x.e.thru > 0);
  return new Map(ranked.filter((x) => x.position > 0).map((x) => [x.item.key, x.label]));
}

function Place({ label }: { label?: string }) {
  if (!label) return null;
  const first = label === "1" || label === "T1";
  return (
    <span
      className={`ml-1.5 inline-block rounded-md px-1.5 py-px text-[11px] num font-semibold align-middle ${
        first ? "bg-gold-400/15 text-gold-400" : "bg-slate-800 text-slate-300"
      }`}
    >
      {placeText(label)}
    </span>
  );
}

function bonusLabel({ birdies, eagles }: { birdies: number; eagles: number }): string {
  const parts = [];
  if (birdies) parts.push(`${birdies} birdie${birdies > 1 ? "s" : ""}`);
  if (eagles) parts.push(`${eagles} eagle${eagles > 1 ? "s" : ""}`);
  return parts.join(" and ");
}

/** The two trophies: Hector for the pair, Victor for the individual. */
export default function TournamentScreen({
  rounds,
  hector,
  victor,
  movement,
  highlightPlayers,
  highlightPairs,
}: Props) {
  const [tab, setTab] = usePersistentState<"hector" | "victor">("hectro_ui.trophy", "hector");
  const complete = isTournamentComplete(rounds);
  const hectorRoundCount = rounds.filter((r) => r.formats.some((f) => f.hector)).length;
  const victorRoundCount = rounds.filter((r) => r.formats.some((f) => f.victor)).length;
  const hectorBegun = begunRounds(rounds, hector);
  const victorBegun = begunRounds(rounds, victor);
  const hectorPlaces = new Map(rounds.map((r) => [r.id, placesOn(hector, r.id, (e) => e.toPar, hectorLowerIsBetter)]));
  const victorPlaces = new Map(rounds.map((r) => [r.id, placesOn(victor, r.id, (e) => e.points, false)]));

  // What a pair going round in level par every round would total — a bare "231.4"
  // means nothing without something to measure it against.
  const levelPar = levelParTotal(
    rounds.flatMap((r) =>
      r.formats
        .filter((f) => f.hector)
        .map((f) => ({
          pct: f.hector!.pct,
          countsBothPlayers: f.hector!.source === "bothIndividuals",
        })),
    ),
    courses[rounds[0]?.courseId ?? "radecky"]?.par.reduce((a, b) => a + b, 0) ?? 72,
  );

  const hectorRows: LeaderRow[] = hector.map((row) => ({
    key: row.key,
    label: row.label,
    // Ranked and shown TO PAR: an accumulating stroke total made the early flights
    // plummet down the live table simply for having played more holes. Weighted
    // to-par compares pairs at any stage; once the week is over it equals the
    // official total minus 240.0 exactly, so the order never disagrees with it.
    value: row.toPar,
    display: formatToParFine(row.toPar),
    // Only worth a line when this pair is missing a round others have played.
    extra:
      row.roundsPlayed > 0 && row.roundsPlayed < hectorBegun.size
        ? `${row.roundsPlayed} of ${hectorBegun.size} rounds`
        : undefined,
    extraTone: "warn" as const,
    thru: row.thru,
    thruLabel: tournamentThru(rounds, row.perRound, hectorRoundCount),
    movement: movement[row.key],
    played: row.roundsPlayed > 0,
    detail: (
      <div className="space-y-2">
        {/* The official figure lives here: the breakdown below explains it. */}
        <div className="flex justify-between gap-3 text-xs border-b border-slate-800 pb-2">
          <span className="text-slate-400">Stroke total</span>
          <span className="num font-semibold text-slate-200">{row.points.toFixed(1)}</span>
        </div>
        {rounds.map((r) => {
          const entry = row.perRound[r.id];
          if (!entry) return null;
          return (
            <div key={r.id}>
              <div className="flex justify-between gap-3 text-[12px] font-semibold text-slate-400 mb-0.5">
                <span>
                  Round {r.seq} · {r.day}
                  <Place label={hectorPlaces.get(r.id)?.get(row.key)} />
                </span>
                <span className="num text-slate-300">{formatToParFine(entry.toPar, 2)}</span>
              </div>
              {entry.detail.map((d, i) => (
                <div key={`${d.formatId}-${i}`} className="mt-1.5 first:mt-0">
                  <div className="flex justify-between gap-3 text-xs">
                    <span className="truncate text-slate-300">{d.label}</span>
                    <span className="shrink-0 num">
                      <span className="font-semibold text-slate-100">
                        {d.points.toFixed(2)}
                      </span>{" "}
                      <span className="text-slate-500">({formatToParFine(d.toPar, 2)})</span>
                    </span>
                  </div>
                  {/*
                    Spell the arithmetic out — "(33% of 39 pts = 69)" parsed as "33% of
                    39 equals 69", three different things smashed together. The weight
                    label is deliberately "33%" rather than ⅓: the fraction glyphs are
                    unreadable at this size, and percentages are how this group has
                    always talked about the weights. The engine still computes 1/3.
                  */}
                  <div className="text-[12px] text-slate-500 leading-relaxed">
                    {d.converted !== undefined
                      ? `${weightLabel(d.pct)} of ${d.who ?? "the better player"}'s ${d.raw} pts, which equals ${d.converted} strokes`
                      : `${weightLabel(d.pct)} of ${d.raw} strokes`}
                    {d.bonus && d.bonus.points > 0 && (
                      <> · less {d.bonus.points} for {bonusLabel(d.bonus)}</>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    ),
  }));

  const victorRows: LeaderRow[] = victor.map((row) => ({
    key: row.key,
    label: row.label,
    value: row.toPar,
    // Points lead — "over 40 points!" is the number people talk about — while the
    // to-par alongside (and the ranking) keeps mid-round comparison honest.
    display: `${row.points.toFixed(0)} (${formatToParFine(row.toPar, 0)})`,
    extra:
      row.roundsPlayed > 0 && row.roundsPlayed < victorBegun.size
        ? `${row.roundsPlayed} of ${victorBegun.size} Stableford rounds`
        : undefined,
    extraTone: "warn" as const,
    thru: row.thru,
    thruLabel: tournamentThru(
      rounds.filter((r) => r.formats.some((f) => f.victor)),
      row.perRound,
      victorRoundCount,
    ),
    played: row.roundsPlayed > 0,
    detail: (
      <div className="space-y-1">
        {rounds.map((r) => {
          const entry = row.perRound[r.id];
          if (!entry) return null;
          return (
            <div key={r.id} className="flex justify-between text-xs text-slate-400 num">
              <span className="font-sans">
                Round {r.seq} · {r.day}
                <Place label={victorPlaces.get(r.id)?.get(row.key)} />
              </span>
              <span className="font-semibold text-slate-200">
                {entry.points.toFixed(0)} pts{" "}
                <span className="font-normal text-slate-500">({formatToPar(entry.toPar)})</span>
              </span>
            </div>
          );
        })}
      </div>
    ),
  }));

  return (
    <div className="pb-4 relative">
      {/* Faint emblem behind the header — decoration, so it must not catch taps.
          Outline rather than filled: at this size a solid falcon reads as a blob. */}
      <HectorMark
        outline
        className="absolute -top-3 right-3 w-28 h-28 text-gold-400/[0.11] pointer-events-none [mask-image:linear-gradient(to_bottom,black_50%,transparent_82%)]"
      />
      <Header
        title="Tournament"
        subtitle={
          /* The subtitle states progress, not the format — "across all 6 rounds"
             read as a claim that six rounds were counted. */
          complete
            ? "Final"
            : (() => {
                const done = rounds.filter((r) => r.status === "final").length;
                const live = rounds.find((r) => r.status === "open");
                if (done === 0 && !live) return `Six rounds, two trophies — nothing scored yet`;
                // The on-air mark, in the Round chyron's own language: emerald and a
                // breathing dot, so "live" reads as scores moving under the table.
                // One line on a phone: with a live round the on-air mark leads and
                // "Running totals" goes — wrapped onto its own line it looked stranded.
                return live ? (
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 text-emerald-300 font-semibold">
                      <span className="live-dot" />R{live.seq} live
                    </span>
                    <span className="text-slate-600">·</span>
                    {done} of {rounds.length} rounds in
                  </span>
                ) : (
                  `Running totals · ${done} of ${rounds.length} rounds in`
                );
              })()
        }
      />
      {complete && <Champions rounds={rounds} hector={hector} victor={victor} />}
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { id: "hector", label: "Hector · pairs" },
          { id: "victor", label: "Victor · individual" },
        ]}
      />

      <div className="px-4 mt-4">
        {tab === "hector" ? (
          hectorRows.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8 leading-relaxed">
              No pairs yet. The Hector table fills in once the draft is done and the pairs are
              entered in Admin.
            </p>
          ) : (
            <>
              <p className="text-[12px] leading-relaxed text-slate-500 mb-2">
                Weighted to par — <span className="text-slate-300 font-medium">lower wins</span>.
                E is a level-par week (
                <span className="num text-slate-400">{levelPar.toFixed(1)}</span> strokes).
              </p>
              <LeaderTable
                rows={hectorRows}
                lowerIsBetter={hectorLowerIsBetter}
                scoreHeader="To par"
                decimals={1}
                wideThru
                leaderMark={<HectorMark className="w-3 h-3 shrink-0 text-gold-400" />}
                highlightKeys={highlightPairs}
              />
            </>
          )
        ) : (
          <LeaderTable
            rows={victorRows}
            lowerIsBetter
            scoreHeader="Pts"
            decimals={0}
            wideThru
            leaderMark={<HectorMark className="w-3 h-3 shrink-0 text-gold-400" />}
            highlightKeys={highlightPlayers}
          />
        )}
      </div>

      {tab === "hector" && (
        <p className="mx-4 mt-4 text-[12px] leading-relaxed text-slate-500">
          Tap a pair to see what each round contributed. For scale: the {PREVIOUS.year} title
          was won on <span className="num text-slate-400">{PREVIOUS.hector.points.toFixed(1)}</span>{" "}
          strokes — that is,{" "}
          <span className="num text-slate-400">{formatToParFine(PREVIOUS.hector.points - 240)}</span>.
        </p>
      )}
      {tab === "victor" && (
        <p className="mx-4 mt-4 text-[12px] leading-relaxed text-slate-500">
          Victor sums your Stableford NET points across the four Stableford rounds. Ranked to
          par (in parentheses) so players mid-round compare fairly — fewest over net par is
          exactly most points.
        </p>
      )}
    </div>
  );
}
