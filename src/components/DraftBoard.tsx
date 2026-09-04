import type { EventDoc, FieldPlayer } from "../types";
import type { RoundResult } from "../lib/engine";

/**
 * Thursday night, on everyone's phone. The draft is the social peak of day one, and the
 * app already knows everything about it — the pick order from round 1, whose turn it is,
 * what's left in each bucket. This is the read-only board; the picks themselves are
 * entered in Admin as they happen, and every phone watching sees the board move.
 *
 * Stays up once the pairs are complete — "all set" — until the organiser concludes the
 * draft in Admin; RoundScreen decides when to show it.
 */
export default function DraftBoard({
  event,
  result,
}: {
  event: EventDoc;
  result: RoundResult | undefined;
}) {
  const byId = new Map(event.players.map((p) => [p.id, p]));
  const paired = new Set(event.pairs.flatMap((p) => [p.aId, p.bId]));

  // Defenders sit out the draft — by right, not by pick.
  const defenders = (event.defendingPair ?? [])
    .map((id) => byId.get(id))
    .filter((p): p is FieldPlayer => Boolean(p));
  const defenceUnsettled = defenders.length === 2 && !defenders.some((d) => paired.has(d.id));
  const outOfDraft = new Set(defenceUnsettled ? defenders.map((d) => d.id) : []);

  const stableford = result?.formats.find((f) => f.spec.kind === "stableford");
  const order = [...(stableford?.players ?? [])]
    .filter((p) => p.thru > 0)
    .sort((a, b) => b.value - a.value);
  if (order.length === 0) return null;

  const target = Math.floor(event.players.length / 2);
  const complete = event.pairs.length >= target;

  const next = order.find((p) => !paired.has(p.playerId) && !outOfDraft.has(p.playerId));
  const nextPlayer = next ? byId.get(next.playerId) : null;
  const rankOf = (id: string) => order.findIndex((p) => p.playerId === id) + 1;

  const remaining = (bucket: 1 | 2) =>
    order
      .map((p) => byId.get(p.playerId))
      .filter(
        (p): p is FieldPlayer =>
          Boolean(p) && p!.bucket === bucket && !paired.has(p!.id) && !outOfDraft.has(p!.id),
      );

  return (
    <section className="mx-4 mt-3 rounded-2xl border border-violet-800/60 bg-violet-950/25 p-4">
      <p className="label text-violet-300">Draft night</p>

      {complete && (
        <p className="mt-1.5 font-serif text-xl font-semibold leading-tight">
          All {target} pairs are set
          <span className="block text-xs font-normal text-slate-400 mt-0.5">
            The Hector starts tomorrow — the organiser closes this board when the night is done.
          </span>
        </p>
      )}

      {!complete && nextPlayer && (
        <p className="mt-1.5 font-serif text-xl font-semibold leading-tight">
          {nextPlayer.name} picks next
          <span className="block text-xs font-normal text-slate-400 mt-0.5">
            #{rankOf(nextPlayer.id)} in round 1 · picks from bucket{" "}
            {nextPlayer.bucket === 1 ? 2 : 1}
          </span>
        </p>
      )}

      {defenceUnsettled && (
        <p className="mt-2.5 text-xs text-amber-300/90 leading-relaxed">
          {defenders.map((d) => d.name).join(" + ")} defend their title and sit out the draft.
        </p>
      )}

      {event.pairs.length > 0 && (
        <div className="mt-3">
          <p className="label mb-1.5">Picked ({event.pairs.length} of {target})</p>
          <ol className="space-y-1">
            {event.pairs.map((pair, i) => (
              <li key={pair.id} className="text-sm text-slate-300 flex items-center gap-2">
                <span className="num text-xs text-slate-500 w-4">{i + 1}</span>
                <span className="truncate">
                  {byId.get(pair.aId)?.name} + {byId.get(pair.bId)?.name}
                </span>
                {pair.defending && (
                  <span className="pill bg-amber-950 text-amber-300 shrink-0 text-[11px]">
                    defending
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {!complete && (
      <div className="mt-3 grid grid-cols-2 gap-3">
        {([1, 2] as const).map((bucket) => (
          <div key={bucket}>
            <p className="label mb-1.5">Bucket {bucket}</p>
            <ul className="space-y-1.5">
              {remaining(bucket).map((p) => (
                {/* Big enough for four heads over one phone: who is still there is
                    the question the whole room asks the board. */}
                <li
                  key={p.id}
                  className={`text-base leading-snug flex items-baseline gap-2 ${
                    p.id === nextPlayer?.id ? "text-violet-300 font-semibold" : "text-slate-200"
                  }`}
                >
                  <span className="num text-[12px] text-slate-500 w-5 shrink-0">
                    {rankOf(p.id)}
                  </span>
                  <span className="truncate">{p.name}</span>
                </li>
              ))}
              {remaining(bucket).length === 0 && (
                <li className="text-sm text-slate-600">all picked</li>
              )}
            </ul>
          </div>
        ))}
      </div>
      )}

      {!complete && (
        <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">
          Order is the round 1 Stableford result. The organiser enters each pick in Admin as
          it's made.
        </p>
      )}
    </section>
  );
}
