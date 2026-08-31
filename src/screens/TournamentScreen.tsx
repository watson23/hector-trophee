import { usePersistentState } from "../hooks/usePersistentState";
import type { Round } from "../types";
import type { TournamentTotals } from "../lib/engine";
import { hectorLowerIsBetter, levelParTotal, weightLabel } from "../lib/hector";
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

/** The rounds that have actually begun for anyone, from the data rather than status. */
function begunRounds(rows: { perRound: Record<string, unknown> }[]): Set<string> {
  const begun = new Set<string>();
  rows.forEach((r) => Object.keys(r.perRound).forEach((id) => begun.add(id)));
  return begun;
}

function bonusLabel({ birdies, eagles }: { birdies: number; eagles: number }): string {
  const parts = [];
  if (birdies) parts.push(`${birdies} birdie${birdies > 1 ? "s" : ""}`);
  if (eagles) parts.push(`${eagles} eagle${eagles > 1 ? "s" : ""}`);
  return parts.join(" and ");
}

/** The two trophies: Hector for the pair, Victor for the individual. */
export default function TournamentScreen({ rounds, hector, victor, movement }: Props) {
  const [tab, setTab] = usePersistentState<"hector" | "victor">("hectro_ui.trophy", "hector");
  const complete = isTournamentComplete(rounds);
  const hectorRoundCount = rounds.filter((r) => r.formats.some((f) => f.hector)).length;
  const victorRoundCount = rounds.filter((r) => r.formats.some((f) => f.victor)).length;
  const hectorBegun = begunRounds(hector);
  const victorBegun = begunRounds(victor);

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
    value: row.points,
    display: row.points.toFixed(1),
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
        {rounds.map((r) => {
          const entry = row.perRound[r.id];
          if (!entry) return null;
          return (
            <div key={r.id}>
              <div className="text-[11px] font-semibold text-slate-400 mb-0.5">
                Round {r.seq} · {r.day}
              </div>
              {entry.detail.map((d, i) => (
                <div key={`${d.formatId}-${i}`} className="mt-1.5 first:mt-0">
                  <div className="flex justify-between gap-3 text-xs">
                    <span className="truncate text-slate-300">{d.label}</span>
                    <span className="shrink-0 font-semibold text-slate-100 num">
                      {d.points >= 0 ? "+" : ""}
                      {d.points.toFixed(2)}
                    </span>
                  </div>
                  {/*
                    Spell the arithmetic out — "(33% of 39 pts = 69)" parsed as "33% of
                    39 equals 69", three different things smashed together. The weight
                    label is deliberately "33%" rather than ⅓: the fraction glyphs are
                    unreadable at this size, and percentages are how this group has
                    always talked about the weights. The engine still computes 1/3.
                  */}
                  <div className="text-[11px] text-slate-500 leading-relaxed">
                    {d.converted !== undefined
                      ? `${weightLabel(d.pct)} of ${d.who ?? "the better player"}'s ${d.raw} pts, which is ${d.converted} strokes`
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
    value: row.points,
    display: row.points.toFixed(1),
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
              </span>
              <span className="font-semibold text-slate-200">{entry.points.toFixed(0)} pts</span>
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
        className="absolute -top-3 right-3 w-28 h-28 text-violet-400/[0.11] pointer-events-none"
      />
      <Header
        title="Tournament"
        subtitle={
          complete ? "Final" : `Running totals across all ${rounds.length} rounds`
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
              <p className="text-[11px] leading-relaxed text-slate-500 mb-2">
                A stroke total — <span className="text-slate-300 font-medium">lower wins</span>.
                Level par all week is{" "}
                <span className="num text-slate-400">{levelPar.toFixed(1)}</span>.
              </p>
              <LeaderTable
                rows={hectorRows}
                lowerIsBetter={hectorLowerIsBetter}
                scoreHeader="Strokes"
                decimals={1}
                wideThru
                leaderMark={<HectorMark className="w-3 h-3 shrink-0 text-amber-400" />}
              />
            </>
          )
        ) : (
          <LeaderTable
            rows={victorRows}
            lowerIsBetter={false}
            scoreHeader="Points"
            decimals={1}
            wideThru
            leaderMark={<HectorMark className="w-3 h-3 shrink-0 text-amber-400" />}
          />
        )}
      </div>

      {tab === "hector" && (
        <p className="mx-4 mt-4 text-[11px] leading-relaxed text-slate-500">
          Tap a pair to see what each round contributed. For scale: the {PREVIOUS.year} title
          was won on <span className="num text-slate-400">{PREVIOUS.hector.points.toFixed(1)}</span>.
        </p>
      )}
      {tab === "victor" && (
        <p className="mx-4 mt-4 text-[11px] leading-relaxed text-slate-500">
          Victor is the sum of your Stableford NET points across the four Stableford rounds.
          Highest wins.
        </p>
      )}
    </div>
  );
}
