import { useMemo, useState } from "react";
import type { Card, EventDoc, Round } from "../types";
import { courses } from "../data/courses";
import { effectiveTee, hiFor, teamCardId } from "../lib/engine";
import { allocationFor, netScore, stablefordPoints } from "../lib/formats";
import { courseHandicap, scrambleTeamHandicap, strokeAllocation } from "../lib/handicap";
import { generateRoundCards } from "../lib/testdata";
import { resetTournament, simulateTournament } from "../lib/simulate";
import { EVENT_ID } from "../data/field";
import type { Space } from "../lib/space";

interface Props {
  event: EventDoc;
  rounds: Round[];
  space: Space;
  backend: "firestore" | "local" | null;
  mirrorFrom: ((sourceEventId: string) => Promise<number>) | null;
  cards: Record<string, Record<string, Card>>;
  setHole: (roundId: string, subjectId: string, hole: number, value: number | null) => void;
  setCard: (roundId: string, subjectId: string, holes: Record<string, number>) => Promise<void>;
  deleteCard: (roundId: string, subjectId: string) => Promise<void>;
  saveEvent: (patch: Partial<EventDoc>) => Promise<void>;
  saveRound: (round: Round) => Promise<void>;
}

interface Subject {
  id: string;
  name: string;
  detail: string;
  strokes: number[];
}

/** Every card in a round, whoever is playing it — not just the current user's flight. */
function subjectsFor(round: Round, event: EventDoc): Subject[] {
  const course = courses[round.courseId];
  if (!course) return [];
  const tee = effectiveTee(round, course);
  const scramble = round.formats.find((f) => f.teamCard);
  const netFormat = round.formats.find((f) => f.net) ?? round.formats[0];
  const byId = new Map(event.players.map((p) => [p.id, p]));

  if (scramble) {
    return event.pairs.flatMap((pair) => {
      const a = byId.get(pair.aId);
      const b = byId.get(pair.bId);
      if (!a || !b) return [];
      const teamHcp = scrambleTeamHandicap(
        courseHandicap(hiFor(round, a), tee),
        courseHandicap(hiFor(round, b), tee),
        scramble.allowance,
      );
      return [
        {
          id: teamCardId(pair.id),
          name: `${a.name} + ${b.name}`,
          detail: `team HCP ${teamHcp}`,
          strokes: strokeAllocation(teamHcp, course.si),
        },
      ];
    });
  }

  return event.players.map((p) => {
    const { playingHcp, strokes } = allocationFor({
      hi: hiFor(round, p),
      course,
      tee,
      allowance: netFormat?.net ? netFormat.allowance : 0,
    });
    return { id: p.id, name: p.name, detail: `playing ${playingHcp}`, strokes };
  });
}

/**
 * Organiser tools: correct any score in any round, and fill rounds with fake scores
 * while trying the app out.
 */
