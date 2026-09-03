import { useState } from "react";
import type { EventDoc } from "../types";
import { checkPin } from "../lib/pin";
import HectorMark from "./HectorMark";

interface Props {
  event: EventDoc;
  unlocked: boolean;
  onUnlock: () => void;
  onPickPlayer: (playerId: string) => void;
  /** Hector TV: watching without the PIN. */
  onSpectate: () => void;
}

/** Two steps on the first tee: the event PIN, then tap your own name. */
export default function Onboarding({ event, unlocked, onUnlock, onPickPlayer, onSpectate }: Props) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  // A beat of confirmation before the choice sticks: twenty names, and a mis-tap here
  // means scoring the week under someone else's identity.
  const [picked, setPicked] = useState<string | null>(null);

  async function submitPin(e: React.FormEvent) {
    e.preventDefault();
    setChecking(true);
    setError(null);
    const ok = await checkPin(pin, event.pinHash);
    setChecking(false);
    if (ok) onUnlock();
    else setError("That code doesn't match. Ask in the group chat.");
  }

  const buckets = [1, 2] as const;

  return (
    <div className="min-h-dvh flex flex-col justify-center px-5 py-10 max-w-lg mx-auto">
      <header className="mb-8 text-center">
        <HectorMark className="w-20 h-20 mx-auto mb-3 text-gold-400" />
        <div className="text-[12px] font-semibold uppercase tracking-[0.25em] text-gold-400">
          Hector Trophée
        </div>
        <h1 className="font-serif text-5xl font-semibold mt-1">2026</h1>
        <p className="text-slate-400 text-sm mt-2">{event.venue}</p>
        <p className="text-slate-500 text-sm">{event.dates}</p>
      </header>

      {!unlocked ? (
        <form onSubmit={submitPin} className="card p-5 space-y-4">
          <div>
            <label className="label" htmlFor="pin">
              Event code
            </label>
            <input
              id="pin"
              autoFocus
              autoComplete="off"
              autoCapitalize="characters"
              className="input w-full mt-2 text-center text-2xl tracking-[0.4em] num uppercase"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="•••••"
            />
          </div>
          {error && <p className="text-rose-400 text-sm">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={!pin || checking}>
            {checking ? "Checking…" : "Continue"}
          </button>
          <button
            type="button"
            onClick={onSpectate}
            className="w-full text-center text-sm text-slate-500 hover:text-violet-300 pt-1"
          >
            Just watching? Open Hector TV →
          </button>
        </form>
      ) : picked ? (
        (() => {
          const p = event.players.find((x) => x.id === picked)!;
          return (
            <div className="card p-5 text-center space-y-4">
              <div>
                <p className="text-slate-400 text-sm">You're</p>
                <p className="text-2xl font-extrabold mt-0.5">{p.name}</p>
                <p className="text-slate-500 text-sm num mt-0.5">
                  HCP {p.hi.toFixed(1)} · Bucket {p.bucket}
                </p>
              </div>
              <button className="btn-primary w-full" onClick={() => onPickPlayer(p.id)}>
                That's me
              </button>
              <button
                className="w-full text-sm text-slate-400 py-1"
                onClick={() => setPicked(null)}
              >
                No, go back
              </button>
            </div>
          );
        })()
      ) : (
        <div className="space-y-5">
          <p className="text-center text-slate-300 text-sm">Who are you?</p>
          {buckets.map((bucket) => (
            <section key={bucket}>
              <h2 className="label mb-2">Bucket {bucket}</h2>
              <div className="grid grid-cols-2 gap-2">
                {event.players
                  .filter((p) => p.bucket === bucket)
                  .map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setPicked(p.id)}
                      className="card px-3 py-3 text-left hover:border-violet-600 hover:bg-slate-800
                                 active:bg-slate-800 transition-colors"
                    >
                      <div className="font-semibold text-sm truncate">{p.name}</div>
                      <div className="text-slate-500 text-xs num">HCP {p.hi.toFixed(1)}</div>
                    </button>
                  ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
