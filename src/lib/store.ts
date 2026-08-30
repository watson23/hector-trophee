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
}

export const DEFAULT_EVENT_PIN = "HEC26";
export const DEFAULT_ADMIN_PIN = "1874";

export async function buildDefaultEvent(): Promise<EventDoc> {
  return {
    id: EVENT_ID,
    name: "Hector Trophée 2026",
    venue: "Golf & Spa Resort Konopiště, Czechia",
    dates: "September 24–27, 2026",
    pinHash: await hashPin(DEFAULT_EVENT_PIN),
    adminPinHash: await hashPin(DEFAULT_ADMIN_PIN),
    players: field,
    pairs: [],
  };
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
}

// ---------------------------------------------------------------------------
// Backend selection
// ---------------------------------------------------------------------------

export function hasFirebaseConfig(): boolean {
  return Boolean(import.meta.env?.VITE_FIREBASE_PROJECT_ID);
}

let instance: Store | null = null;

/** Firestore when configured, otherwise the local cross-tab backend. */
export async function getStore(): Promise<Store> {
  if (instance) return instance;
  if (hasFirebaseConfig()) {
    const { FirestoreStore } = await import("./firestore");
    instance = await FirestoreStore.create();
  } else {
    instance = new LocalStore();
  }
  return instance;
}
