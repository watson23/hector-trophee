import type { EventDoc, Round } from "../types";

/** The round whose individual result sets the draft order (round 1). */
export function draftRoundOf(rounds: Round[]): Round | undefined {
  return rounds.find((r) => r.formats.some((f) => f.hector?.source === "betterIndividual"));
}

/**
 * Draft night: the draft round is final and the organiser has not yet concluded the
 * draft. While it lasts, the Round tab reads "Draft" and the board stays on screen —
 * also after the last pair is set, so the room can keep looking at the result until
 * the organiser closes it and the app returns to its round-and-tournament shape.
 */
export function isDraftNight(event: EventDoc, rounds: Round[]): boolean {
  if (event.draftConcluded) return false;
  return draftRoundOf(rounds)?.status === "final";
}
