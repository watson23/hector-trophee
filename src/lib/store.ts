import type { Card, EventDoc, Round } from "../types";
import type { Snapshot } from "./backup";
import { EVENT_ID, field } from "../data/field";
import { defaultRoundsFor } from "../data/rounds";
import { hashPin } from "./pin";

/**
 * The app talks to one of two backends behind this interface.
 *
 * Firestore is used when VITE_FIREBASE_* is configured. Without it the app falls back
 * to a localStorage backend that broadcasts across tabs, so the whole UI — including
 * live sync between "phones" — can be developed and demoed with no cloud project.
 */
export type Unsubscribe = () => void;

export interface Store {
  readonly kind: "firestore" | "local";
  subscribeEvent(cb: (event: EventDoc) => void): Unsubscribe;
  subscribeRounds(cb: (rounds: Round[]) => void): Unsubscribe;
  /** All cards for the event, grouped by round id then subject id. */
  subscribeCards(cb: (byRound: Record<string, Record<string, Card>>) => void): Unsubscribe;
  /** Write one hole. `value` of null clears it. */
  setHole(
    roundId: string,
    subjectId: string,
    hole: number,
    value: number | null,
    by: string,
  ): Promise<void>;
  /**
   * Write a whole card at once, replacing whatever was there.
   *
   * Per-hole writes are right when someone is tapping a score in — they merge, so two
   * phones on the same card never clobber each other. They are the wrong tool for writing
   * eighteen holes at a time: that is 18 document writes instead of 1, which is slow to
   * flush and eats the Firestore quota. Use this for bulk work only.
   */
  setCard(roundId: string, subjectId: string, holes: Record<string, number>, by: string): Promise<void>;
  /** Remove a card entirely, rather than clearing eighteen fields one at a time. */
  deleteCard(roundId: string, subjectId: string): Promise<void>;
  /** Mark a card as entered into eBirdie/GameBook for official handicap. */
  setHcpSubmitted(roundId: string, subjectId: string, submitted: boolean): Promise<void>;
  saveEvent(patch: Partial<EventDoc>): Promise<void>;
  /** Replace a whole round document — for undo and restore, where the whole shape is meant. */
  saveRound(round: Round): Promise<void>;
  /**
   * Write only the given fields of a round. Admin edits go through here: two organisers
   * changing different fields of the same round (flights on one phone, status on another)
   * must not overwrite each other, which a whole-document replace built from a stale copy
   * would. A field set to `undefined` is removed.
   */
  patchRound(roundId: string, patch: Partial<Round>): Promise<void>;
  /** Number of writes not yet acknowledged by the server. */
  subscribePending(cb: (count: number) => void): Unsubscribe;
  /** Backend errors worth showing the user, e.g. the rules rejecting a read. */
  subscribeError(cb: (error: StoreError | null) => void): Unsubscribe;
  /**
   * Copy another event's data wholesale into this one — the "mirror the tournament
   * into the test space" button. Returns the number of documents written. Only the
   * Firestore backend implements it; the local demo backend has nothing to mirror from.
   */
  mirrorFrom?(sourceEventId: string): Promise<number>;
  /** Tear the connection down and redial — unsticks writes queued behind a
      half-dead stream (classic after a laptop sleep). No-op without a network. */
  nudge?(): Promise<void>;
  /** Whole-tournament snapshots — see lib/backup.ts. Newest first. */
  listBackups(): Promise<Snapshot[]>;
  saveBackup(snap: Snapshot): Promise<void>;
}

export interface StoreError {
  code: string;
  message: string;
  /** What the organiser can actually do about it. */
  hint: string;
}

/**
 * PINs come from the environment so they can be changed in Vercel or .env.local
 * without touching code or hand-editing hashes in Firestore. They are UI gates, not
 * secrets — see pin.ts — so shipping them in the client bundle costs nothing.
 */
/** The 2025 winners, who defend together. */
export const DEFENDING_PAIR: [string, string] = ["lasse-k", "jari-k"];

export const EVENT_PIN = import.meta.env?.VITE_EVENT_PIN || "HEC26";
export const ADMIN_PIN = import.meta.env?.VITE_ADMIN_PIN || "1874";

/** What a field-test event says about itself on the PIN screen and Info masthead. */
const FIELD_EVENTS: Record<string, Pick<EventDoc, "name" | "venue" | "dates">> = {
  "HIRSALA-FIELD": { name: "Hector field test", venue: "Hirsala Golf, Kirkkonummi", dates: "September 2026" },
  "TAPIOLA-FIELD": { name: "Hector field test", venue: "Tapiola Golf, Espoo", dates: "September 5, 2026" },
};

