/**
 * The tournament as JSON — the integration point for hector.golf.
 *
 * hector.golf's generator historically read pairs and standings from a hand-made
 * Google Sheet; pointing its HECTOR2026.json at this endpoint instead gives it the
 * app's live data, scored by the same engine (api/_lib) the app and the 2025
 * regression fixture use.
 *
 * Auth: if EXPORT_API_KEY is set in the environment, requests must carry it as an
 * `x-api-key` header or `?key=` query parameter; unset means open, which is honest —
 * the same data is readable by any anonymous app user anyway. CORS is wide open and
 * responses are edge-cached for a minute, so polling is cheap.
 *
 * ⚠️ Scale note for the consumer: `hector[].points` follows the published rules
 * (level-par pair ≈ `levelPar`, 2025 won on 222.0). The hector.golf leaderboard has
 * historically displayed totals a uniform 108.0 LOWER than this scale.
 */
import { getApps, getApp, initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { collection, doc, getDoc, getDocs, getFirestore } from "firebase/firestore";
import { computeTournament, effectiveTee, evaluateRound } from "./_lib/engine.js";
import { courses } from "./_lib/courses.js";
import { levelParTotal } from "./_lib/hector.js";
import { rank } from "./_lib/leaderboard.js";
import type { Card, EventDoc, Round } from "../src/types.js";

const EVENT_ID = "HECTOR2026";

export default async function handler(
  req: { method?: string; url?: string; headers: Record<string, string | string[] | undefined> },
  res: {
    setHeader: (k: string, v: string) => void;
    status: (code: number) => { json: (body: unknown) => void; end: () => void };
  },
) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "x-api-key");
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=600");
  if (req.method === "OPTIONS") return res.status(204).end();

  const required = process.env.EXPORT_API_KEY;
  if (required) {
    const url = new URL(req.url ?? "/", "http://localhost");
    const supplied = (req.headers["x-api-key"] as string | undefined) ?? url.searchParams.get("key");
    if (supplied !== required) return res.status(401).json({ error: "unauthorized" });
  }

  const app =
    getApps().length > 0
      ? getApp()
      : initializeApp({
          apiKey: process.env.VITE_FIREBASE_API_KEY,
          authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
          projectId: process.env.VITE_FIREBASE_PROJECT_ID,
        });
  await signInAnonymously(getAuth(app));
  const db = getFirestore(app);

  const [eventSnap, roundsSnap, cardsSnap] = await Promise.all([
    getDoc(doc(db, "events", EVENT_ID)),
    getDocs(collection(db, "events", EVENT_ID, "rounds")),
    getDocs(collection(db, "events", EVENT_ID, "cards")),
  ]);
  if (!eventSnap.exists()) return res.status(404).json({ error: "no event" });
  const event = eventSnap.data() as EventDoc;
  const rounds = roundsSnap.docs
    .map((d) => ({ ...(d.data() as Round), id: d.id }))
    .sort((a, b) => a.seq - b.seq);
  const cardsByRound: Record<string, Record<string, Card>> = {};
  for (const d of cardsSnap.docs) {
    const card = { ...(d.data() as Card), id: d.id };
    (cardsByRound[card.roundId] ??= {})[card.subjectId] = card;
  }

  const results = rounds
    .filter((r) => courses[r.courseId])
    .map((r) =>
      evaluateRound({
        round: r,
        course: courses[r.courseId],
        tee: effectiveTee(r, courses[r.courseId]),
        players: event.players,
        pairs: event.pairs,
        cards: cardsByRound[r.id] ?? {},
      }),
    );
  const totals = computeTournament(results, event.players, event.pairs);
  const byId = new Map(event.players.map((p) => [p.id, p]));
  const round2 = (n: number) => Math.round(n * 100) / 100;

  // Ranked by weighted to-par, exactly like the app's table — mid-round an
  // accumulating stroke total would rank early flights last for having played more.
  // At week's end toPar === points − levelPar, so the final order is identical.
  const hector = rank(
    totals.hector,
    (r) => r.toPar,
    true,
    (r) => r.roundsPlayed > 0,
  ).map((r) => ({
    position: r.position || null,
    positionLabel: r.label,
    pairId: r.item.key,
    players: r.item.label,
    points: round2(r.item.points),
    toPar: round2(r.item.toPar),
    diffToLeader: r.diff === null ? null : round2(r.diff),
    thru: r.item.thru,
    roundsPlayed: r.item.roundsPlayed,
    perRound: Object.fromEntries(
      rounds
        .filter((rd) => r.item.perRound[rd.id])
        .map((rd) => [`R${rd.seq}`, round2(r.item.perRound[rd.id].points)]),
    ),
  }));

  const victor = rank(
    totals.victor,
    (r) => r.toPar,
    true,
    (r) => r.roundsPlayed > 0,
  ).map((r) => ({
    position: r.position || null,
    positionLabel: r.label,
    playerId: r.item.key,
    player: r.item.label,
    points: round2(r.item.points),
    toPar: round2(r.item.toPar),
    diffToLeader: r.diff === null ? null : round2(r.diff),
    roundsPlayed: r.item.roundsPlayed,
  }));

  return res.status(200).json({
    generatedAt: new Date().toISOString(),
    event: { id: EVENT_ID, name: event.name, venue: event.venue, dates: event.dates },
    status: rounds.some((r) => r.status === "open")
      ? "live"
      : rounds.every((r) => r.status === "final")
        ? "final"
        : "upcoming",
    levelPar: round2(
      levelParTotal(
        rounds.flatMap((r) =>
          r.formats
            .filter((f) => f.hector)
            .map((f) => ({
              pct: f.hector!.pct,
              countsBothPlayers: f.hector!.source === "bothIndividuals",
            })),
        ),
        72,
      ),
    ),
    players: event.players.map((p) => ({ id: p.id, name: p.name, hi: p.hi, bucket: p.bucket })),
    pairs: event.pairs.map((p) => ({
      id: p.id,
      players: [byId.get(p.aId)?.name ?? p.aId, byId.get(p.bId)?.name ?? p.bId],
      defending: p.defending ?? false,
    })),
    rounds: rounds.map((r) => ({
      seq: r.seq,
      day: r.day,
      date: r.date,
      course: courses[r.courseId]?.shortName ?? r.courseId,
      status: r.status,
      formats: r.formats.map((f) => f.label),
    })),
    hector,
    victor,
  });
}
