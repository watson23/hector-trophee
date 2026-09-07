import type { Card, EventDoc, Round } from "../types";
import { roundParticipants } from "../lib/engine";

/**
 * Lasse's dinner-nagging list: who still hasn't entered a finished individual round
 * into eBirdie/GameBook. Data comes from each player's own checkbox on their Play view.
 * Lives on Admin › Today, because chasing Juuso at dinner is a running-the-week job.
 */
export default function HcpOwed({
  event,
  rounds,
  cards,
}: {
  event: EventDoc;
  rounds: Round[];
  cards: Record<string, Record<string, Card>>;
}) {
  const hcpRounds = rounds.filter((r) => r.status === "final" && !r.formats.some((f) => f.teamCard));
  if (hcpRounds.length === 0) return null;
  const lines = hcpRounds
    .map((r) => ({
      r,
      waiting: roundParticipants(r, event.players).filter((p) => {
        const card = cards[r.id]?.[p.id];
        return card && Object.keys(card.holes ?? {}).length > 0 && !card.hcpSubmitted;
      }),
    }))
    .filter((l) => l.waiting.length > 0);
  return (
    <section className="mx-4 card p-3.5">
      <h2 className="text-[12px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Handicap cards</h2>
      {lines.length === 0 ? (
        <p className="text-xs text-emerald-400">Everyone has entered every finished round. Peaceful dinner.</p>
      ) : (
        <ul className="space-y-1">
          {lines.map(({ r, waiting }) => (
            <li key={r.id} className="text-xs leading-relaxed">
              <span className="num font-semibold text-slate-300">R{r.seq}</span>{" "}
              <span className="text-amber-400">waiting:</span>{" "}
              <span className="text-slate-400">{waiting.map((p) => p.name).join(", ")}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
