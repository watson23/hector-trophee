import { useMemo } from "react";
import { usePersistentState } from "../hooks/usePersistentState";
import type { Card, EventDoc, FormatKind, FormatSpec, Round } from "../types";
import { courses, teeDotClass, teeLabel } from "../data/courses";
import {
  effectiveTee,
  roundParticipants,
  type FormatResult,
  type RoundResult,
} from "../lib/engine";
import { strokePlayResult } from "../lib/formats";
import { formatToPar, formatToParFine } from "../lib/leaderboard";
import { weightLabel } from "../lib/hector";
import LeaderTable, { type LeaderRow } from "../components/LeaderTable";
import HectorMark from "../components/HectorMark";
import HoleByHole, { grossRow, type HoleRow } from "../components/HoleByHole";
import DraftBoard from "../components/DraftBoard";
import { Empty, Segmented } from "../components/Chrome";

interface Props {
  event: EventDoc;
  rounds: Round[];
  results: Record<string, RoundResult>;
  cards: Record<string, Record<string, Card>>;
  /** The selected round — held by App (session-persisted), changed via onRoundChange. */
  roundId: string | null;
  onRoundChange: (roundId: string) => void;
  /** Hector TV: followed players (and their pairs) get the violet star treatment. */
  highlightPlayers?: Set<string>;
  highlightPairs?: Set<string>;
}