export async function buildDefaultEvent(eventId: string = EVENT_ID): Promise<EventDoc> {
  const fieldEvent = FIELD_EVENTS[eventId] as (typeof FIELD_EVENTS)[string] | undefined;
  return {
    id: eventId,
    name: fieldEvent?.name ?? "Hector Trophée 2026",
    venue: fieldEvent?.venue ?? "Golf & Spa Resort Konopiště, Czechia",
    dates: fieldEvent?.dates ?? "September 24–27, 2026",
    pinHash: await hashPin(EVENT_PIN),
    adminPinHash: await hashPin(ADMIN_PIN),
    players: field,
    pairs: [],
    // Lasse and Jari won in 2025.
    defendingPair: DEFENDING_PAIR,
  };
}

/**
 * Keep the stored hashes in step with the configured PINs.
 *
 * The event document is seeded once, so without this a changed VITE_EVENT_PIN would
 * silently do nothing — the surprising behaviour being that you set a new PIN, deploy,
 * and the old one still works.
 */
export async function reconcilePins(store: Store, event: EventDoc): Promise<void> {
  const [pinHash, adminPinHash] = await Promise.all([hashPin(EVENT_PIN), hashPin(ADMIN_PIN)]);
  const patch: Partial<EventDoc> = {};
  if (event.pinHash !== pinHash) patch.pinHash = pinHash;
  if (event.adminPinHash !== adminPinHash) patch.adminPinHash = adminPinHash;
  if (Object.keys(patch).length > 0) await store.saveEvent(patch);
}

/**
 * Correct rounds seeded before a scoring bug was found.
 *
 * Rounds are written to the database once and then owned by the organiser, so a fix to
 * the defaults in code never reaches an event that already exists. The draft round shipped
 * weighted 0.33; the real weight is exactly 1/3, and the 2025 spreadsheet only reproduces
 * with a third. Anything else the organiser has set is left alone — this looks for that one
 * wrong value, not for "not the default".
 */
/** Events seeded before the defending-champions rule existed don't know about it. */
export async function migrateEvent(store: Store, event: EventDoc): Promise<boolean> {
  if (event.defendingPair !== undefined) return false;
  await store.saveEvent({ defendingPair: DEFENDING_PAIR });
  return true;
}

export async function migrateRounds(store: Store, rounds: Round[]): Promise<number> {
  let fixed = 0;
  for (const round of rounds) {
    let touched = false;
    const formats = round.formats.map((f) => {
      const isOldDraftWeight =
        f.kind === "stableford" &&
        f.hector?.source === "betterIndividual" &&
        Math.abs(f.hector.pct - 0.33) < 1e-9;
      if (!isOldDraftWeight) return f;
      touched = true;
      return { ...f, hector: { ...f.hector!, pct: 1 / 3 } };
    });
    if (touched) {
      await store.saveRound({ ...round, formats });
      fixed += 1;
    }
  }
  return fixed;
}

export function cardId(roundId: string, subjectId: string): string {
  return `${roundId}__${subjectId}`;
}

// ---------------------------------------------------------------------------
// Local backend
// ---------------------------------------------------------------------------

type Listener = () => void;

class LocalStore implements Store {
  readonly kind = "local" as const;
  private listeners = new Set<Listener>();
  private channel: BroadcastChannel | null = null;
  /** Keys are per event id, so the live and test spaces stay separate in demo too. */
  private prefix: string;
  private eventId: string;

  constructor(eventId: string) {
    this.eventId = eventId;
    this.prefix = `hectro_${eventId}_`;
    if (typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel(`hectro_sync_${eventId}`);
      this.channel.onmessage = () => this.listeners.forEach((l) => l());
    }
    if (typeof window !== "undefined") {
      window.addEventListener("storage", () => this.listeners.forEach((l) => l()));
    }
  }

