/**
 * The 07:00 cron: back up the tournament, then refresh handicaps.
 *
 * The backup comes first and unconditionally — a hector.golf outage must not cost
 * the day's snapshot. The live event (doc, rounds, cards) is copied verbatim to
 * `events/HECTOR2026@<date>`: under `events/` because the deployed rules only
 * allow writes there, and conveniently so — the app's existing mirror logic can
 * restore straight from a backup id. One snapshot per day, overwritten on re-runs.
 *
 * The handicap half does every morning what the Admin button does by hand: read
 * hector.golf, and carry new handicaps AND bucket moves into the event. The whole
 * cron runs until the tournament ends, then turns itself off.
 *
 * Schedule lives in vercel.json ("0 4 * * *" — 04:00 UTC = 07:00 in Finland during
 * EEST, which covers the whole run up to 27 Sep). Rounds already opened keep their
 * handicap snapshot, so this can never rescore anything played — same guarantee as
 * the manual refresh.
 *
 * The page parser is shared with the app (src/lib/handicapSource.ts) — regex-based
 * precisely so it runs without a DOM here — and its fixture test pins the page
 * structure for both consumers at once.
 */
import { getApps, getApp, initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  setDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { HECTOR_EVENT_URL, parseHandicaps } from "../src/lib/handicapSource";

const EVENTS = ["HECTOR2026", "HECTOR2026-test"];
/** The Sunday of the trip; the morning after, the cron becomes a no-op. */
const LAST_RUN = Date.UTC(2026, 8, 27, 23, 59);

/** Copy the live event wholesale to `events/HECTOR2026@<date>`. */
async function backupEvent(db: Firestore): Promise<string> {
  const sourceId = EVENTS[0];
  const backupId = `${sourceId}@${new Date().toISOString().slice(0, 10)}`;
  const [eventSnap, roundsSnap, cardsSnap] = await Promise.all([
    getDoc(doc(db, "events", sourceId)),
    getDocs(collection(db, "events", sourceId, "rounds")),
    getDocs(collection(db, "events", sourceId, "cards")),
  ]);
  if (!eventSnap.exists()) return "nothing to back up";
  // ~140 docs at tournament peak — comfortably one batch (limit 500).
  const batch = writeBatch(db);
  batch.set(doc(db, "events", backupId), { ...eventSnap.data(), id: backupId });
  for (const d of roundsSnap.docs) {
    batch.set(doc(db, "events", backupId, "rounds", d.id), d.data());
  }
  for (const d of cardsSnap.docs) {
    batch.set(doc(db, "events", backupId, "cards", d.id), d.data());
  }
  await batch.commit();
  return `${backupId} · ${1 + roundsSnap.size + cardsSnap.size} docs`;
}

export default async function handler(
  req: { headers: Record<string, string | string[] | undefined> },
  res: {
    status: (code: number) => { json: (body: unknown) => void };
  },
) {
  // Vercel sends this header for cron invocations when CRON_SECRET is configured;
  // without the env var the endpoint is open, which is fine — it only syncs truth.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers["authorization"] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "unauthorized" });
  }

  if (Date.now() > LAST_RUN) {
    return res.status(200).json({ status: "expired", note: "the tournament is over" });
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

  // Backup before anything can go wrong — and never let it block the refresh.
  let backup: string;
  try {
    backup = await backupEvent(db);
  } catch (err) {
    backup = `failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  const page = await fetch(HECTOR_EVENT_URL, { cache: "no-store" });
  if (!page.ok) {
    return res.status(502).json({ error: `hector.golf returned ${page.status}`, backup });
  }
  const fetched = parseHandicaps(await page.text());
  if (fetched.length === 0) {
    // The page changed shape. Write nothing; the error in the cron log is the alarm.
    return res.status(500).json({ error: "couldn't find any handicaps on the page", backup });
  }
  const byId = new Map(fetched.map((f) => [f.id, f]));

  const report: Record<string, unknown> = {};
  for (const eventId of EVENTS) {
    // Per-event, so the live event failing can't skip the test event or vice versa.
    try {
      const ref = doc(db, "events", eventId);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        report[eventId] = "no such event";
        continue;
      }
      const players = (snap.data().players ?? []) as {
        id: string;
        name: string;
        hi: number;
        bucket: 1 | 2;
      }[];
      const changes: string[] = [];
      const next = players.map((p) => {
        const f = byId.get(p.id);
        if (!f) return p; // withdrawn upstream ≠ deleted here, same as the manual refresh
        if (Math.abs(f.hi - p.hi) > 1e-9) changes.push(`${p.name} ${p.hi} → ${f.hi}`);
        if (f.bucket !== p.bucket) changes.push(`${p.name} moves to bucket ${f.bucket}`);
        return { ...p, hi: f.hi, bucket: f.bucket };
      });
      if (changes.length > 0) await setDoc(ref, { players: next }, { merge: true });
      report[eventId] = changes.length > 0 ? changes : "up to date";
    } catch (err) {
      report[eventId] = `failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return res.status(200).json({ status: "ok", parsed: fetched.length, backup, report });
}
