import type { Card, EventDoc, Pair, Round } from "../types";
import { courses } from "../data/courses";
import { effectiveTee, evaluateRound } from "../lib/engine";
import { defaultGroups } from "../data/rounds";
import { generateRoundCards } from "./testdata";

/**
 * Plays a whole tournament, so trying the app out doesn't mean twenty taps to enter a
 * draft first. Everything it writes goes through the same store calls the UI uses.
 *
 * The draft is run properly rather than paired arbitrarily: round 1 is played first, its
 * Stableford order decides who picks, and each player in turn takes the best available
 * player from the other bucket — which is what happens on the Thursday night.
 */
export interface SimulateDeps {
  event: EventDoc;
  rounds: Round[];
  setCard: (roundId: string, subjectId: string, holes: Record<string, number>) => Promise<void>;
  deleteCard: (roundId: string, subjectId: string) => Promise<void>;
  saveEvent: (patch: Partial<EventDoc>) => Promise<void>;
  saveRound: (round: Round) => Promise<void>;
  onProgress?: (message: string) => void;
}

/** Everyone in one flight per four, in field order. */
function flightsForAll(round: Round, event: EventDoc): Round["groups"] {
  const groups = defaultGroups(round.teeTimeWindow, Math.ceil(event.players.length / 4));
  event.players.forEach((p, i) => groups[Math.floor(i / 4)].playerIds.push(p.id));
  return groups;
}

/** Two pairs to a flight, so both cards of a team round travel together. */
function flightsForPairs(round: Round, pairs: Pair[]): Round["groups"] {
  const groups = defaultGroups(round.teeTimeWindow, Math.ceil(pairs.length / 2));
  pairs.forEach((pair, i) => {
    const g = groups[Math.floor(i / 2)] ?? groups[groups.length - 1];
    g.playerIds.push(pair.aId, pair.bId);
  });
  return groups;
}

async function writeCards(round: Round, event: EventDoc, deps: SimulateDeps, holes: number) {
  const course = courses[round.courseId];
  const cards = generateRoundCards(round, course, effectiveTee(round, course), event, holes);
  // One write per card rather than one per hole: 100 writes for a tournament, not 1800.
  await Promise.all(cards.map((c) => deps.setCard(round.id, c.subjectId, c.holes)));
  return cards;
}

/** Rebuild the round-1 result from the cards just written, to get the draft order. */
function draftOrder(round: Round, event: EventDoc, cards: { subjectId: string; holes: Record<string, number> }[]) {
  const course = courses[round.courseId];
  const asCards: Record<string, Card> = {};
  for (const c of cards) {
    asCards[c.subjectId] = { id: c.subjectId, roundId: round.id, subjectId: c.subjectId, holes: c.holes };
  }
  const result = evaluateRound({
    round,
    course,
    tee: effectiveTee(round, course),
    players: event.players,
    pairs: [],
    cards: asCards,
  });
  const stableford = result.formats.find((f) => f.spec.kind === "stableford");
  return [...(stableford?.players ?? [])].sort((a, b) => b.value - a.value).map((p) => p.playerId);
}

/** The draft: best player picks first, from the opposite bucket. */
export function draftPairs(order: string[], event: EventDoc): Pair[] {
  const byId = new Map(event.players.map((p) => [p.id, p]));
  const taken = new Set<string>();
  const pairs: Pair[] = [];
  for (const pickerId of order) {
    if (taken.has(pickerId)) continue;
    const picker = byId.get(pickerId);
    if (!picker) continue;
    // Best available from the other bucket, by the same round-1 order.
    const partnerId = order.find(
      (id) => !taken.has(id) && id !== pickerId && byId.get(id)?.bucket !== picker.bucket,
    );
    if (!partnerId) continue;
    taken.add(pickerId);
    taken.add(partnerId);
    pairs.push({ id: `pair-${pairs.length + 1}-${pickerId}`, aId: pickerId, bId: partnerId });
  }
  return pairs;
}

export async function simulateTournament(deps: SimulateDeps, holesInLastRound = 18) {
  const { event, rounds, saveEvent, saveRound, onProgress } = deps;
  const [first, ...rest] = rounds;
  if (!first) return;

  onProgress?.("Playing round 1…");
  const r1 = { ...first, groups: flightsForAll(first, event), status: "final" as const };
  await saveRound(r1);
  const r1Cards = await writeCards(r1, event, deps, 18);

  onProgress?.("Running the draft…");
  const pairs = draftPairs(draftOrder(r1, event, r1Cards), event);
  await saveEvent({ pairs });
  const withPairs: EventDoc = { ...event, pairs };

  for (const round of rest) {
    onProgress?.(`Playing round ${round.seq}…`);
    const holes = round.seq === rounds.length ? holesInLastRound : 18;
    const next = {
      ...round,
      groups: flightsForPairs(round, pairs),
      status: (holes >= 18 ? "final" : "open") as Round["status"],
    };
    await saveRound(next);
    await writeCards(next, withPairs, deps, holes);
  }
  onProgress?.(null as unknown as string);
}

/** Back to a clean event: no scores, no pairs, every round upcoming. */
export async function resetTournament(deps: SimulateDeps, cards: Record<string, Record<string, Card>>) {
  const { rounds, saveEvent, saveRound, deleteCard, onProgress } = deps;
  onProgress?.("Clearing scores…");
  for (const round of rounds) {
    await Promise.all(
      Object.values(cards[round.id] ?? {}).map((c) => deleteCard(round.id, c.subjectId)),
    );
    await saveRound({ ...round, status: "upcoming", groups: defaultGroups(round.teeTimeWindow) });
  }
  await saveEvent({ pairs: [] });
  onProgress?.(null as unknown as string);
}
