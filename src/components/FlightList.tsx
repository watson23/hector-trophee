import type { EventDoc, Round } from "../types";

/**
 * Every flight of a round, with tee times — the sheet everyone photographs and relays
 * on the course. Shown to all players (Info → Schedule, and the between-rounds card),
 * not just the admin who set it up.
 *
 * Names are grouped the way people say them: as pairs where both halves are in the
 * flight, singles otherwise (and everywhere in the individual round).
 */
export default function FlightList({
  round,
  event,
  meId,
}: {
  round: Round;
  event: EventDoc;
  meId: string | null;
}) {
  const byId = new Map(event.players.map((p) => [p.id, p]));
  const groups = round.groups.filter((g) => g.playerIds.length > 0);

  if (groups.length === 0) {
    return (
      <p className="text-xs text-slate-500 leading-relaxed">
        Flights for this round haven't been set yet.
      </p>
    );
  }

  /** "A + B" for pairs travelling together, plain names for everyone else. */
  function labels(g: Round["groups"][number]): { text: string; mine: boolean }[] {
    const out: { text: string; mine: boolean }[] = [];
    const used = new Set<string>();
    for (const pair of event.pairs) {
      if (g.playerIds.includes(pair.aId) && g.playerIds.includes(pair.bId)) {
        out.push({
          text: `${byId.get(pair.aId)?.name} + ${byId.get(pair.bId)?.name}`,
          mine: pair.aId === meId || pair.bId === meId,
        });
        used.add(pair.aId);
        used.add(pair.bId);
      }
    }
    for (const id of g.playerIds) {
      if (!used.has(id)) out.push({ text: byId.get(id)?.name ?? id, mine: id === meId });
    }
    return out;
  }

  return (
    <ul className="space-y-1.5">
      {groups.map((g) => {
        const mine = meId !== null && g.playerIds.includes(meId);
        return (
          <li
            key={g.id}
            className={`flex gap-2.5 text-xs rounded-lg px-2 py-1.5 ${
              mine ? "bg-violet-950/40 border border-violet-900/60" : ""
            }`}
          >
            <span className={`num font-semibold shrink-0 ${mine ? "text-violet-300" : "text-slate-300"}`}>
              {g.teeTime}
            </span>
            <span className={`leading-relaxed ${mine ? "text-slate-200" : "text-slate-400"}`}>
              {labels(g).map((l, i) => (
                <span key={l.text}>
                  {i > 0 && " · "}
                  {/* Your own name (or pair) stands out inside the row, not a tag at
                      the end where it reads as belonging to whoever is listed last. */}
                  <span className={l.mine ? "text-violet-300 font-semibold" : undefined}>
                    {l.text}
                  </span>
                </span>
              ))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