export default function ScoreAdmin({
  event,
  rounds,
  space,
  backend,
  mirrorFrom,
  cards,
  setHole,
  setCard,
  deleteCard,
  saveEvent,
  saveRound,
}: Props) {
  const [roundId, setRoundId] = useState(rounds[0]?.id ?? "");
  const round = rounds.find((r) => r.id === roundId) ?? rounds[0];
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmMirror, setConfirmMirror] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // Simulation belongs in the sandbox. In the tournament space, filling rounds with
  // fake scores is exactly the button nobody should be able to fat-finger — fixing a
  // score and the confirmed resets stay available everywhere. The local demo backend
  // is a sandbox by nature, so it keeps everything.
  const sandbox = space === "test" || backend === "local";

  async function mirror() {
    if (!mirrorFrom) return;
    setBusy("Copying the tournament data…");
    try {
      const n = await mirrorFrom(EVENT_ID);
      setBusy(null);
      setConfirmMirror(false);
      alert(`Copied — ${n} documents written. This sandbox now matches the tournament.`);
    } catch (err) {
      setBusy(null);
      alert(`Copy failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const subjects = useMemo(() => (round ? subjectsFor(round, event) : []), [round, event]);
  const roundCards = round ? (cards[round.id] ?? {}) : {};
  const course = round ? courses[round.courseId] : null;

  if (!round || !course) return null;

  const subject = subjects.find((s) => s.id === subjectId) ?? null;
  const scored = subjects.filter((s) => Object.keys(roundCards[s.id]?.holes ?? {}).length > 0);

  /** Shared wrapper so every long-running tool reports progress and can't double-fire. */
  async function run(
    label: string,
    fn: (deps: Parameters<typeof simulateTournament>[0]) => Promise<void>,
  ) {
    setBusy(label);
    try {
      await fn({ event, rounds, setCard, deleteCard, saveEvent, saveRound, onProgress: (m) => setBusy(m) });
    } finally {
      setBusy(null);
      setSubjectId(null);
      setConfirmClear(false);
    }
  }

  async function fill(holes: number) {
    if (!round || !course) return;
    setBusy(`Filling ${holes} holes…`);
    const generated = generateRoundCards(round, course, effectiveTee(round, course), event, holes);
    await Promise.all(generated.map((c) => setCard(round.id, c.subjectId, c.holes)));
    setBusy(null);
  }

  async function clearRound() {
    if (!round) return;
    setBusy("Clearing…");
    await Promise.all(subjects.map((s) => deleteCard(round.id, s.id)));
    setConfirmClear(false);
    setBusy(null);
  }

  return (
    <div className="px-4 space-y-4">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {rounds.map((r) => (
          <button
            key={r.id}
            onClick={() => {
              setRoundId(r.id);
              setSubjectId(null);
              setConfirmClear(false);
            }}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold num ${
              r.id === round.id
                ? "bg-violet-600 text-white"
                : "bg-slate-900 text-slate-400 border border-slate-800"
            }`}
          >
            R{r.seq}
          </button>
        ))}
      </div>

      <p className="text-xs text-slate-400">
        Round {round.seq} · {course.shortName} ·{" "}
        <span className="num">
          {scored.length} of {subjects.length} cards started
        </span>
      </p>

      {/* ---------------- correcting a score ---------------- */}
      <section>
        <h2 className="label mb-2">Fix a score</h2>
        {!subject ? (
          <div className="grid grid-cols-2 gap-2">
            {subjects.map((s) => {
              const played = Object.keys(roundCards[s.id]?.holes ?? {}).length;
              return (
                <button
                  key={s.id}
                  onClick={() => setSubjectId(s.id)}
                  className="card px-3 py-2.5 text-left hover:border-violet-600"
                >
                  <div className="text-sm font-medium truncate">{s.name}</div>
                  <div className="text-[11px] text-slate-500 num">
                    {played ? `${played} holes` : "no scores"}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <HoleEditor
            subject={subject}
            par={course.par}
            card={roundCards[subject.id]}
            onSet={(hole, value) => setHole(round.id, subject.id, hole, value)}
            onBack={() => setSubjectId(null)}
          />
        )}
      </section>

      {/* ---------------- mirroring the tournament into the sandbox ---------------- */}
      {space === "test" && mirrorFrom && (
        <section className="border border-sky-900 bg-sky-950/20 rounded-2xl p-3.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-sky-400 mb-1">
            Mirror the tournament
          </h2>
          <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
            Copies the tournament's current data — scores, pairs, flights and round setup —
            into this sandbox, replacing everything here. The tournament itself is only read.
          </p>
          {!confirmMirror ? (
            <button
              disabled={Boolean(busy)}
              onClick={() => setConfirmMirror(true)}
              className="btn-ghost w-full py-2 text-xs disabled:opacity-40"
            >
              Copy tournament data here
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                disabled={Boolean(busy)}
                onClick={mirror}
                className="flex-1 rounded-xl py-2 text-xs font-semibold bg-sky-600 text-white"
              >
                Yes, replace this sandbox
              </button>
              <button onClick={() => setConfirmMirror(false)} className="btn-ghost px-4 py-2 text-xs">
                Cancel
              </button>
            </div>
          )}
        </section>
      )}

      {/* ---------------- test data (sandbox only) ---------------- */}
      {sandbox && (
      <section className="border border-amber-900/60 bg-amber-950/20 rounded-2xl p-3.5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-1">
          Test data · whole tournament
        </h2>
        <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
          Plays all {rounds.length} rounds end to end, including the draft — round 1 is played
          first and its Stableford order decides who picks whom. No need to enter pairs by hand.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            disabled={Boolean(busy)}
            onClick={() => run("Simulating…", (d) => simulateTournament(d, 18))}
            className="btn-ghost py-2 text-xs disabled:opacity-40"
          >
            Play whole tournament
          </button>
          <button
            disabled={Boolean(busy)}
            onClick={() => run("Simulating…", (d) => simulateTournament(d, 7))}
            className="btn-ghost py-2 text-xs disabled:opacity-40"
          >
            …with last round live
          </button>
        </div>
        {busy && <p className="text-xs text-violet-300 mt-2 num">{busy}</p>}

        <h2 className="text-xs font-semibold uppercase tracking-wider text-amber-400 mt-5 mb-1">
          Just round {round.seq}
        </h2>
        <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
          Fills round {round.seq} with plausible scores for everyone playing it, so the
          leaderboards have something in them. Delete this section before the trip, or just
          clear the rounds again.
        </p>

        {busy && <p className="text-xs text-violet-300 mb-2 num">{busy}</p>}

        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Full 18", holes: 18 },
            { label: "Thru 9", holes: 9 },
            { label: "Thru 4", holes: 4 },
          ].map((o) => (
            <button
              key={o.holes}
              disabled={scored.length > 0 || Boolean(busy)}
              onClick={() => fill(o.holes)}
              className="btn-ghost py-2 text-xs disabled:opacity-40"
            >
              {o.label}
            </button>
          ))}
        </div>

        {scored.length > 0 && (
          <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
            This round already has scores. Clear it first — that guard is deliberate, so a
            stray tap can't overwrite a real round.
          </p>
        )}

        <div className="mt-3">
          {!confirmClear ? (
            <button
              disabled={scored.length === 0 || Boolean(busy)}
              onClick={() => setConfirmClear(true)}
              className="w-full rounded-xl py-2 text-xs font-semibold bg-rose-950 text-rose-300
                         border border-rose-900 disabled:opacity-40"
            >
              Clear all scores in round {round.seq}
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={clearRound}
                className="flex-1 rounded-xl py-2 text-xs font-semibold bg-rose-600 text-white"
              >
                Yes, delete {scored.length} card{scored.length === 1 ? "" : "s"}
              </button>
              <button
                onClick={() => setConfirmClear(false)}
                className="btn-ghost px-4 py-2 text-xs"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </section>
      )}

      {/* ---------------- reset — available in both spaces, but never one tap ---------------- */}
      <section>
        {!confirmReset ? (
          <button
            disabled={Boolean(busy)}
            onClick={() => setConfirmReset(true)}
            className="w-full rounded-xl py-2 text-xs font-semibold bg-rose-950 text-rose-300
                       border border-rose-900 disabled:opacity-40"
          >
            Reset everything — scores, pairs and flights
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              disabled={Boolean(busy)}
              onClick={() => {
                setConfirmReset(false);
                void run("Resetting…", (d) => resetTournament(d, cards));
              }}
              className="flex-1 rounded-xl py-2 text-xs font-semibold bg-rose-600 text-white"
            >
              Yes, wipe the whole {space === "test" ? "sandbox" : "tournament"}
            </button>
            <button onClick={() => setConfirmReset(false)} className="btn-ghost px-4 py-2 text-xs">
              Cancel
            </button>
          </div>
        )}
        {busy && <p className="text-xs text-violet-300 mt-2 num">{busy}</p>}
      </section>
    </div>
  );
}

/** An 18-hole grid; tap a hole, then tap the score. */
function HoleEditor({
  subject,
  par,
  card,
  onSet,
  onBack,
}: {
  subject: Subject;
  par: number[];
  card: Card | undefined;
  onSet: (hole: number, value: number | null) => void;
  onBack: () => void;
}) {
  const [hole, setHole] = useState<number | null>(null);
  const value = hole ? (card?.holes?.[String(hole)] ?? null) : null;
  const holePar = hole ? par[hole - 1] : 4;
  const strokes = hole ? subject.strokes[hole - 1] : 0;
  const net = value ? netScore(value, strokes) : null;

  return (
    <div className="card p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="min-w-0">
          <div className="font-semibold text-sm truncate">{subject.name}</div>
          <div className="text-[11px] text-slate-500 num">{subject.detail}</div>
        </div>
        {/* Not "Done" — the Admin header already has one, and two on a screen is a trap. */}
        <button onClick={onBack} className="btn-ghost px-3 py-1.5 text-xs shrink-0">
          ← All cards
        </button>
      </div>

      <div className="grid grid-cols-9 gap-1">
        {Array.from({ length: 18 }, (_, i) => i + 1).map((h) => {
          const v = card?.holes?.[String(h)];
          return (
            <button
              key={h}
              onClick={() => setHole(hole === h ? null : h)}
              className={`h-10 rounded-lg text-xs font-bold num transition-colors ${
                hole === h
                  ? "bg-violet-600 text-white"
                  : v
                    ? "bg-slate-800 text-slate-200"
                    : "bg-slate-900 text-slate-600 border border-slate-800"
              }`}
            >
              {v ?? h}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-slate-600 mt-1.5">
        Cells show the score once entered, otherwise the hole number.
      </p>

      {hole && (
        <div className="mt-3 border-t border-slate-800 pt-3">
          <div className="flex items-center justify-between mb-2 text-xs">
            <span className="font-semibold">
              Hole {hole} <span className="text-slate-500 num">· par {holePar}</span>
            </span>
            {net !== null && (
              <span className="num text-slate-400">
                net {net} · {stablefordPoints(holePar, net)} pts
              </span>
            )}
          </div>
          <div className="flex gap-1.5">
            {Array.from({ length: 7 }, (_, i) => holePar - 2 + i)
              .filter((n) => n >= 1)
              .map((n) => (
                <button
                  key={n}
                  onClick={() => onSet(hole, n)}
                  className={`flex-1 h-11 rounded-xl font-bold num text-sm ${
                    value === n ? "bg-violet-600 text-white" : "bg-slate-800 text-slate-200"
                  }`}
                >
                  {n}
                </button>
              ))}
            <button
              onClick={() => onSet(hole, null)}
              className="w-12 h-11 rounded-xl text-[11px] font-semibold bg-slate-900
                         border border-slate-700 text-slate-400"
            >
              clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
