import { useEffect, useState } from "react";
import HectorMark from "./HectorMark";

const KEY = "hectro_welcomed";

const words: Record<number, string> = { 4: "Four", 5: "Five", 6: "Six", 7: "Seven" };

/** Which players this phone has already welcomed — one greeting per person per device. */
function welcomed(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function needsWelcome(playerId: string): boolean {
  return !welcomed().includes(playerId);
}

/** Forget the greeting for one player on this phone, so it plays once more. */
export function forgetWelcome(playerId: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(welcomed().filter((id) => id !== playerId)));
  } catch {
    /* no storage: nothing to forget */
  }
}

function markWelcomed(playerId: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...new Set([...welcomed(), playerId])]));
  } catch {
    /* no storage: they will be welcomed again, which is not the worst thing */
  }
}

/**
 * The first thing a player sees after picking their name, once per phone: a warm
 * hello before the Play tab's plain front page. The falcon lands, the name comes up,
 * the postcard of Konopiště fades in, one line says what the app is for, and a single
 * button lets them through. Two movements: the falcon lands and the title follows, then a
 * breath; then the name, the place, the text and the button flow in 0.7 s apart, each a
 * slow one-second reveal (the slow reveals are what looked good; the quick ones did not).
 * Button at 5.3 s. With reduced motion everything is there.
 */
export default function Welcome({
  name,
  playerId,
  venue,
  dates,
  rounds,
  onDone,
}: {
  name: string;
  playerId: string;
  venue: string;
  dates: string;
  rounds: number;
  onDone: () => void;
}) {
  const first = name.split(" ")[0];
  // Lock the page behind it while it is up.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  const [leaving, setLeaving] = useState(false);
  const done = () => {
    markWelcomed(playerId);
    setLeaving(true);
    // Let the fade play before the Play tab takes over.
    setTimeout(onDone, 350);
  };

  return (
    <div
      role="dialog"
      aria-label={`Welcome, ${first}`}
      className={`fixed inset-0 z-50 bg-slate-950 flex flex-col overflow-hidden ${leaving ? "welcome-out" : ""}`}
    >
      {/* The postcard, full-bleed behind everything, rising out of black. */}
      <div className="welcome-photo absolute inset-x-0 top-0 h-[58dvh]">
        <img src="/courses/vista.webp" alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/40 via-slate-950/10 to-slate-950" />
      </div>

      <div className="relative flex-1 flex flex-col justify-end px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(3rem,env(safe-area-inset-top))]">
        <div className="flex-1" />
        <HectorMark className="welcome-mark w-16 h-16 text-gold-400 mb-5" />
        <p className="welcome-step text-[12px] font-semibold uppercase tracking-[0.28em] text-gold-400" style={{ animationDelay: "1600ms" }}>
          Hector Trophée 2026
        </p>
        <h1 className="welcome-step font-serif text-[44px] leading-[1.05] font-semibold mt-2" style={{ animationDelay: "3200ms" }}>
          Welcome, {first}.
        </h1>
        {/* Where and when, on its own beat, in the postcard-caption voice. */}
        <p className="welcome-step num text-[12px] tracking-[0.14em] uppercase text-slate-400 mt-4" style={{ animationDelay: "3900ms" }}>
          {venue} · {dates.replace(/,?\s*\d{4}\s*$/, "")}
        </p>
        <p className="welcome-step text-slate-300 text-[15px] leading-relaxed mt-3 max-w-sm" style={{ animationDelay: "5300ms" }}>
          World's best amateur golfers clash once again. {words[rounds] ?? rounds} rounds on two courses, two
          trophies, and one week to decide who carries the Hector home. Your card, your flight and the standings
          are all in here. You just need to hit the shots. Good luck!
        </p>
        <button
          onClick={done}
          className="welcome-step btn-primary w-full py-4 text-lg mt-7"
          style={{ animationDelay: "4600ms" }}
        >
          Let's go →
        </button>
      </div>
    </div>
  );
}
