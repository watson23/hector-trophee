import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  query,
  where,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  setDoc,
  deleteField,
  writeBatch,
  type Firestore,
  disableNetwork,
  enableNetwork,
} from "firebase/firestore";
import type { Card, EventDoc, Round } from "../types";
import { BACKUP_SEP, type Snapshot } from "./backup";
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

  private constructor(
    private db: Firestore,
    private eventId: string,
  ) {}

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

  static async create(eventId: string): Promise<FirestoreStore> {
    // Reuse the app across hot-module reloads; initializeApp/initializeFirestore both
    // throw if called twice for the same name.
    const app = getApps().length > 0 ? getApp() : initializeApp(config);
    const db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
    const store = new FirestoreStore(db, eventId);
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
    return doc(this.db, "events", this.eventId);
  }

  private roundsRef() {
    return collection(this.db, "events", this.eventId, "rounds");
  }

  private cardsRef() {
    return collection(this.db, "events", this.eventId, "cards");
  }

  /**
   * Make this event an exact copy of another: event doc, rounds and cards written
   * over, and any card here that the source doesn't have deleted. Server reads, so a
   * cached stale copy can't masquerade as the current tournament.
   */
  async mirrorFrom(sourceEventId: string): Promise<number> {
    const [eventSnap, roundsSnap, cardsSnap, existingCards] = await Promise.all([
      getDoc(doc(this.db, "events", sourceEventId)),
      getDocs(collection(this.db, "events", sourceEventId, "rounds")),
      getDocs(collection(this.db, "events", sourceEventId, "cards")),
      getDocs(this.cardsRef()),
    ]);
    if (!eventSnap.exists()) throw new Error(`No event ${sourceEventId} to mirror from`);

    const batch = writeBatch(this.db);
    let writes = 0;
    // The copy keeps its own identity: same PINs and players either way, but the id
    // must stay the test id or the app would think it's looking at the tournament.
    batch.set(this.eventRef(), { ...eventSnap.data(), id: this.eventId });
    writes += 1;
    for (const d of roundsSnap.docs) {
      batch.set(doc(this.roundsRef(), d.id), d.data());
      writes += 1;
    }
    const sourceCardIds = new Set(cardsSnap.docs.map((d) => d.id));
    for (const d of cardsSnap.docs) {
      batch.set(doc(this.cardsRef(), d.id), d.data());
      writes += 1;
    }
    for (const d of existingCards.docs) {
      if (!sourceCardIds.has(d.id)) {
        batch.delete(doc(this.cardsRef(), d.id));
        writes += 1;
      }
    }
    await batch.commit();
    return writes;
  }

  subscribeEvent(cb: (event: EventDoc) => void): Unsubscribe {
    return onSnapshot(
      this.eventRef(),
      (snap) => {
        if (!snap.exists()) {
          // Seed only on the server's word. The persistent cache answers first, and a
          // fresh install that opens offline gets an empty cached snapshot — seeding
          // from that would queue a default event that overwrites the real one (pairs
          // and all) when signal returns. The server snapshot follows and decides.
          if (snap.metadata.fromCache) return;
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
          // Same guard as the event doc: an empty cached snapshot is not evidence
          // that the rounds don't exist.
          if (snap.metadata.fromCache) return;
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
    ).catch(this.reportWriteError);
  }

  async setCard(
    roundId: string,
    subjectId: string,
    holes: Record<string, number>,
    by: string,
  ): Promise<void> {
    // One document write for the whole card, not eighteen. No merge: this replaces.
    await setDoc(doc(this.cardsRef(), cardId(roundId, subjectId)), {
      roundId,
      subjectId,
      holes,
      updatedAt: Date.now(),
      updatedBy: by,
    }).catch(this.reportWriteError);
  }

  async setHcpSubmitted(roundId: string, subjectId: string, submitted: boolean): Promise<void> {
    await setDoc(
      doc(this.cardsRef(), cardId(roundId, subjectId)),
      { hcpSubmitted: submitted },
      { merge: true },
    ).catch(this.reportWriteError);
  }

  async deleteCard(roundId: string, subjectId: string): Promise<void> {
    await deleteDoc(doc(this.cardsRef(), cardId(roundId, subjectId))).catch(
      this.reportWriteError,
    );
  }

  /**
   * Firestore throws on `undefined` field values — and the UI's idiom for "no
   * override" is exactly that (`crOverride: undefined`). The JSON round-trip drops
   * undefined the same way the local backend always has. Every write also reports
   * failures to the error channel instead of letting a void'd promise swallow them,
   * which is how "changing the course does nothing" stayed invisible.
   */
  private clean<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private reportWriteError = (err: unknown) => {
    const e = err as { code?: string; message?: string };
    console.error("Write failed", err);
    this.setError(describe(e.code ?? "unknown", e.message ?? String(err)));
    throw err;
  };

  async saveEvent(patch: Partial<EventDoc>): Promise<void> {
    await setDoc(this.eventRef(), this.clean(patch), { merge: true }).catch(this.reportWriteError);
  }

  async saveRound(round: Round): Promise<void> {
    // A whole round is always saved, so this is a replace, not a merge: merging could
    // never clear a removed field — switching course must drop a stale CR override.
    await setDoc(doc(this.roundsRef(), round.id), this.clean(round)).catch(this.reportWriteError);
  }

  /**
   * Snapshots as top-level `events/<eventId>__backup__<id>` documents — a path the
   * existing rules already allow, so backups work without a rules deploy. Server reads:
   * a restore must see what is really there, not a cached copy.
   */
  async listBackups(): Promise<Snapshot[]> {
    const prefix = `${this.eventId}${BACKUP_SEP}`;
    const snap = await getDocs(
      query(
        collection(this.db, "events"),
        where(documentId(), ">=", prefix),
        where(documentId(), "<", `${prefix}\uf8ff`),
      ),
    ).catch(this.reportWriteError);
    return snap.docs.map((d) => d.data() as Snapshot).sort((a, b) => b.at - a.at);
  }

  async saveBackup(snap: Snapshot): Promise<void> {
    await setDoc(doc(this.db, "events", `${this.eventId}${BACKUP_SEP}${snap.id}`), this.clean(snap)).catch(
      this.reportWriteError,
    );
  }

  async nudge(): Promise<void> {
    // Redial the backend: writes queued behind a half-dead WebChannel flush on
    // the fresh connection. Both calls are safe to fail quietly — worst case
    // nothing changes and the chip keeps showing.
    await disableNetwork(this.db).catch(() => undefined);
    await enableNetwork(this.db).catch(() => undefined);
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
