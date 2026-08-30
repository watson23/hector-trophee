import { useState } from "react";
import type { Round } from "../types";
import type { TournamentTotals } from "../lib/engine";
import { hectorLowerIsBetter, hectorStrategy, HECTOR_STRATEGY } from "../lib/hector";
import LeaderTable, { type LeaderRow } from "../components/LeaderTable";
import { Header, Segmented } from "../components/Chrome";

interface Props {
  rounds: Round[];
  hector: TournamentTotals["hector"];
  victor: TournamentTotals["victor"];
}

/** The two trophies: Hector for the pair, Victor for the individual. */
export default function TournamentScreen({ rounds, hector, victor }: Props) {
  const [tab, setTab] = useState<"hector" | "victor">("hector");
  const holesPerRound = 18;
  const totalHoles = rounds.length * holesPerRound;

  const hectorRows: LeaderRow[] = hector.map((row) => ({
    key: row.key,
    label: row.label,
    value: row.points,
    display: row.points.toFixed(1),
    extra: `${row.roundsPlayed} of ${rounds.length} rounds`,
    thru: row.thru,
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
                <div
                  key={`${d.formatId}-${i}`}
                  className="flex justify-between gap-3 text-xs text-slate-400 num"
                >
                  <span className="truncate font-sans">
                    {d.label}{" "}
                    <span className="text-slate-600">
                      ({Math.round(d.pct * 100)}% of {d.raw})
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold text-slate-200">
                    {d.points >= 0 ? "+" : ""}
                    {d.points.toFixed(2)}
                  </span>
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
    extra: `${row.roundsPlayed} Stableford round${row.roundsPlayed === 1 ? "" : "s"}`,
    thru: row.thru,
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
    <div className="pb-4">
      <Header title="Tournament" subtitle="Running totals across all six rounds" />
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
            <LeaderTable
              rows={hectorRows}
              lowerIsBetter={hectorLowerIsBetter}
              scoreHeader="Points"
              decimals={1}
              totalHoles={totalHoles}
            />
          )
        ) : (
          <LeaderTable
            rows={victorRows}
            lowerIsBetter={false}
            scoreHeader="Points"
            decimals={1}
            totalHoles={4 * holesPerRound}
          />
        )}
      </div>

      {tab === "hector" && (
        <p className="mx-4 mt-4 text-[11px] leading-relaxed text-slate-500">
          {hectorLowerIsBetter ? "Lower total wins." : "Higher total wins."} Tap a pair to see how
          each round contributed. Scoring method:{" "}
          <span className="text-slate-400">{hectorStrategy.description}</span>{" "}
          <span className="text-amber-500/80">
            ({HECTOR_STRATEGY} — provisional until the official Hector formula is confirmed)
          </span>
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
