import { useCallback, useState } from "react";

/** Who this device belongs to, and what it has unlocked. Survives reloads. */
export interface Session {
  playerId: string | null;
  unlocked: boolean;
  admin: boolean;
  /** Hector TV: watching only — no PIN, no writes, no Play tab. */
  spectator?: boolean;
  /** Player ids this spectator follows; highlighted everywhere and pinned up top. */
  following?: string[];
}

const KEY = "hectro_session";
/** A signed-in player's TV peek — per tab, so a /tv tab in the browser can never
    flip an installed app (same origin, same localStorage) into TV mode. */
const PEEK_KEY = "hectro_tv_peek";

function read(): Session {
  let s: Session = { playerId: null, unlocked: false, admin: false };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) s = { ...s, ...JSON.parse(raw) };
  } catch {
    /* fall through to the default */
  }
  if (s.playerId) {
    // Spectator-ness for a player lives in this tab only; a persisted flag here is
    // leftover from before the split (or another tab) and must not stick.
    try {
      s.spectator = sessionStorage.getItem(PEEK_KEY) === "1";
    } catch {
      s.spectator = false;
    }
  }
  return s;
}

export function useSession() {
  const [session, setSession] = useState<Session>(read);

  const update = useCallback((patch: Partial<Session>) => {
    setSession((prev) => {
      const next = { ...prev, ...patch };
      try {
        // Tabs don't live-sync, so this tab's copy may be stale. Merge over what's
        // on disk — unpatched fields (TV favourites, most likely) keep the freshest
        // written value instead of being wiped by an older in-memory session.
        let stored: Partial<Session> = {};
        try {
          stored = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Session>;
        } catch {
          /* unreadable — merge over nothing */
        }
        // TV mode is per-tab (or per pure-spectator device) and must never be
        // resurrected from a legacy persisted flag.
        delete stored.spectator;
        const merged = { ...next, ...stored, ...patch };
        if (merged.playerId) {
          const { spectator, ...device } = merged;
          localStorage.setItem(KEY, JSON.stringify(device));
          if (spectator) sessionStorage.setItem(PEEK_KEY, "1");
          else sessionStorage.removeItem(PEEK_KEY);
        } else {
          localStorage.setItem(KEY, JSON.stringify(merged));
          sessionStorage.removeItem(PEEK_KEY);
        }
        return merged;
      } catch {
        /* private mode or full storage — the session still works, in memory */
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(KEY);
      sessionStorage.removeItem(PEEK_KEY);
    } catch {
      /* same as above */
    }
    setSession({ playerId: null, unlocked: false, admin: false });
  }, []);

  return { session, update, reset };
}