export default function RoundScreen({
  event,
  rounds,
  results,
  cards,
  roundId,
  onRoundChange,
  highlightPlayers,
  highlightPairs,
}: Props) {
  // Fully controlled: no local copy to fall out of sync when the Play tab sends the
  // viewer here at a specific round.
  const round = rounds.find((r) => r.id === roundId) ?? rounds[0];
  const result = round ? results[round.id] : undefined;

  /*
   * A round can carry three scoreboards (two formats plus the Hector pair table), and
   * nobody reads more than one at a time — so they sit behind a picker instead of a
   * scroll. Session-persisted like the other view choices; an id that doesn't exist
   * on the selected round falls back to its first board.
   */
  const [boardSel, setBoardSel] = usePersistentState<string | null>(
    "hectro_ui.roundboard",
    null,
    "session",
  );
  const kindLabel: Record<FormatKind, string> = {
    stableford: "Stableford",
    strokeplay: "Stroke Play",
    betterball: "Better Ball",
    scramble: "Scramble",
  };
  /*
   * A synthetic Scratch board for rounds that play off individual cards but don't
   * configure a gross format (R1 already has one; scramble days have no individual
   * cards to rank). Same cards, same engine functions, zero handicap — the eternal
   * "yes but what did you actually shoot" table.
   */
  const scratchBoard = useMemo<FormatResult | null>(() => {
    if (!round) return null;
    const course = courses[round.courseId];
    if (!course) return null;
    if (round.formats.some((f) => f.teamCard)) return null;
    if (round.formats.some((f) => f.kind === "strokeplay" && !f.net)) return null;
    const spec: FormatSpec = {
      id: "scratch",
      kind: "strokeplay",
      label: "Stroke Play SCR",
      net: false,
      allowance: 0,
      teamCard: false,
    };
    const roundCards = cards[round.id] ?? {};
    const tee = effectiveTee(round, course);
    return {
      spec,
      teams: [],
      players: roundParticipants(round, event.players).map((pl) => {
        const r = strokePlayResult(roundCards[pl.id], { hi: 0, course, tee, allowance: 0 }, false);
        return {
          playerId: pl.id,
          name: pl.name,
          value: r.strokes,
          toPar: r.toPar,
          thru: r.thru,
          playingHcp: 0,
          perHole: r.perHole,
          strokes: course.par.map(() => 0),
        };
      }),
    };
  }, [round, cards, event.players]);

  const pairSpec = round?.formats.find((f) => f.hector && f.hector.source !== "team");
  const hasPairBoard = Boolean(
    pairSpec?.hector && result && Object.keys(result.hector).length > 0,
  );
  const boards = round
    ? [
        ...round.formats.map((f) => ({
          id: f.id,
          // A configured gross format IS the scratch board — name it what it is.
          label: f.kind === "strokeplay" && !f.net ? "Scratch" : kindLabel[f.kind],
        })),
        ...(scratchBoard ? [{ id: "scratch", label: "Scratch" }] : []),
        ...(hasPairBoard ? [{ id: "pairs", label: "Pairs" }] : []),
      ]
    : [];
  const board = boards.some((b) => b.id === boardSel) ? boardSel! : (boards[0]?.id ?? "");

  if (!round) return <Empty title="No rounds" body="The schedule hasn't been set up yet." />;

  const course = courses[round.courseId];
  const roundCards = cards[round.id] ?? {};

  return (
    <div className="pb-4">
      {/* The chyron: broadcast's thin caption strip in place of a document header —
          what's on air and where, in the same tracked-caps voice as the Hector TV
          ident. The register shifts with the selected round's status: a breathing
          dot and LIVE while play is on, quiet caps otherwise. */}
      <div className="flex items-center justify-between gap-3 px-4 pt-5 pb-3 num text-[11px] tracking-[0.2em] uppercase">
        <span className="flex items-center gap-2 shrink-0 font-semibold">
          {round.status === "open" && <span className="live-dot text-emerald-400" />}
          <span className={round.status === "open" ? "text-emerald-300" : "text-slate-300"}>
            {round.status === "open" ? "Live" : round.status === "final" ? "Final" : "Upcoming"}
            <span className="text-slate-600"> · </span>Round {round.seq}
          </span>
        </span>
        <span className="flex items-center gap-1.5 min-w-0 truncate text-slate-500">
          <span className="truncate">
            {round.day} · {course?.shortName}
          </span>
          <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${teeDotClass[round.tee]}`} />
          {teeLabel[round.tee]}
        </span>
      </div>

      <div className="px-4 flex gap-1.5 overflow-x-auto pb-1">
        {rounds.map((r) => (
          <button
            key={r.id}
            onClick={() => onRoundChange(r.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold num transition-colors ${
              r.id === round.id
                ? "bg-violet-600 text-white"
                : r.status === "open"
                  ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                  : "bg-slate-900 text-slate-400 border border-slate-800"
            }`}
          >
            R{r.seq}
            {r.status === "open" && r.id !== round.id && (
              <span className="live-dot ml-1 align-middle" />
            )}
          </button>
        ))}
      </div>

      {/* The draft round: before it's in, a note about what the order will mean; once
          it's final, the live draft board — until the ten pairs stand. */}
      {round.formats.some((f) => f.hector?.source === "betterIndividual") &&
        (round.status === "final" ? (
          <DraftBoard event={event} result={result} />
        ) : (
          <p className="mx-4 mt-3 text-[11px] leading-relaxed text-violet-300 bg-violet-950/40 border border-violet-900/60 rounded-xl px-3 py-2">
            Round 1 is played individually. This Stableford order is the draft order — the
            winner picks first from the other bucket.
          </p>
        ))}

      {boards.length > 1 && (
        <div className="mt-4">
          <Segmented value={board} onChange={setBoardSel} options={boards} />
        </div>
      )}

      <div className="mt-4 space-y-6">
        {[...(result?.formats ?? []), ...(scratchBoard ? [scratchBoard] : [])].map((f) => {
          if (f.spec.id !== board) return null;
          const isTeam = f.teams.length > 0;
          const rows: LeaderRow[] = isTeam
            ? f.teams.map((t) => ({
                key: t.pairId,
                label: t.label,
                value: t.thru > 0 ? t.toPar : 0,
                // To par leads, strokes follow — the ranking metric is the headline.
                display: `${formatToPar(t.toPar)} (${t.value})`,
                extra:
                  t.playingHcp !== undefined
                    ? `team HCP ${t.playingHcp}${t.birdies ? ` · ${t.birdies} birdie${t.birdies > 1 ? "s" : ""}` : ""}`
                    : t.birdies
                      ? `${t.birdies} net birdie${t.birdies > 1 ? "s" : ""}`
                      : undefined,
                thru: t.thru,
                played: t.thru > 0,
                detail: course && (
                  <HoleByHole
                    course={course}
                    rows={[
                      ...t.subjectIds.map((id, i) =>
                        grossRow(
                          roundCards[id],
                          t.subjectIds.length > 1
                            ? (t.label.split(" + ")[i] ?? "gross")
                            : "gross",
                          t.subjectStrokes?.[i],
                        ),
                      ),
                      {
                        label: f.spec.kind === "scramble" ? "net" : "team",
                        values: t.perHole,
                        colourVsPar: true,
                        emphasis: true,
                      },
                    ]}
                    footer={
                      t.contributor
                        ? "Each hole takes the lower net ball of the two."
                        : undefined
                    }
                  />
                ),
              }))
            : f.players.map((p) => ({
                key: p.playerId,
                label: p.name,
                value: p.thru > 0 ? (p.toPar ?? 0) : 0,
                // Ranked to par (net par = 2 points) so mid-round comparison is fair —
                // but points lead the display, because "40 points!" is how Stableford
                // is actually spoken. Stroke formats lead with to par for the same
                // reason: "twelve under" is how those are spoken.
                display:
                  f.spec.kind === "stableford"
                    ? `${p.value} (${formatToPar(p.toPar ?? 0)})`
                    : `${formatToPar(p.toPar ?? 0)} (${p.value})`,
                extra: f.spec.net ? `playing HCP ${p.playingHcp}` : undefined,
                thru: p.thru,
                played: p.thru > 0,
                detail: course && (
                  <HoleByHole
                    course={course}
                    rows={[
                      grossRow(roundCards[p.playerId], "gross", p.strokes),
                      ...(f.spec.kind === "stableford" || f.spec.net
                        ? ([
                            {
                              label: f.spec.kind === "stableford" ? "pts" : "net",
                              values: p.perHole,
                              colourVsPar: f.spec.kind !== "stableford",
                              emphasis: true,
                            },
                          ] as HoleRow[])
                        : []),
                    ]}
                  />
                ),
              }));

          return (
            <section key={f.spec.id}>
              <div className="px-4 mb-2 flex items-center justify-between gap-2">
                <h2 className="font-semibold text-sm">{f.spec.label}</h2>
                <div className="flex gap-1 shrink-0">
                  {f.spec.hector && (
                    <span className="pill bg-violet-950 text-violet-300">
                      Hector {weightLabel(f.spec.hector.pct)}
                    </span>
                  )}
                  {f.spec.victor && (
                    <span className="pill bg-amber-950 text-amber-300">Victor</span>
                  )}
                </div>
              </div>
              <div className="px-4">
                <LeaderTable
                  rows={rows}
                  lowerIsBetter
                  scoreHeader={f.spec.kind === "stableford" ? "Pts" : "To par"}
                  leaderMark={<HectorMark className="w-3 h-3 shrink-0 text-gold-400" />}
                  highlightKeys={isTeam ? highlightPairs : highlightPlayers}
                />
              </div>
            </section>
          );
        })}

        {/*
          Lasse's spectator request: on rounds where the Hector comes from individual
          play (the draft Stableford, the both-count stroke play), an individual's −3
          tells only half the story — the pair might still be +1 once the partner's +4
          counts. The engine already computes each pair's round contribution with the
          format's own rules; this simply shows it. Team rounds need nothing: their
          tables already are the pairs.
        */}
        {result &&
          board === "pairs" &&
          (() => {
            const spec = pairSpec;
            const entries = Object.entries(result.hector);
            if (!spec?.hector || entries.length === 0) return null;
            const byId = new Map(event.players.map((p) => [p.id, p]));
            const pct = spec.hector.pct;
            const pairRows: LeaderRow[] = entries.map(([pairId, entry]) => {
              const pair = event.pairs.find((p) => p.id === pairId);
              const label = pair
                ? `${byId.get(pair.aId)?.name ?? "?"} + ${byId.get(pair.bId)?.name ?? "?"}`
                : pairId;
              const combined = Math.round(entry.toPar / pct);
              const extra =
                spec.hector!.source === "betterIndividual"
                  ? entry.detail[0]?.who
                    ? `counts ${entry.detail[0].who}'s ${entry.detail[0].raw} pts`
                    : undefined
                  : entry.detail
                      .map((d) => {
                        const name = d.label.split("— ")[1] ?? d.label;
                        return `${name} ${formatToPar(Math.round(d.toPar / d.pct))}`;
                      })
                      .join(" · ");
              return {
                key: pairId,
                label,
                value: entry.thru > 0 ? entry.toPar : 0,
                display: `${formatToPar(combined)} (${formatToParFine(entry.toPar, 2)})`,
                extra,
                thru: entry.thru,
                played: entry.thru > 0,
              };
            });
            return (
              <section>
                <div className="px-4 mb-2 flex items-center justify-between gap-2">
                  <h2 className="font-semibold text-sm">The Hector this round</h2>
                  <span className="pill bg-violet-950 text-violet-300 shrink-0">
                    Hector {weightLabel(pct)}
                  </span>
                </div>
                <div className="px-4">
                  <LeaderTable
                    rows={pairRows}
                    lowerIsBetter
                    scoreHeader="To par"
                    leaderMark={<HectorMark className="w-3 h-3 shrink-0 text-gold-400" />}
                    highlightKeys={highlightPairs}
                  />
                </div>
                <p className="px-4 mt-2 text-[11px] text-slate-500 leading-relaxed">
                  {spec.hector!.source === "betterIndividual"
                    ? "The better player's round counts for the pair. The weighted share in parentheses is what goes into the trophy."
                    : "Both players count. The pair's combined to par leads; the weighted share in parentheses is what goes into the trophy."}
                </p>
              </section>
            );
          })()}
      </div>
    </div>
  );
}
