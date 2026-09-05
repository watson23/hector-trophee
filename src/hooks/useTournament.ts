import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Card, EventDoc, Round, UsageDay } from "../types";
import { courses } from "../data/courses";
import { computeTournament, effectiveTee, evaluateRound, snapshotHandicaps, type RoundResult } from "../lib/engine";
import {
  getStore,
  migrateEvent,
  migrateRounds,
  reconcilePins,
  type Store,
  type StoreError,
} from "../lib/store";
import { buildSnapshot, restoreAll, restoreRound, stateFingerprint, type Snapshot } from "../lib/backup";
import type { BackupApi } from "../screens/BackupAdmin";

export interface TournamentState {
  ready: boolean;
  backend: Store["kind"] | null;
  event: EventDoc | null;
  rounds: Round[];
  cards: Record<string, Record<string, Card>>;
  roundResults: Record<string, RoundResult>;
  hector: ReturnType<typeof computeTournament>["hector"];
  victor: ReturnType<typeof computeTournament>["victor"];
  /** Positions gained (+) / lost (−) per pair against the standings before the open round. */
  hectorMovement: Record<string, number>;
  pending: number;
  online: boolean;
  error: StoreError | null;
  setHole: (roundId: string, subjectId: string, hole: number, value: number | null) => void;
  setCard: (roundId: string, subjectId: string, holes: Record<string, number>) => Promise<void>;
  deleteCard: (roundId: string, subjectId: string) => Promise<void>;
  setHcpSubmitted: (roundId: string, subjectId: string, submitted: boolean) => Promise<void>;
  saveEvent: (patch: Partial<EventDoc>) => Promise<void>;
  saveRound: (round: Round) => Promise<void>;
  /** Write only these fields of a round — what every Admin edit should use. */
  patchRound: (roundId: string, patch: Partial<Round>) => Promise<void>;
  /** Copy another event's data wholesale into this one; null when the backend can't. */
  mirrorFrom: ((sourceEventId: string) => Promise<number>) | null;
  /** Redial the backend to unstick writes queued behind a stale connection. */
  nudge: (() => Promise<void>) | undefined;
  /** Usage bookkeeping: opens and tab views per player per day, for the organiser's curiosity. */
  usage: {
    /** Call once per app open (per session). */
    open: () => void;
    /** A tab shown; batched and flushed every 30 s, or when the app goes to the background. */
    view: (tab: string) => void;
    list: () => Promise<UsageDay[]>;
  };
  /** Snapshots of the whole tournament — see lib/backup.ts. */
  backups: BackupApi & {
    /** Like take(), but skips when nothing has changed since the last automatic one. */
    takeIfChanged: (reason: string) => Promise<Snapshot | null>;
  };
}

/**
 * Single subscription point for the whole app: event, rounds and every card, run
 * through the scoring engine to produce per-round results and the running totals.
 */
/**
 * The store reports every failed write on its error channel (the banner) and then
 * rethrows; at this boundary the rethrow is swallowed, so a failure surfaces once —
 * not also as an unhandled rejection from a fire-and-forget Admin button.
 */
const swallow = () => {};

