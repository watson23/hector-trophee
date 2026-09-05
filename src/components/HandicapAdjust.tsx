import { useState } from "react";
import type { EventDoc, Round } from "../types";
import { courses } from "../data/courses";
import { effectiveTee } from "../lib/engine";
import { courseHandicap } from "../lib/handicap";

/**
 * Handicaps by hand, for the case the daily refresh cannot cover: a wrong index on
 * hector.golf, a change that landed after 07:00, a round opened before a correction.
 *
 * Two levers, and the difference between them is the whole point. The player's current
 * index feeds rounds not yet opened; a round already opened plays off the index frozen
 * onto it when it opened, and only that frozen value changes that round's scoring.
 * Nothing here can touch a round the player is not in.
 */
export default function HandicapAdjust({
  event,
  rounds,
  saveEvent,
  patchRound,
}: {
  event: EventDoc;
  rounds: Round[];
  saveEvent: (patch: Partial<EventDoc>) => Promise<void>;
  patchRound: (roundId: string, patch: Partial<Round>) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [playerId, setPlayerId] = useState(event.players[0]?.id ?? "");
  const player = event.players.find((p) => p.id === playerId);
  const [saved, setSaved] = useState<string | null>(null);
  const flash = (msg: string) => {
    setSaved(msg);
    setTimeout(() => setSaved(null), 2000);
  };

  const parse = (raw: string): number | null => {
    const n = Number(raw.replace(",", "."));
    return Number.isFinite(n) && n >= -10 && n <= 54 ? Math.round(n * 10) / 10 : null;
  };

  async function setIndex(raw: string) {
    if (!player) return;
    const hi = parse(raw);
    if (hi === null || hi === player.hi) return;
    await saveEvent({
      players: event.players.map((p) => (p.id === player.id ? { ...p, hi, hiLocked: true } : p)),
    });
    flash(`${player.name}: index ${hi} — locked against the daily refresh`);
  }

  async function setLocked(locked: boolean) {
    if (!player) return;
    await saveEvent({
      players: event.players.map((p) => (p.id === player.id ? { ...p, hiLocked: locked } : p)),
    });
  }

  async function setFrozen(round: Round, raw: string) {
    if (!player) return;
    const hi = parse(raw);
    if (hi === null) return;
    await patchRound(round.id, { handicaps: { ...(round.handicaps ?? {}), [player.id]: hi } });
    flash(`${player.name}: round ${round.seq} now plays off ${hi}`);
  }

  const frozenRounds = rounds.filter((r) => r.handicaps && player && player.id in r.handicaps);

  return (
    <section className="mx-4 mt-3 card p-3.5">
      <button onClick={() => setOpen((v) => !v)} className="w-full text-left flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[12px] font-semibold uppercase tracking-wider text-slate-400">Adjust a handicap by hand</h2>
          <p className="text-[12px] text-slate-500 leading-relaxed mt-0.5">
            For when hector.golf is wrong or late. Per player, per round.
          </p>
        </div>
        <span className="text-[12px] text-slate-500 shrink-0">{open ? "Close" : "Open"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <select className="input w-full text-sm" value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
            {event.players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · HCP {p.hi.toFixed(1)}
              </option>
            ))}
          </select>

          {player && (
            <>
              <div className="rounded-xl border border-slate-800 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">Current index</div>
                    <p className="text-[12px] text-slate-500 leading-relaxed">
                      Feeds every round not yet opened. Rounds already opened keep the index
                      frozen at their opening — see below.
                    </p>
                  </div>
                  <input
                    key={`hi-${player.id}-${player.hi}`}
                    type="text"
                    inputMode="decimal"
                    defaultValue={player.hi.toFixed(1)}
                    onBlur={(e) => void setIndex(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                    className="input w-20 num text-center shrink-0"
                  />
                </div>
                <label className="mt-2.5 flex items-center gap-2 text-[12px] text-slate-400">
                  <input
                    type="checkbox"
                    checked={Boolean(player.hiLocked)}
                    onChange={(e) => void setLocked(e.target.checked)}
                    className="accent-violet-500"
                  />
                  Locked — the 07:00 refresh from hector.golf leaves this index alone
                </label>
              </div>

              {frozenRounds.length > 0 ? (
                <div className="rounded-xl border border-slate-800 p-3 space-y-2">
                  <div className="text-sm font-semibold">Frozen per round</div>
                  <p className="text-[12px] text-slate-500 leading-relaxed">
                    Each opened round froze the index it is played off. Changing one rescores
                    that round only.
                  </p>
                  {frozenRounds.map((r) => {
                    const course = courses[r.courseId];
                    const hi = r.handicaps![player.id];
                    const ch = course ? courseHandicap(hi, effectiveTee(r, course)) : null;
                    return (
                      <div key={r.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate">
                          <span className="num text-violet-300 font-semibold">R{r.seq}</span>{" "}
                          <span className="text-slate-300">{course?.shortName}</span>
                          <span className="text-slate-500 text-[12px]">
                            {" "}
                            · {r.status}
                            {ch !== null ? ` · course HCP ${ch}` : ""}
                          </span>
                        </span>
                        <input
                          key={`fr-${r.id}-${hi}`}
                          type="text"
                          inputMode="decimal"
                          defaultValue={hi.toFixed(1)}
                          onBlur={(e) => void setFrozen(r, e.currentTarget.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                          }}
                          className="input w-20 num text-center shrink-0 py-1.5"
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[12px] text-slate-500 px-1">
                  No round has frozen an index for {player.name} yet — they all still follow the
                  current index above.
                </p>
              )}

              {saved && <p className="text-[12px] text-emerald-400">{saved}</p>}
            </>
          )}
        </div>
      )}
    </section>
  );
}
