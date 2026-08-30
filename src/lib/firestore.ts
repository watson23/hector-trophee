import { getApp, getApps, initializeApp } from "firebase/app";
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
import {
  buildDefaultEvent,
  cardId,
  type Store,
  type StoreError,
  type Unsubscribe,
} from "./store";

/** Turn a Firebase error code into something the organiser can act on. */
function describe(code: string, message: string): StoreError {
  switch (code) {
    case "permission-denied":
      return {
        code,
        message: "The database refused the request.",
        hint: "Deploy the security rules: firebase deploy --only firestore:rules",
      };
    case "auth/configuration-not-found":
    case "auth/operation-not-allowed":
      return {
        code,
        message: "Anonymous sign-in isn't enabled for this Firebase project.",
        hint: "Firebase console \u2192 Authentication \u2192 Sign-in method \u2192 enable Anonymous.",
      };
    case "auth/unauthorized-domain":
      return {
        code,
        message: `Sign-in is blocked from ${location.hostname}.`,
        hint: "Firebase console \u2192 Authentication \u2192 Settings \u2192 Authorized domains \u2192 add this domain.",
      };
    case "unavailable":
      return {
        code,
        message: "Can't reach the database.",
        hint: "Usually just signal. Scores you enter are saved and will sync.",
      };
    default:
      return { code, message, hint: "Check the browser console for details." };
  }
}

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
  private error: StoreError | null = null;
  private errorListeners = new Set<(e: StoreError | null) => void>();

  private constructor(private db: Firestore) {}

  private setError(error: StoreError | null) {
    // Keep the first real problem: later snapshots failing for the same reason
    // shouldn't overwrite the message that explains it.
    if (error && this.error) return;
    this.error = error;
    this.errorListeners.forEach((l) => l(error));
  }

  /** onSnapshot's error callback, wired the same way for every collection. */
  private onSnapshotError = (err: unknown) => {
    const e = err as { code?: string; message?: string };
    this.setError(describe(e.code ?? "unknown", e.message ?? String(err)));
  };

  static async create(): Promise<FirestoreStore> {
    // Reuse the app across hot-module reloads; initializeApp/initializeFirestore both
    // throw if called twice for the same name.
    const app = getApps().length > 0 ? getApp() : initializeApp(config);
    const db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
    const store = new FirestoreStore(db);
    try {
      await signInAnonymously(getAuth(app));
    } catch (err) {
      // Not fatal on its own — the rules could allow unauthenticated access — but it is
      // the usual cause of the permission-denied that follows, so keep it as the
      // explanation rather than letting a vaguer error win.
      const e = err as { code?: string; message?: string };
      console.warn("Anonymous sign-in failed", err);
      store.setError(describe(e.code ?? "unknown", e.message ?? String(err)));
    }
    return store;
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
    return onSnapshot(
      this.eventRef(),
      (snap) => {
        if (!snap.exists()) {
          void buildDefaultEvent().then((e) => setDoc(this.eventRef(), e));
          return;
        }
        this.setError(null);
        cb({ ...(snap.data() as EventDoc), id: snap.id });
      },
      this.onSnapshotError,
    );
  }

  subscribeRounds(cb: (rounds: Round[]) => void): Unsubscribe {
    return onSnapshot(
      this.roundsRef(),
      (snap) => {
        if (snap.empty) {
          void Promise.all(defaultRounds.map((r) => setDoc(doc(this.roundsRef(), r.id), r)));
          return;
        }
        const rounds = snap.docs
          .map((d) => ({ ...(d.data() as Round), id: d.id }))
          .sort((a, b) => a.seq - b.seq);
        cb(rounds);
      },
      this.onSnapshotError,
    );
  }

  subscribeCards(cb: (byRound: Record<string, Record<string, Card>>) => void): Unsubscribe {
    // One listener over the whole (small) cards collection rather than one per round.
    return onSnapshot(
      this.cardsRef(),
      { includeMetadataChanges: true },
      (snap) => {
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
      },
      this.onSnapshotError,
    );
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

  subscribeError(cb: (error: StoreError | null) => void): Unsubscribe {
    this.errorListeners.add(cb);
    cb(this.error);
    return () => this.errorListeners.delete(cb);
  }
}
