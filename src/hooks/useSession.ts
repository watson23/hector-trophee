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

function read(): Session {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { playerId: null, unlocked: false, admin: false, ...JSON.parse(raw) };
  } catch {
    /* fall through to the default */
  }
  return { playerId: null, unlocked: false, admin: false };
}

export function useSession() {
  const [session, setSession] = useState<Session>(read);

  const update = useCallback((patch: Partial<Session>) => {
    setSession((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* private mode or full storage — the session still works, in memory */
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* same as above */
    }
    setSession({ playerId: null, unlocked: false, admin: false });
  }, []);

  return { session, update, reset };
}
