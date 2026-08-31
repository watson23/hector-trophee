import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Card, EventDoc, Round } from "../types";
import { courses } from "../data/courses";
import { computeTournament, effectiveTee, evaluateRound, type RoundResult } from "../lib/engine";
import {
  getStore,
  migrateEvent,
  migrateRounds,
  reconcilePins,
  type Store,
  type StoreError,
} from "../lib/store";

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
  saveEvent: (patch: Partial<EventDoc>) => Promise<void>;
  saveRound: (round: Round) => Promise<void>;
  /** Copy another event's data wholesale into this one; null when the backend can't. */
  mirrorFrom: ((sourceEventId: string) => Promise<number>) | null;
}

/**
 * Single subscription point for the whole app: event, rounds and every card, run
 * through the scoring engine to produce per-round results and the running totals.
 */
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
      const sorted = [...played].sort((a, b) => a.points - b.points);
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

  const setHole = useCallback(
    (roundId: string, subjectId: string, hole: number, value: number | null) => {
      void store?.setHole(roundId, subjectId, hole, value, identity);
    },
    [store, identity],
  );

  const setCard = useCallback(
    async (roundId: string, subjectId: string, holes: Record<string, number>) => {
      await store?.setCard(roundId, subjectId, holes, identity);
    },
    [store, identity],
  );

  const deleteCard = useCallback(
    async (roundId: string, subjectId: string) => {
      await store?.deleteCard(roundId, subjectId);
    },
    [store],
  );

  const saveEvent = useCallback(
    async (patch: Partial<EventDoc>) => {
      await store?.saveEvent(patch);
    },
    [store],
  );

  const saveRound = useCallback(
    async (round: Round) => {
      await store?.saveRound(round);
    },
    [store],
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
    saveEvent,
    saveRound,
    mirrorFrom,
  };
}
