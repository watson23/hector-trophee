import { EVENT_ID } from "../data/field";

/**
 * Two parallel copies of the whole event, in the same database:
 *
 *   live — the tournament. What everyone sees when they're invited.
 *   test — a sandbox with identical structure, for playing around and for trying
 *          changes while the real thing is running. It can be filled from the live
 *          data ("mirror") to reproduce the current situation safely.
 *
 * The choice is per device, so the organiser can flip one phone into the sandbox while
 * every other phone stays on the tournament. Switching reloads the app: the store,
 * cache and subscriptions are all built for one event id, and a clean restart is
 * simpler and safer than trying to swap them live.
 */
export type Space = "live" | "test" | "field";

const KEY = "hectro_space";

export function currentSpace(): Space {
  try {
    const v = localStorage.getItem(KEY);
    return v === "test" || v === "field" ? v : "live";
  } catch {
    return "live";
  }
}

export function switchSpace(space: Space): void {
  try {
    localStorage.setItem(KEY, space);
  } catch {
    /* without storage there is only ever the live space */
  }
  location.reload();
}

export function eventIdFor(space: Space): string {
  // The field space is a fully separate event for real-world test rounds
  // (Hirsala, Sep 2026) — same app, different data, nothing shared.
  if (space === "field") return "HIRSALA-FIELD";
  return space === "test" ? `${EVENT_ID}-test` : EVENT_ID;
}
