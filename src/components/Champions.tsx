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
    /*
     * The one place the app goes full clubhouse: bottle green, engraved double rule,
     * gold serif names. Ceremony reads as ceremony because everything else stays
     * broadcast-quiet.
     */
    <section className="mx-4 mt-2 mb-5 rounded-3xl border border-gold-400/30 bg-gradient-to-b from-[#10241a] to-[#0a1610] p-5 text-center shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
      <img
        src="/eagle-gold.png"
        alt=""
        width={268}
        height={424}
        className="mx-auto h-36 w-auto drop-shadow-[0_6px_24px_rgba(227,179,65,0.3)]"
      />

      <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.25em] text-gold-400">
        {rounds.length} rounds · complete
      </p>

      {/* An engraved double hairline, the way trophy plates rule their lines. */}
      <div className="mx-10 mt-3 border-t border-gold-400/40">
        <div className="mt-[2px] border-t border-gold-400/15" />
      </div>

      <h2 className="mt-3 text-[11px] font-semibold uppercase tracking-widest text-[#8fa294]">
        Hector Trophée
      </h2>
      {hectorTied.length > 1 ? (
        <p className="mt-1 font-serif text-xl font-semibold text-gold-300 leading-tight">
          {hectorTied.map((r) => r.item.label).join(" & ")}
          <span className="block text-xs font-medium text-gold-400/80 mt-1">
            tied on {pair.points.toFixed(1)}
          </span>
        </p>
      ) : (
        <p className="mt-1 font-serif text-[26px] font-semibold text-gold-300 leading-tight">
          {pair.label}
          <span className="block font-serif text-base text-gold-400/90 mt-1">
            {pair.points.toFixed(1)}
          </span>
        </p>
      )}
      {/* Lineage: a trophy means more with the year before under it. */}
      <p className="mt-1.5 text-[11px] text-[#7e9186] num">
        {hectorTied.length === 1 && pair.label === PREVIOUS.hector.label
          ? `Title defended · won ${PREVIOUS.year} on ${PREVIOUS.hector.points.toFixed(1)}`
          : `${PREVIOUS.year} · ${PREVIOUS.hector.label} · ${PREVIOUS.hector.points.toFixed(1)}`}
      </p>

      <div className="mt-4 pt-4 border-t border-gold-400/20">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-[#8fa294]">
          Victor
        </h2>
        <p className="mt-1 font-serif text-xl font-semibold text-gold-300">
          {victorTied.length > 1
            ? victorTied.map((r) => r.item.label).join(" & ")
            : player.label}
          <span className="ml-2 font-serif text-sm text-gold-400/90">
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
