import type { Card, EventDoc, Round } from "../types";
import { courses, teeDotClass, teeLabel } from "../data/courses";
import type { RoundResult } from "../lib/engine";
import { formatToPar } from "../lib/leaderboard";
import { weightLabel } from "../lib/hector";
import LeaderTable, { type LeaderRow } from "../components/LeaderTable";
import HectorMark from "../components/HectorMark";
import HoleByHole, { grossRow, type HoleRow } from "../components/HoleByHole";
import DraftBoard from "../components/DraftBoard";
import { Empty, Header } from "../components/Chrome";

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

  if (!round) return <Empty title="No rounds" body="The schedule hasn't been set up yet." />;

  const course = courses[round.courseId];
  const roundCards = cards[round.id] ?? {};

  return (
    <div className="pb-4">
      <Header
        title={`Round ${round.seq}`}
        subtitle={
          <span className="flex items-center gap-1.5">
            {round.day} · {course?.shortName}
            <span className={`inline-block w-2 h-2 rounded-full ${teeDotClass[round.tee]}`} />
            {teeLabel[round.tee]}
          </span>
        }
      />

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
            {r.status === "open" && r.id !== round.id && <span className="ml-1">•</span>}
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

      <div className="mt-4 space-y-6">
        {result?.formats.map((f) => {
          const isTeam = f.teams.length > 0;
          const rows: LeaderRow[] = isTeam
            ? f.teams.map((t) => ({
                key: t.pairId,
                label: t.label,
                value: t.thru > 0 ? t.toPar : 0,
                display: `${t.value} (${formatToPar(t.toPar)})`,
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
                value:
                  f.spec.kind === "stableford" ? p.value : p.thru > 0 ? (p.toPar ?? 0) : 0,
                display:
                  f.spec.kind === "stableford"
                    ? String(p.value)
                    : `${p.value} (${formatToPar(p.toPar ?? 0)})`,
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
                  lowerIsBetter={f.spec.kind !== "stableford"}
                  scoreHeader={f.spec.kind === "stableford" ? "Pts" : "Score"}
                  leaderMark={<HectorMark className="w-3 h-3 shrink-0 text-amber-400" />}
                  highlightKeys={isTeam ? highlightPairs : highlightPlayers}
                />
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
