import { useCallback, useState } from "react";

/** Who this device belongs to, and what it has unlocked. Survives reloads. */
export interface Session {
  playerId: string | null;
  unlocked: boolean;
  admin: boolean;
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
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    localStorage.removeItem(KEY);
    setSession({ playerId: null, unlocked: false, admin: false });
  }, []);

  return { session, update, reset };
}
