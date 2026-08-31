import { useCallback, useState } from "react";

/**
 * useState that survives a refresh.
 *
 * Pull-to-refresh used to dump you back on Play → hole 1 wherever you were — mid-round
 * on the 14th, or halfway down the Victor table. Every piece of "where was I" state goes
 * through this instead.
 *
 * `local` is for stable preferences (which tab, hole-by-hole vs scorecard) that should
 * also survive the PWA being relaunched. `session` is for choices that are only right
 * for now (which round you were browsing): a refresh keeps them, but a fresh launch the
 * next morning follows the live round again instead of yesterday's.
 */
export function usePersistentState<T>(
  key: string,
  initial: T,
  scope: "local" | "session" = "local",
): [T, (value: T | ((prev: T) => T)) => void] {
  const storage = () => (scope === "local" ? localStorage : sessionStorage);

  const [value, setValue] = useState<T>(() => {
    try {
      const raw = storage().getItem(key);
      if (raw !== null) return JSON.parse(raw) as T;
    } catch {
      /* private mode, quota, corrupt JSON — the default is always safe */
    }
    return initial;
  });

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        try {
          storage().setItem(key, JSON.stringify(resolved));
        } catch {
          /* fine — worst case the state is back to in-memory only */
        }
        return resolved;
      });
    },
    [key, scope],
  );

  return [value, set];
}
