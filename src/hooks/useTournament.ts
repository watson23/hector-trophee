import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Card, EventDoc, Round } from "../types";
import { courses } from "../data/courses";
import { computeTournament, effectiveTee, evaluateRound, type RoundResult } from "../lib/engine";
import { getStore, reconcilePins, type Store, type StoreError } from "../lib/store";

export interface TournamentState {
  ready: boolean;
  backend: Store["kind"] | null;
  event: EventDoc | null;
  rounds: Round[];
  cards: Record<string, Record<string, Card>>;
  roundResults: Record<string, RoundResult>;
  hector: ReturnType<typeof computeTournament>["hector"];
  victor: ReturnType<typeof computeTournament>["victor"];
  pending: number;
  online: boolean;
  error: StoreError | null;
  setHole: (roundId: string, subjectId: string, hole: number, value: number | null) => void;
  setCard: (roundId: string, subjectId: string, holes: Record<string, number>) => Promise<void>;
  deleteCard: (roundId: string, subjectId: string) => Promise<void>;
  saveEvent: (patch: Partial<EventDoc>) => Promise<void>;
  saveRound: (round: Round) => Promise<void>;
}

/**
 * Single subscription point for the whole app: event, rounds and every card, run
 * through the scoring engine to produce per-round results and the running totals.
 */
export function useTournament(identity: string): TournamentState {
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
    void getStore().then((s) => {
      if (!cancelled) setStore(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
  }, [store, event]);

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

  return {
    ready: Boolean(store && event && rounds.length > 0),
    backend: store?.kind ?? null,
    event,
    rounds,
    cards,
    roundResults,
    hector: totals.hector,
    victor: totals.victor,
    pending,
    online,
    error,
    setHole,
    setCard,
    deleteCard,
    saveEvent,
    saveRound,
  };
}
