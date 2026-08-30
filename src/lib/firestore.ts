import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import {
  collection,
  doc,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  setDoc,
  deleteField,
  type Firestore,
} from "firebase/firestore";
import type { Card, EventDoc, Round } from "../types";
import { EVENT_ID } from "../data/field";
import { defaultRounds } from "../data/rounds";
import { buildDefaultEvent, cardId, type Store, type Unsubscribe } from "./store";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/**
 * Firestore backend.
 *
 * Persistent local cache is the whole point on a Czech golf course: writes land locally
 * and flush when signal comes back, and `hasPendingWrites` drives the offline banner.
 */
export class FirestoreStore implements Store {
  readonly kind = "firestore" as const;
  private pendingCount = 0;
  private pendingListeners = new Set<(n: number) => void>();

  private constructor(private db: Firestore) {}

  static async create(): Promise<FirestoreStore> {
    const app = initializeApp(config);
    const db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
    try {
      await signInAnonymously(getAuth(app));
    } catch (err) {
      // Anonymous auth may be disabled in the console; the app still works if the
      // Firestore rules allow unauthenticated access. Surfaced rather than swallowed.
      console.warn("Anonymous sign-in failed", err);
    }
    return new FirestoreStore(db);
  }

  private eventRef() {
    return doc(this.db, "events", EVENT_ID);
  }

  private roundsRef() {
    return collection(this.db, "events", EVENT_ID, "rounds");
  }

  private cardsRef() {
    return collection(this.db, "events", EVENT_ID, "cards");
  }

  subscribeEvent(cb: (event: EventDoc) => void): Unsubscribe {
    return onSnapshot(this.eventRef(), (snap) => {
      if (!snap.exists()) {
        void buildDefaultEvent().then((e) => setDoc(this.eventRef(), e));
        return;
      }
      cb({ ...(snap.data() as EventDoc), id: snap.id });
    });
  }

  subscribeRounds(cb: (rounds: Round[]) => void): Unsubscribe {
    return onSnapshot(this.roundsRef(), (snap) => {
      if (snap.empty) {
        void Promise.all(defaultRounds.map((r) => setDoc(doc(this.roundsRef(), r.id), r)));
        return;
      }
      const rounds = snap.docs
        .map((d) => ({ ...(d.data() as Round), id: d.id }))
        .sort((a, b) => a.seq - b.seq);
      cb(rounds);
    });
  }

  subscribeCards(cb: (byRound: Record<string, Record<string, Card>>) => void): Unsubscribe {
    // One listener over the whole (small) cards collection rather than one per round.
    return onSnapshot(this.cardsRef(), { includeMetadataChanges: true }, (snap) => {
      const byRound: Record<string, Record<string, Card>> = {};
      let pending = 0;
      for (const d of snap.docs) {
        const card = { ...(d.data() as Card), id: d.id };
        (byRound[card.roundId] ??= {})[card.subjectId] = card;
        if (d.metadata.hasPendingWrites) pending += 1;
      }
      this.pendingCount = pending;
      this.pendingListeners.forEach((l) => l(pending));
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
    // setDoc + merge deep-merges the `holes` map, so two phones writing different holes
    // on the same card never clobber each other — and unlike updateDoc it also creates
    // the document, which matters offline where a failed update would only surface later.
    await setDoc(
      doc(this.cardsRef(), cardId(roundId, subjectId)),
      {
        roundId,
        subjectId,
        holes: { [String(hole)]: value === null ? deleteField() : value },
        updatedAt: Date.now(),
        updatedBy: by,
      },
      { merge: true },
    );
  }

  async saveEvent(patch: Partial<EventDoc>): Promise<void> {
    await setDoc(this.eventRef(), patch, { merge: true });
  }

  async saveRound(round: Round): Promise<void> {
    await setDoc(doc(this.roundsRef(), round.id), round, { merge: true });
  }

  subscribePending(cb: (count: number) => void): Unsubscribe {
    this.pendingListeners.add(cb);
    cb(this.pendingCount);
    return () => this.pendingListeners.delete(cb);
  }
}
