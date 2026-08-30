import { useState } from "react";
import type { Round } from "../types";
import { courses, teeDotClass, teeLabel } from "../data/courses";
import type { RoundResult } from "../lib/engine";
import { formatToPar } from "../lib/leaderboard";
import LeaderTable, { type LeaderRow } from "../components/LeaderTable";
import HectorMark, { HectorPairMark } from "../components/HectorMark";
import { Empty, Header } from "../components/Chrome";

interface Props {
  rounds: Round[];
  results: Record<string, RoundResult>;
  initialRoundId: string | null;
}

export default function RoundScreen({ rounds, results, initialRoundId }: Props) {
  const [roundId, setRoundId] = useState<string | null>(initialRoundId ?? rounds[0]?.id ?? null);
  const round = rounds.find((r) => r.id === roundId) ?? rounds[0];
  const result = round ? results[round.id] : undefined;

  if (!round) return <Empty title="No rounds" body="The schedule hasn't been set up yet." />;

  const course = courses[round.courseId];

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
            onClick={() => setRoundId(r.id)}
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

      {round.seq === 1 && (
        <p className="mx-4 mt-3 text-[11px] leading-relaxed text-violet-300 bg-violet-950/40 border border-violet-900/60 rounded-xl px-3 py-2">
          Round 1 is played individually. This Stableford order is the draft order — the winner
          picks first from the other bucket.
        </p>
      )}

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
              }));

          return (
            <section key={f.spec.id}>
              <div className="px-4 mb-2 flex items-center justify-between gap-2">
                <h2 className="font-semibold text-sm">{f.spec.label}</h2>
                <div className="flex gap-1 shrink-0">
                  {f.spec.hector && (
                    <span className="pill bg-violet-950 text-violet-300">
                      Hector {Math.round(f.spec.hector.pct * 100)}%
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
                  leaderMark={
                    isTeam ? (
                      <HectorPairMark className="w-4 h-4 shrink-0 text-amber-400" />
                    ) : (
                      <HectorMark className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                    )
                  }
                />
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