export function useTournament(identity: string, eventId: string): TournamentState {
  const [store, setStore] = useState<Store | null>(null);
  const [event, setEvent] = useState<EventDoc | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [cards, setCards] = useState<Record<string, Record<string, Card>>>({});
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<StoreError | null>(null);
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    let cancelled = false;
    void getStore(eventId).then((s) => {
      if (!cancelled) setStore(s);
    });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  useEffect(() => {
    if (!store) return;
    const unsubs = [
      store.subscribeEvent(setEvent),
      store.subscribeRounds(setRounds),
      store.subscribeCards(setCards),
      store.subscribePending(setPending),
      store.subscribeError(setError),
    ];
    return () => unsubs.forEach((u) => u());
  }, [store]);

  // Make a changed VITE_EVENT_PIN / VITE_ADMIN_PIN take effect on an already-seeded event.
  const pinsReconciled = useRef(false);
  useEffect(() => {
    if (!store || !event || pinsReconciled.current) return;
    pinsReconciled.current = true;
    void reconcilePins(store, event);
    void migrateEvent(store, event);
  }, [store, event]);

  // Same problem for round config: seeded once, so a fix in code never reaches an
  // event that already exists.
  const roundsMigrated = useRef(false);
  useEffect(() => {
    if (!store || rounds.length === 0 || roundsMigrated.current) return;
    roundsMigrated.current = true;
    void migrateRounds(store, rounds).then((n) => {
      if (n > 0) console.info(`Corrected the draft-round weight on ${n} round(s) to 1/3.`);
    });
  }, [store, rounds]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const roundResults = useMemo(() => {
    if (!event) return {};
    const out: Record<string, RoundResult> = {};
    for (const round of rounds) {
      const course = courses[round.courseId];
      if (!course) continue;
      out[round.id] = evaluateRound({
        round,
        course,
        tee: effectiveTee(round, course),
        players: event.players,
        pairs: event.pairs,
        cards: cards[round.id] ?? {},
      });
    }
    return out;
  }, [event, rounds, cards]);

  const totals = useMemo(() => {
    if (!event) return { hector: [], victor: [], rounds: [] };
    return computeTournament(
      rounds.map((r) => roundResults[r.id]).filter(Boolean),
      event.players,
      event.pairs,
    );
  }, [event, rounds, roundResults]);

  /**
   * Where each pair stood before the round now being played, as positions gained/lost —
   * so the Hector table can show who's climbing while a round is live. Derived, not
   * stored: the baseline is simply the tournament scored without the open round's cards.
   */
  const hectorMovement = useMemo<Record<string, number>>(() => {
    if (!event) return {};
    const open = rounds.find(
      (r) => r.status === "open" && r.formats.some((f) => f.hector),
    );
    const course = open ? courses[open.courseId] : null;
    if (!open || !course) return {};
    const withoutOpen = rounds
      .map((r) =>
        r.id === open.id
          ? evaluateRound({
              round: open,
              course,
              tee: effectiveTee(open, course),
              players: event.players,
              pairs: event.pairs,
              cards: {},
            })
          : roundResults[r.id],
      )
      .filter(Boolean);
    const before = computeTournament(withoutOpen, event.players, event.pairs).hector;
    const position = (list: typeof before) => {
      const played = list.filter((r) => r.roundsPlayed > 0);
      // To par, like the table itself — totals would rank early flights last mid-round.
      const sorted = [...played].sort((a, b) => a.toPar - b.toPar);
      return new Map(sorted.map((r, i) => [r.key, i + 1]));
    };
    const was = position(before);
    const now = position(totals.hector);
    const out: Record<string, number> = {};
    for (const [key, pos] of now) {
      const prev = was.get(key);
      if (prev !== undefined) out[key] = prev - pos;
    }
    return out;
  }, [event, rounds, roundResults, totals.hector]);

  // The latest state, readable from callbacks without re-creating them on every change.
  const latest = useRef({ event, rounds, cards });
  useEffect(() => {
    latest.current = { event, rounds, cards };
  }, [event, rounds, cards]);
  // Rounds whose handicap freeze is in flight, so a burst of taps writes it once.
  const freezing = useRef(new Set<string>());
  const setHole = useCallback(
    (roundId: string, subjectId: string, hole: number, value: number | null) => {
      // The first score into a round that was never opened ("teeing off before it has
      // been opened") freezes the handicaps it is being played off, exactly as opening
      // would have — otherwise tomorrow's handicap update rescores today's holes.
      const round = latest.current.rounds.find((r) => r.id === roundId);
      const event = latest.current.event;
      if (store && round && event && !round.handicaps && !freezing.current.has(roundId)) {
        freezing.current.add(roundId);
        void store
          .patchRound(roundId, { handicaps: snapshotHandicaps(round, event.players).handicaps })
          .catch(() => {})
          .finally(() => freezing.current.delete(roundId));
      }
      // Fire-and-forget by contract. The store has already put the failure on the
      // error channel; the rethrow only needs swallowing so it doesn't surface twice.
      void store?.setHole(roundId, subjectId, hole, value, identity).catch(() => {});
      // A hole-in-one announces itself — the first in Hector Trophée history deserves
      // more than a gold digit on one phone. Keyed by round/player/hole so a re-entry
      // of the same ace doesn't post twice; a team card (scramble) counts for the pair.
      if (value === 1 && store && round && event) {
        const id = `ace-${roundId}-${subjectId}-${hole}`;
        const existing = event.announcements ?? [];
        if (!existing.some((a) => a.id === id)) {
          const pair = subjectId.startsWith("team__")
            ? event.pairs.find((p) => `team__${p.id}` === subjectId)
            : undefined;
          const who = pair
            ? [pair.aId, pair.bId].map((pid) => event.players.find((p) => p.id === pid)?.name ?? pid).join(" + ")
            : (event.players.find((p) => p.id === subjectId)?.name ?? subjectId);
          const course = courses[round.courseId]?.shortName ?? round.courseId;
          const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;
          // The prank-catcher: the temptation to "just see what happens" is real, and
          // a round of beers is the traditional price. The genuine hero will understand.
          const text = `🍾 HOLE-IN-ONE! ${who} aced the ${ordinal(hole)} at ${course} in round ${round.seq} — the first in Hector Trophée history. Champagne at the clubhouse! (In case this was a prank or a false alarm by ${who} after all, a round of beers on them should settle it.)`;
          void store.saveEvent({ announcements: [...existing, { id, text, at: Date.now(), by: "Hector" }] }).catch(() => {});
        }
      }
    },
    [store, identity],
  );

  const setCard = useCallback(
    async (roundId: string, subjectId: string, holes: Record<string, number>) => {
      await store?.setCard(roundId, subjectId, holes, identity).catch(swallow);
    },
    [store, identity],
  );

  const deleteCard = useCallback(
    async (roundId: string, subjectId: string) => {
      await store?.deleteCard(roundId, subjectId).catch(swallow);
    },
    [store],
  );

  const setHcpSubmitted = useCallback(
    async (roundId: string, subjectId: string, submitted: boolean) => {
      await store?.setHcpSubmitted(roundId, subjectId, submitted).catch(swallow);
    },
    [store],
  );

  const saveEvent = useCallback(
    async (patch: Partial<EventDoc>) => {
      await store?.saveEvent(patch).catch(swallow);
    },
    [store],
  );

  const lastAutoFingerprint = useRef<string | null>(null);

  const takeBackup = useCallback(
    async (reason: string, roundsOverride?: Round[]): Promise<Snapshot | null> => {
      const { event, rounds, cards } = latest.current;
      if (!store || !event) return null;
      const snap = buildSnapshot(eventId, event, roundsOverride ?? rounds, cards, reason, identity);
      await store.saveBackup(snap);
      return snap;
    },
    [store, eventId, identity],
  );

  /**
   * The moments around a round's status that deserve care, shared by whole-round saves
   * and field patches: a finished round being reopened or cleared is the classic "oops"
   * (snapshot first); a round going final is worth keeping for good (snapshot after);
   * and a round leaving "upcoming" without frozen handicaps gets them frozen now — the
   * freeze used to fire only on the exact upcoming→open tap, so upcoming→final, or
   * scoring before the round was opened, left a round that tomorrow's handicap update
   * would silently rescore.
   */
  const withFreeze = (prev: Round | undefined, patch: Partial<Round>): Partial<Round> => {
    const event = latest.current.event;
    const status = patch.status ?? prev?.status;
    if (!event || !prev || status === "upcoming" || prev.handicaps || patch.handicaps) return patch;
    return { ...patch, handicaps: snapshotHandicaps(prev, event.players).handicaps };
  };
  const beforeStatusChange = async (prev: Round | undefined, next: Partial<Round>) => {
    if (prev?.status === "final" && next.status && next.status !== "final") {
      await takeBackup(`Before reopening round ${prev.seq}`).catch(() => {});
    }
  };
  const afterStatusChange = (prev: Round | undefined, next: Round) => {
    if (next.status === "final" && prev?.status !== "final") {
      const withThis = latest.current.rounds.map((r) => (r.id === next.id ? next : r));
      void takeBackup(`Round ${next.seq} final`, withThis).catch(() => {});
    }
  };

  const saveRound = useCallback(
    async (round: Round) => {
      const prev = latest.current.rounds.find((r) => r.id === round.id);
      const next = { ...round, ...withFreeze(prev, round) };
      await beforeStatusChange(prev, next);
      await store?.saveRound(next).catch(swallow);
      afterStatusChange(prev, next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, takeBackup],
  );

  const patchRound = useCallback(
    async (roundId: string, patch: Partial<Round>) => {
      const prev = latest.current.rounds.find((r) => r.id === roundId);
      const next = withFreeze(prev, patch);
      await beforeStatusChange(prev, next);
      await store?.patchRound(roundId, next).catch(swallow);
      if (prev) afterStatusChange(prev, { ...prev, ...next } as Round);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, takeBackup],
  );

  // Views are counted locally and flushed in one write — a phone's tab-hopping must not
  // become a write per tap. Nothing is recorded for the anonymous spectator.
  const pendingViews = useRef<Record<string, number>>({});
  const flushViews = useCallback(() => {
    const views = pendingViews.current;
    pendingViews.current = {};
    if (!store || identity === "anon" || Object.keys(views).length === 0) return;
    void store.recordUsage(identity, { views }).catch(() => {});
  }, [store, identity]);
  useEffect(() => {
    const id = setInterval(flushViews, 30_000);
    const onHide = () => {
      if (document.visibilityState === "hidden") flushViews();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onHide);
      flushViews();
    };
  }, [flushViews]);
  const usage = useMemo<TournamentState["usage"]>(
    () => ({
      open: () => {
        if (store && identity !== "anon") void store.recordUsage(identity, { open: true }).catch(() => {});
      },
      view: (tab) => {
        pendingViews.current[tab] = (pendingViews.current[tab] ?? 0) + 1;
      },
      list: async () => (store ? store.listUsage() : []),
    }),
    [store, identity],
  );

  const backups = useMemo<TournamentState["backups"]>(
    () => ({
      take: (reason) => takeBackup(reason),
      takeIfChanged: async (reason) => {
        const { event, rounds, cards } = latest.current;
        if (!event) return null;
        const fp = stateFingerprint(event, rounds, cards);
        if (fp === lastAutoFingerprint.current) return null;
        lastAutoFingerprint.current = fp;
        return takeBackup(reason);
      },
      list: async () => (store ? store.listBackups() : []),
      restore: async (snap, roundId) => {
        if (!store) return;
        await takeBackup(`Before restoring ${roundId ? `round ${snap.rounds.find((r) => r.id === roundId)?.seq}` : "everything"}`);
        if (roundId) await restoreRound(store, snap, roundId, latest.current.cards[roundId] ?? {}, identity);
        else await restoreAll(store, snap, latest.current.cards, identity);
      },
    }),
    [store, takeBackup, identity],
  );

  const mirrorFrom = useMemo(
    () =>
      store?.mirrorFrom ? (sourceEventId: string) => store.mirrorFrom!(sourceEventId) : null,
    [store],
  );

  return {
    ready: Boolean(store && event && rounds.length > 0),
    backend: store?.kind ?? null,
    event,
    rounds,
    cards,
    roundResults,
    hector: totals.hector,
    victor: totals.victor,
    hectorMovement,
    pending,
    online,
    error,
    setHole,
    setCard,
    deleteCard,
    setHcpSubmitted,
    saveEvent,
    saveRound,
    patchRound,
    mirrorFrom,
    usage,
    backups,
    nudge: store?.nudge?.bind(store),
  };
}