  private read<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(this.prefix + key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  private write(key: string, value: unknown) {
    localStorage.setItem(this.prefix + key, JSON.stringify(value));
    this.channel?.postMessage(key);
    this.listeners.forEach((l) => l());
  }

  private watch(emit: Listener): Unsubscribe {
    this.listeners.add(emit);
    emit();
    return () => this.listeners.delete(emit);
  }

  subscribeEvent(cb: (event: EventDoc) => void): Unsubscribe {
    return this.watch(() => {
      const stored = this.read<EventDoc | null>("event", null);
      if (stored) cb(stored);
      else void buildDefaultEvent(this.eventId).then((e) => this.write("event", e));
    });
  }

  subscribeRounds(cb: (rounds: Round[]) => void): Unsubscribe {
    return this.watch(() => {
      const stored = this.read<Round[] | null>("rounds", null);
      if (stored) cb(stored);
      else this.write("rounds", defaultRoundsFor(this.eventId));
    });
  }

  subscribeCards(cb: (byRound: Record<string, Record<string, Card>>) => void): Unsubscribe {
    return this.watch(() => {
      const byRound: Record<string, Record<string, Card>> = {};
      for (const round of this.read<Round[]>("rounds", defaultRoundsFor(this.eventId))) {
        byRound[round.id] = this.read<Record<string, Card>>(`cards_${round.id}`, {});
      }
      cb(byRound);
    });
  }

  async setHole(
    roundId: string,
    subjectId: string,
    hole: number,
    value: number | null,
    by: string,
  ): Promise<void> {
    const cards = this.read<Record<string, Card>>(`cards_${roundId}`, {});
    const card: Card = cards[subjectId] ?? {
      id: cardId(roundId, subjectId),
      roundId,
      subjectId,
      holes: {},
    };
    const holes = { ...card.holes };
    if (value === null) delete holes[String(hole)];
    else holes[String(hole)] = value;
    cards[subjectId] = { ...card, holes, updatedAt: Date.now(), updatedBy: by };
    this.write(`cards_${roundId}`, cards);
  }

  async setCard(
    roundId: string,
    subjectId: string,
    holes: Record<string, number>,
    by: string,
  ): Promise<void> {
    const cards = this.read<Record<string, Card>>(`cards_${roundId}`, {});
    cards[subjectId] = {
      id: cardId(roundId, subjectId),
      roundId,
      subjectId,
      holes,
      updatedAt: Date.now(),
      updatedBy: by,
    };
    this.write(`cards_${roundId}`, cards);
  }

  async deleteCard(roundId: string, subjectId: string): Promise<void> {
    const cards = this.read<Record<string, Card>>(`cards_${roundId}`, {});
    delete cards[subjectId];
    this.write(`cards_${roundId}`, cards);
  }

  async setHcpSubmitted(roundId: string, subjectId: string, submitted: boolean): Promise<void> {
    const cards = this.read<Record<string, Card>>(`cards_${roundId}`, {});
    const card = cards[subjectId];
    if (!card) return;
    cards[subjectId] = { ...card, hcpSubmitted: submitted };
    this.write(`cards_${roundId}`, cards);
  }

  async saveEvent(patch: Partial<EventDoc>): Promise<void> {
    const current = this.read<EventDoc>("event", await buildDefaultEvent(this.eventId));
    this.write("event", { ...current, ...patch });
  }

  async saveRound(round: Round): Promise<void> {
    const rounds = this.read<Round[]>("rounds", defaultRoundsFor(this.eventId));
    this.write(
      "rounds",
      rounds.map((r) => (r.id === round.id ? round : r)),
    );
  }

  async patchRound(roundId: string, patch: Partial<Round>): Promise<void> {
    const rounds = this.read<Round[]>("rounds", defaultRoundsFor(this.eventId));
    this.write(
      "rounds",
      rounds.map((r) => {
        if (r.id !== roundId) return r;
        const next: Record<string, unknown> = { ...r, ...patch };
        for (const [k, v] of Object.entries(patch)) if (v === undefined) delete next[k];
        return next as unknown as Round;
      }),
    );
  }

  async listBackups(): Promise<Snapshot[]> {
    return this.read<Snapshot[]>("backups", []).sort((a, b) => b.at - a.at);
  }

  async saveBackup(snap: Snapshot): Promise<void> {
    // localStorage is small: keep the dozen most recent.
    const all = [snap, ...this.read<Snapshot[]>("backups", [])].sort((a, b) => b.at - a.at);
    this.write("backups", all.slice(0, 12));
  }

  subscribePending(cb: (count: number) => void): Unsubscribe {
    cb(0);
    return () => {};
  }

  subscribeError(cb: (error: StoreError | null) => void): Unsubscribe {
    cb(null);
    return () => {};
  }
}

// ---------------------------------------------------------------------------
// Backend selection
// ---------------------------------------------------------------------------

export function hasFirebaseConfig(): boolean {
  return Boolean(import.meta.env?.VITE_FIREBASE_PROJECT_ID);
}

const instances = new Map<string, Promise<Store>>();

/**
 * Firestore when configured, otherwise the local cross-tab backend — one per event id,
 * so the live and test spaces each get their own store.
 *
 * The in-flight promise is memoised, not just the resolved value: two concurrent callers
 * (React StrictMode invokes effects twice in development) would both get past a
 * resolved-instance check while the first was still awaiting, and call
 * initializeFirestore() twice — which throws failed-precondition.
 */
export function getStore(eventId: string): Promise<Store> {
  let instance = instances.get(eventId);
  if (!instance) {
    instance = hasFirebaseConfig()
      ? import("./firestore").then((m) => m.FirestoreStore.create(eventId))
      : Promise.resolve(new LocalStore(eventId));
    instances.set(eventId, instance);
  }
  return instance;
}
