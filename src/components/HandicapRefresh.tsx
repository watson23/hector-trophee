import { useState } from "react";
import type { EventDoc, Round } from "../types";
import {
  applyHandicaps,
  diffHandicaps,
  fetchHandicaps,
  HECTOR_EVENT_URL,
  type FetchedHandicap,
  type HandicapChange,
} from "../lib/handicapSource";

interface Props {
  event: EventDoc;
  rounds: Round[];
  saveEvent: (patch: Partial<EventDoc>) => Promise<void>;
}

/**
 * Pull the day's handicaps from hector.golf.
 *
 * That page recalculates nightly, so it should be run before the first round of each day.
 * Nothing is written until the organiser has seen what would change — a handicap moving is
 * the sort of thing worth eyeballing, and a bad parse should be obvious rather than silent.
 *
 * Rounds already opened keep the handicaps they were opened with, so this cannot rescore
 * anything already played.
 */
export default function HandicapRefresh({ event, rounds, saveEvent }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "ready" | "saving">("idle");
  const [fetched, setFetched] = useState<FetchedHandicap[] | null>(null);
  const [changes, setChanges] = useState<HandicapChange[]>([]);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const locked = rounds.filter((r) => r.handicaps).length;

  async function check() {
    setState("loading");
    setError(null);
    setDone(null);
    try {
      const list = await fetchHandicaps();
      const d = diffHandicaps(event.players, list);
      setFetched(list);
      setChanges(d.changes);
      setUnmatched(d.unmatched);
      setState("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("idle");
    }
  }

  async function apply() {
    if (!fetched) return;
    setState("saving");
    await saveEvent({ players: applyHandicaps(event.players, fetched) });
    setDone(`Updated ${changes.length} handicap${changes.length === 1 ? "" : "s"}.`);
    setState("idle");
    setFetched(null);
    setChanges([]);
  }

  return (
    <section className="mx-4 mb-4 card p-3.5">
      <h2 className="label mb-1">Handicaps</h2>
      <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
        hector.golf recalculates every night. Refresh before the first round of each day.
        Rounds that have already been opened keep the handicaps they started with, so this
        never changes a score that's already been played
        {locked > 0 && <> — {locked} of {rounds.length} are locked in</>}.
      </p>

      {state !== "ready" ? (
        <button
          onClick={check}
          disabled={state === "loading" || state === "saving"}
          className="btn-ghost w-full py-2 text-xs disabled:opacity-40"
        >
          {state === "loading" ? "Checking hector.golf…" : "Check for new handicaps"}
        </button>
      ) : (
        <>
          {changes.length === 0 ? (
            <p className="text-xs text-emerald-400">
              Already up to date — all {event.players.length} handicaps match.
            </p>
          ) : (
            <ul className="space-y-1 mb-3">
              {changes.map((c) => (
                <li key={c.id} className="flex justify-between text-xs">
                  <span className="text-slate-200 truncate">{c.name}</span>
                  <span className="num shrink-0">
                    <span className="text-slate-500">{c.from.toFixed(1)}</span>
                    <span className="text-slate-600 mx-1.5">→</span>
                    <span className={c.to > c.from ? "text-amber-300" : "text-emerald-300"}>
                      {c.to.toFixed(1)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {unmatched.length > 0 && (
            <p className="text-[11px] text-amber-400/90 mb-2 leading-relaxed">
              On hector.golf but not in this event: {unmatched.join(", ")}. Add them under
              Pairs if they're playing.
            </p>
          )}

          <div className="flex gap-2">
            {changes.length > 0 && (
              <button onClick={apply} className="btn-primary flex-1 py-2 text-xs">
                Apply {changes.length} change{changes.length === 1 ? "" : "s"}
              </button>
            )}
            <button
              onClick={() => setState("idle")}
              className="btn-ghost px-4 py-2 text-xs"
            >
              {changes.length > 0 ? "Cancel" : "Close"}
            </button>
          </div>
        </>
      )}

      {error && (
        <p className="text-xs text-rose-400 mt-2 leading-relaxed">
          Couldn't read hector.golf: {error}. You can still edit handicaps by hand, or try
          again — the page is at{" "}
          <a href={HECTOR_EVENT_URL} target="_blank" rel="noreferrer" className="underline">
            hector.golf
          </a>
          .
        </p>
      )}
      {done && <p className="text-xs text-emerald-400 mt-2">{done}</p>}
    </section>
  );
}
