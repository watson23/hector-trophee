import type { Card, EventDoc, Round } from "../types";
import type { Store } from "./store";

/**
 * Backups: whole-tournament snapshots, taken automatically at the moments that matter
 * (a round going final, and just before anything destructive) and by hand from Admin.
 *
 * One snapshot is one document — event, rounds and every card — so restoring is a
 * matter of choosing a moment, not reassembling pieces. A completed round can be put
 * back on its own; the whole tournament can be put back as a last resort. Restoring
 * first snapshots the current state, so a restore is itself undoable.
 *
 * Storage: the snapshots live as top-level `events/<eventId>__backup__<id>` documents.
 * That looks odd next to a `backups` subcollection, but the security rules already
 * allow signed-in writes to any `events/{id}` document, so no rules deploy stands
 * between the party and a working backup. The prefix keeps them out of the app's way:
 * nothing subscribes to them, and the app only ever opens its own event id.
 */
export interface Snapshot {
  id: string;
  eventId: string;
  /** Date.now() when taken. */
  at: number;
  /** Why: "Round 3 final", "Before clearing round 4", "Manual", "Auto". */
  reason: string;
  /** Player id of the device that took it. */
  by: string;
  event: EventDoc;
  rounds: Round[];
  cards: Card[];
}

export const BACKUP_SEP = "__backup__";

export function buildSnapshot(
  eventId: string,
  event: EventDoc,
  rounds: Round[],
  cardsByRound: Record<string, Record<string, Card>>,
  reason: string,
  by: string,
): Snapshot {
  const at = Date.now();
  const cards = Object.values(cardsByRound).flatMap((byId) => Object.values(byId));
  return {
    id: `${new Date(at).toISOString().replace(/[:.]/g, "-")}`,
    eventId,
    at,
    reason,
    by,
    event,
    rounds,
    cards,
  };
}

/** What a snapshot holds, for the list: which rounds are final, which is open, how many cards. */
export function summarize(snap: Snapshot): { finals: number[]; open: number | null; cards: number } {
  const finals = snap.rounds.filter((r) => r.status === "final").map((r) => r.seq).sort((a, b) => a - b);
  const open = snap.rounds.find((r) => r.status === "open")?.seq ?? null;
  return { finals, open, cards: snap.cards.length };
}

/** Rounds in a snapshot that have any card — the ones worth offering to restore. */
export function roundsWithCards(snap: Snapshot): Round[] {
  const withCards = new Set(snap.cards.map((c) => c.roundId));
  return snap.rounds.filter((r) => withCards.has(r.id)).sort((a, b) => a.seq - b.seq);
}

/**
 * A cheap fingerprint of the scoring state, so automatic snapshots skip when nothing
 * has changed since the last one.
 */
export function stateFingerprint(
  event: EventDoc,
  rounds: Round[],
  cardsByRound: Record<string, Record<string, Card>>,
): string {
  const cards = Object.values(cardsByRound)
    .flatMap((byId) => Object.values(byId))
    .map((c) => `${c.roundId}/${c.subjectId}:${Object.entries(c.holes).sort().map(([h, v]) => `${h}=${v}`).join(",")}`)
    .sort()
    .join("|");
  const status = rounds.map((r) => `${r.id}:${r.status}`).join(",");
  const pairs = event.pairs.map((p) => `${p.aId}+${p.bId}`).join(",");
  return `${status}#${pairs}#${cards}`;
}

/**
 * Put one round back the way the snapshot has it: the round document (status,
 * handicaps, groups) and its cards — cards the snapshot doesn't know are removed.
 */
export async function restoreRound(
  store: Store,
  snap: Snapshot,
  roundId: string,
  currentCards: Record<string, Card>,
  by: string,
): Promise<void> {
  const round = snap.rounds.find((r) => r.id === roundId);
  if (!round) throw new Error(`Snapshot has no round ${roundId}`);
  const cards = snap.cards.filter((c) => c.roundId === roundId);
  const keep = new Set(cards.map((c) => c.subjectId));
  const remove = Object.values(currentCards)
    .map((c) => c.subjectId)
    .filter((id) => !keep.has(id));
  // One batched write: round, cards and removals land together or not at all.
  await store.restoreRound(round, cards, remove, by);
}

/** The whole tournament back to the snapshot: pairs and draft state, every round, every card. */
export async function restoreAll(
  store: Store,
  snap: Snapshot,
  currentCards: Record<string, Record<string, Card>>,
  by: string,
): Promise<void> {
  const { pairs, defendingPair, draftConcluded } = snap.event;
  await store.saveEvent({ pairs, defendingPair: defendingPair ?? null, draftConcluded: draftConcluded ?? false });
  for (const round of snap.rounds) {
    await restoreRound(store, snap, round.id, currentCards[round.id] ?? {}, by);
  }
}

/** A snapshot as a file the organiser can keep outside the database. */
export function snapshotFile(snap: Snapshot): File {
  const name = `${snap.eventId}-backup-${snap.id}.json`;
  return new File([JSON.stringify(snap, null, 2)], name, { type: "application/json" });
}
