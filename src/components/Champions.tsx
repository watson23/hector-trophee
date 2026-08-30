import type { Round } from "../types";
import type { TournamentTotals } from "../lib/engine";
import { hectorLowerIsBetter } from "../lib/hector";
import { rank } from "../lib/leaderboard";
import { PREVIOUS } from "../data/history";

interface Props {
  rounds: Round[];
  hector: TournamentTotals["hector"];
  victor: TournamentTotals["victor"];
}

/**
 * Shown once every round is final: the two trophies, decided.
 *
 * The app otherwise just stops when the last card is in, which is a flat way to end a
 * week. This is the moment it has been counting towards.
 */
export default function Champions({ rounds, hector, victor }: Props) {
  const hectorRanked = rank(
    hector,
    (r) => r.points,
    hectorLowerIsBetter,
    (r) => r.roundsPlayed > 0,
  );
  const victorRanked = rank(
    victor,
    (r) => r.points,
    false,
    (r) => r.roundsPlayed > 0,
  );

  const pair = hectorRanked[0]?.item;
  const player = victorRanked[0]?.item;
  if (!pair || !player) return null;

  // A tie at the top is possible, and pretending otherwise would be worse than saying so.
  const hectorTied = hectorRanked.filter((r) => r.position === 1);
  const victorTied = victorRanked.filter((r) => r.position === 1);

  return (
    <section className="mx-4 mt-2 mb-5 rounded-3xl border border-amber-500/25 bg-gradient-to-b from-amber-500/[0.10] to-transparent p-5 text-center">
      <img
        src="/eagle-gold.png"
        alt=""
        width={268}
        height={424}
        className="mx-auto h-36 w-auto drop-shadow-[0_6px_24px_rgba(251,191,36,0.28)]"
      />

      <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.25em] text-amber-400">
        {rounds.length} rounds · complete
      </p>

      <h2 className="mt-3 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
        Hector Trophée
      </h2>
      {hectorTied.length > 1 ? (
        <p className="mt-1 text-xl font-extrabold text-amber-200 leading-tight">
          {hectorTied.map((r) => r.item.label).join(" & ")}
          <span className="block text-xs font-medium text-amber-400/80 mt-1">
            tied on {pair.points.toFixed(1)}
          </span>
        </p>
      ) : (
        <p className="mt-1 text-2xl font-extrabold text-amber-200 leading-tight">
          {pair.label}
          <span className="block text-sm font-semibold text-amber-400/90 num mt-1">
            {pair.points.toFixed(1)}
          </span>
        </p>
      )}
      {/* Lineage: a trophy means more with the year before under it. */}
      <p className="mt-1.5 text-[11px] text-slate-500 num">
        {hectorTied.length === 1 && pair.label === PREVIOUS.hector.label
          ? `Title defended · won ${PREVIOUS.year} on ${PREVIOUS.hector.points.toFixed(1)}`
          : `${PREVIOUS.year} · ${PREVIOUS.hector.label} · ${PREVIOUS.hector.points.toFixed(1)}`}
      </p>

      <div className="mt-4 pt-4 border-t border-amber-500/15">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
          Victor
        </h2>
        <p className="mt-1 text-lg font-bold text-amber-100">
          {victorTied.length > 1
            ? victorTied.map((r) => r.item.label).join(" & ")
            : player.label}
          <span className="ml-2 text-sm font-semibold text-amber-400/90 num">
            {player.points.toFixed(0)}
          </span>
        </p>
      </div>
    </section>
  );
}

/** Every round played out. Only then is there anything to celebrate. */
export function isTournamentComplete(rounds: Round[]): boolean {
  return rounds.length > 0 && rounds.every((r) => r.status === "final");
}
