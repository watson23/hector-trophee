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
export type Space = "live" | "test";

/** Every space the app knows, in the order Admin lists them. */
export const SPACES: {
  id: Space;
  label: string;
  description: string;
  tone: "live" | "test";
  /**
   * Typed on the event-code screen, this word moves the device into the space — the
   * way into a field event for a copy of the app the invite link can't reach (an
   * installed one), without organiser access. The tournament needs no word.
   */
  code?: string;
}[] = [
  {
    id: "live",
    label: "Tournament",
    description: "The real data everyone sees at Konopiště.",
    tone: "live",
    code: "KONOPISTE",
  },
  {
    id: "test",
    label: "Test sandbox",
    description: "Same structure as the tournament, separate data — for playing around and for mirroring the live event.",
    tone: "test",
    code: "SANDBOX",
  },
];

/** The space a typed code names, if any — case-insensitive, whitespace ignored. */
export function spaceForCode(input: string): Space | null {
  const word = input.trim().toUpperCase();
  return SPACES.find((s) => s.code === word)?.id ?? null;
}

export function spaceMeta(space: Space) {
  return SPACES.find((s) => s.id === space) ?? SPACES[0];
}

const KEY = "hectro_space";

const isSpace = (v: string | null): v is Space => SPACES.some((s) => s.id === v);

export function currentSpace(): Space {
  try {
    // A shared link can carry the space — app.hector.golf/?space=field — so a test
    // user lands in the field event without needing the organiser PIN to switch.
    // The choice is stored for the device and the parameter dropped from the URL.
    const params = new URLSearchParams(location.search);
    const fromLink = params.get("space");
    if (isSpace(fromLink)) {
      localStorage.setItem(KEY, fromLink);
      params.delete("space");
      const qs = params.toString();
      history.replaceState(null, "", `${location.pathname}${qs ? `?${qs}` : ""}${location.hash}`);
      return fromLink;
    }
    const v = localStorage.getItem(KEY);
    return isSpace(v) ? v : "live";
  } catch {
    return "live";
  }
}

/** The link that puts another phone into a space — for inviting a tester. */
export function spaceLink(space: Space): string {
  return `${location.origin}/?space=${space}`;
}

const SWITCHED_KEY = "hectro_space_switched";

export function switchSpace(space: Space): void {
  try {
    localStorage.setItem(KEY, space);
    // The reload lands on a screen that looks just like the one before it; this lets
    // that screen say the move happened. Session-scoped: it is about this one reload.
    sessionStorage.setItem(SWITCHED_KEY, space);
  } catch {
    /* without storage there is only ever the live space */
  }
  location.reload();
}

/** The space this page was just moved into by a code word, or null. Cleared separately. */
export function peekJustSwitched(): Space | null {
  try {
    const v = sessionStorage.getItem(SWITCHED_KEY);
    return isSpace(v) ? v : null;
  } catch {
    return null;
  }
}

export function clearJustSwitched(): void {
  try {
    sessionStorage.removeItem(SWITCHED_KEY);
  } catch {
    /* nothing stored, nothing to clear */
  }
}

export function eventIdFor(space: Space): string {
  return space === "test" ? `${EVENT_ID}-test` : EVENT_ID;
}
