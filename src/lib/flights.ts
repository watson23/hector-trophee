import type { Pair, PlayingGroup, Round } from "../types";
import { DEFAULT_FLIGHT_COUNT, defaultGroups } from "../data/rounds";

/**
 * The round's tee-time window as it actually stands: derived from the flights
 * whenever they exist, so edited tee times show everywhere immediately. The
 * seeded `teeTimeWindow` string is only the fallback for a round with no
 * flights yet — tee times change in real life, the seed does not.
 */
export function teeWindow(round: Round): string {
  const times = round.groups.map((g) => g.teeTime).filter(Boolean).sort();
  if (times.length === 0) return round.teeTimeWindow;
  const first = times[0];
  const last = times[times.length - 1];
  return first === last ? first : `${first}–${last}`;
}

/** A flight holds at most four players — the physical size of a golf group. */
export const MAX_PER_FLIGHT = 4;

/**
 * Move a unit (a player, or a pair's two players) into one flight, out of any other.
 * Returns the new groups, or null when the target would go over four — a hard fact of
 * golf, not a preference, so callers never overfill.
 */
export function placeUnit(
  groups: PlayingGroup[],
  playerIds: string[],
  toGroupId: string | null,
): PlayingGroup[] | null {
  const next = groups.map((g) => ({ ...g, playerIds: g.playerIds.filter((id) => !playerIds.includes(id)) }));
  if (toGroupId) {
    const target = next.find((g) => g.id === toGroupId);
    if (!target || target.playerIds.length + playerIds.length > MAX_PER_FLIGHT) return null;
    target.playerIds.push(...playerIds);
  }
  return next;
}

/**
 * Which two pairs share a flight, per round.
 *
 * This used to be "pairs in draft order, two per flight" — deterministic, so every
 * round it filled came out identical, and the same four people rode together all week.
 * Now it's the circle method from round-robin scheduling: fix the first pair, rotate
 * the rest by the round number, and match from the ends of the ring. Every round gets
 * a different arrangement, no pair shares a flight with the same pair twice across the
 * five pair rounds, and re-running it for the same round gives the same answer — no
 * surprise reshuffles.
 */
export function pairFlightAssignments(pairs: Pair[], rotation: number): Pair[][] {
  if (pairs.length <= 2) return pairs.length ? [pairs] : [];
  const [anchor, ...rest] = pairs;
  const n = rest.length;
  const rot = ((rotation % n) + n) % n;
  const ring = [...rest.slice(rot), ...rest.slice(0, rot)];

  const flights: Pair[][] = [[anchor, ring[0]]];
  for (let i = 1; i < n - i; i++) flights.push([ring[i], ring[n - i]]);
  // An odd pair count leaves one over; it goes out as a two-ball.
  if (n % 2 === 0) flights.push([ring[n / 2]]);
  return flights;
}

/**
 * The assignments laid onto tee times for a round.
 *
 * Never fewer slots than the booked five: sizing the sheet to the pair count worked by
 * coincidence at ten pairs, but an auto-fill run mid-draft (five pairs → three flights)
 * overwrote the five booked tee times with three retimed ones — and a shrunken sheet
 * has nowhere to put the remaining players.
 */
export function flightsForPairs(round: Round, pairs: Pair[]): PlayingGroup[] {
  const assignments = pairFlightAssignments(pairs, round.seq);
  const groups = defaultGroups(
    round.teeTimeWindow,
    Math.max(assignments.length, DEFAULT_FLIGHT_COUNT),
  );
  assignments.forEach((flight, i) => {
    groups[i].playerIds.push(...flight.flatMap((p) => [p.aId, p.bId]));
  });
  return groups;
}
