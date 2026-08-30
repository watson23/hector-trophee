import type { Card, EventDoc, Round } from "../types";
import { EVENT_ID, field } from "../data/field";
import { defaultRounds } from "../data/rounds";
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
  saveEvent(patch: Partial<EventDoc>): Promise<void>;
  saveRound(round: Round): Promise<void>;
  /** Number of writes not yet acknowledged by the server. */
  subscribePending(cb: (count: number) => void): Unsubscribe;
  /** Backend errors worth showing the user, e.g. the rules rejecting a read. */
  subscribeError(cb: (error: StoreError | null) => void): Unsubscribe;
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
export const EVENT_PIN = import.meta.env?.VITE_EVENT_PIN || "HEC26";
export const ADMIN_PIN = import.meta.env?.VITE_ADMIN_PIN || "1874";

export async function buildDefaultEvent(): Promise<EventDoc> {
  return {
    id: EVENT_ID,
    name: "Hector Trophée 2026",
    venue: "Golf & Spa Resort Konopiště, Czechia",
    dates: "September 24–27, 2026",
    pinHash: await hashPin(EVENT_PIN),
    adminPinHash: await hashPin(ADMIN_PIN),
    players: field,
    pairs: [],
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

export function cardId(roundId: string, subjectId: string): string {
  return `${roundId}__${subjectId}`;
}

// ---------------------------------------------------------------------------
// Local backend
// ---------------------------------------------------------------------------

const LS_PREFIX = "hectro_";
const CHANNEL = "hectro_sync";

type Listener = () => void;

class LocalStore implements Store {
  readonly kind = "local" as const;
  private listeners = new Set<Listener>();
  private channel: BroadcastChannel | null = null;

  constructor() {
    if (typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel(CHANNEL);
      this.channel.onmessage = () => this.listeners.forEach((l) => l());
    }
    if (typeof window !== "undefined") {
      window.addEventListener("storage", () => this.listeners.forEach((l) => l()));
    }
  }

  private read<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(LS_PREFIX + key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  private write(key: string, value: unknown) {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
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
      else void buildDefaultEvent().then((e) => this.write("event", e));
    });
  }

  subscribeRounds(cb: (rounds: Round[]) => void): Unsubscribe {
    return this.watch(() => {
      const stored = this.read<Round[] | null>("rounds", null);
      if (stored) cb(stored);
      else this.write("rounds", defaultRounds);
    });
  }

  subscribeCards(cb: (byRound: Record<string, Record<string, Card>>) => void): Unsubscribe {
    return this.watch(() => {
      const byRound: Record<string, Record<string, Card>> = {};
      for (const round of this.read<Round[]>("rounds", defaultRounds)) {
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

  async saveEvent(patch: Partial<EventDoc>): Promise<void> {
    const current = this.read<EventDoc>("event", await buildDefaultEvent());
    this.write("event", { ...current, ...patch });
  }

  async saveRound(round: Round): Promise<void> {
    const rounds = this.read<Round[]>("rounds", defaultRounds);
    this.write(
      "rounds",
      rounds.map((r) => (r.id === round.id ? round : r)),
    );
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

let instancePromise: Promise<Store> | null = null;

/**
 * Firestore when configured, otherwise the local cross-tab backend.
 *
 * The in-flight promise is memoised, not just the resolved value: two concurrent callers
 * (React StrictMode invokes effects twice in development) would both get past a
 * resolved-instance check while the first was still awaiting, and call
 * initializeFirestore() twice — which throws failed-precondition.
 */
export function getStore(): Promise<Store> {
  instancePromise ??= hasFirebaseConfig()
    ? import("./firestore").then((m) => m.FirestoreStore.create())
    : Promise.resolve(new LocalStore());
  return instancePromise;
}
