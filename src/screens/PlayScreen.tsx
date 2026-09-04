import { useEffect, useMemo, useState } from "react";
import { teeWindow } from "../lib/flights";
import { usePersistentState } from "../hooks/usePersistentState";
import type { Card, EventDoc, FieldPlayer, Round } from "../types";
import { courses, holeMapUrl, holeMetres, teeDotClass, teeLabel } from "../data/courses";
import { effectiveTee, hiFor, teamCardId, type RoundResult } from "../lib/engine";
import { formatToPar } from "../lib/leaderboard";
import { allocationFor, netScore, stablefordPoints } from "../lib/formats";
import { courseHandicap, scrambleTeamHandicap, strokeAllocation } from "../lib/handicap";
import { Empty, Header } from "../components/Chrome";
import FlightList from "../components/FlightList";
import HectorMark from "../components/HectorMark";
import CourseHero, { EstablishingShot } from "../components/CourseHero";
import Scorecard from "../components/Scorecard";
import ScoreMark from "../components/ScoreMark";

interface Props {
  event: EventDoc;
  round: Round | null;
  rounds: Round[];
  cards: Record<string, Card>;
  /** Every round's cards — the HCP checklist spans finished rounds. */
  allCards: Record<string, Record<string, Card>>;
  setHcpSubmitted: (roundId: string, subjectId: string, submitted: boolean) => void;
  me: FieldPlayer | null;
  /** This round's computed result — the on-course view shows the flight's standings. */
  result: RoundResult | undefined;
  setHole: (subjectId: string, hole: number, value: number | null) => void;
  onShowRound: (roundId: string) => void;
  onShowTrophy: () => void;
}

/** A card being filled in: one per player, or one per pair in a scramble. */
interface Subject {
  id: string;
  name: string;
  detail: string;
  /** Strokes received on each hole under the round's main net format. */
  strokes: number[];
  /** This card belongs to the person holding the phone (or their pair). */
  mine?: boolean;
}

export default function PlayScreen({
  event,
  round,
  rounds,
  cards,
  allCards,
  me,
  result,
  setHole,
  setHcpSubmitted,
  onShowRound,
  onShowTrophy,
}: Props) {
  const [view, setView] = usePersistentState<"hole" | "card">("hectro_ui.playview", "hole");
  // Mode B (the entry sheet) is open only while scoring; the course view is the rest.
  // Both this and the hole pin are tagged with the round they belong to, so a round
  // change resets them by derivation — no effect, no cascading render.
  const [entryState, setEntryState] = useState<{ round: string; open: boolean }>({
    round: "",
    open: false,
  });
  const entryOpen = entryState.round === round?.id && entryState.open;
  const setEntryOpen = (open: boolean) => setEntryState({ round: round?.id ?? "", open });
  const [pinState, setPinState] = useState<{ round: string; pin: number | null }>({
    round: "",
    pin: null,
  });
  const pin = pinState.round === round?.id ? pinState.pin : null;
  const setPin = (h: number | null) => setPinState({ round: round?.id ?? "", pin: h });
  /*
   * The round this device has "finished" — the flight signing its card. Purely a
   * per-device acknowledgment: cards are already complete in the database, and the
   * round itself stays open until the organiser closes it for every flight in Admin.
   * Reopening is always one tap away, because someone always remembers a wrong 5 on
   * the walk to the terrace.
   */
  const [finishedRound, setFinishedRound] = usePersistentState<string | null>(
    "hectro_ui.finished",
    null,
  );
  // The escape hatch for an organiser who forgot to open the round at tee time.
  const [scoreAnyway, setScoreAnyway] = usePersistentState<string | null>(
    "hectro_ui.scoreAnyway",
    null,
    "session",
  );

  const course = round ? courses[round.courseId] : null;

  const subjects = useMemo<Subject[]>(() => {
    if (!round || !course || !me) return [];
    const tee = effectiveTee(round, course);
    const netFormat = round.formats.find((f) => f.net) ?? round.formats[0];
    const scramble = round.formats.find((f) => f.teamCard);
    const byId = new Map(event.players.map((p) => [p.id, p]));

    const myGroup = round.groups.find((g) => g.playerIds.includes(me.id));
    const memberIds = myGroup?.playerIds ?? fallbackGroup(me, event);

    if (scramble) {
      // One card per pair, for every pair with a player in the flight.
      const seen = new Set<string>();
      const out: Subject[] = [];
      for (const id of memberIds) {
        const pair = event.pairs.find((p) => p.aId === id || p.bId === id);
        if (!pair || seen.has(pair.id)) continue;
        seen.add(pair.id);
        const a = byId.get(pair.aId);
        const b = byId.get(pair.bId);
        if (!a || !b) continue;
        const teamHcp = scrambleTeamHandicap(
          courseHandicap(hiFor(round, a), tee),
          courseHandicap(hiFor(round, b), tee),
          scramble.allowance,
        );
        out.push({
          id: teamCardId(pair.id),
          name: `${a.name} + ${b.name}`,
          detail: `Team HCP ${teamHcp}`,
          strokes: strokeAllocation(teamHcp, course.si),
          mine: pair.aId === me.id || pair.bId === me.id,
        });
      }
      return out;
    }

    return memberIds
      .map((id) => byId.get(id))
      .filter((p): p is FieldPlayer => Boolean(p))
      .map((p) => {
        const { playingHcp, strokes } = allocationFor({
          hi: hiFor(round, p),
          course,
          tee,
          allowance: netFormat?.net ? netFormat.allowance : 0,
        });
        return {
          id: p.id,
          name: p.name,
          // GameBook convention: mid-round the app says plainly "HCP 17" — the
          // playing handicap, the number that explains the stroke dots.
          detail: `HCP ${playingHcp}`,
          strokes,
          mine: p.id === me.id,
        };
      });
  }, [round, course, me, event]);

  if (!round || !course) {
    return (
      <Empty
        title="No round open"
        body="Nothing is being scored right now. The organiser opens each round in Admin as the flights go out."
      />
    );
  }

  /*
   * Most of the trip is between rounds, and the question then is never "let me enter
   * scores" — it's "when do I tee off, and with whom". So an unopened round shows a
   * waiting screen built around the player's own flight, with score entry one
   * deliberate tap away rather than the default.
   */
  if (round.status !== "open" && scoreAnyway !== round.id) {
    const complete = rounds.length > 0 && rounds.every((r) => r.status === "final");
    const lastFinal = [...rounds].reverse().find((r) => r.status === "final");
    const hcpChecklist = me && (
      <HcpChecklist rounds={rounds} allCards={allCards} me={me} onToggle={setHcpSubmitted} />
    );
    if (complete) {
      return (
        <>
          <Waiting
          title="That's a wrap"
          body="Every round is in and the trophies are decided."
          hero={
            /* The closing frame: low sun over d'Este — the trip riding into it. */
            <EstablishingShot
              src="/courses/dusk.webp"
              caption="Hector Trophée · 2026"
              insetClass="-mx-6 -mt-6 mb-5 rounded-t-2xl"
            />
          }
          actions={
            <>
              <button className="btn-primary w-full" onClick={onShowTrophy}>
                Final standings
              </button>
              {lastFinal && (
                <button className="btn-ghost w-full" onClick={() => onShowRound(lastFinal.id)}>
                  Round {lastFinal.seq} results
                </button>
              )}
            </>
          }
          />
          {hcpChecklist}
        </>
      );
    }
    return (
      <NextRound
        round={round}
        course={course}
        event={event}
        me={me}
        lastFinal={lastFinal ?? null}
        onShowRound={onShowRound}
        onScoreAnyway={() => setScoreAnyway(round.id)}
        hcpSection={
          me ? (
            <HcpSection rounds={rounds} allCards={allCards} me={me} onToggle={setHcpSubmitted} />
          ) : null
        }
      />
    );
  }

  const tee = effectiveTee(round, course);
  const scrambleRound = round.formats.some((f) => f.teamCard);
  const myGroup = round.groups.find((g) => g.playerIds.includes(me?.id ?? ""));
  const noFlight = !myGroup;
  const flightIds = myGroup?.playerIds ?? (me ? fallbackGroup(me, event) : []);
  const complete =
    subjects.length > 0 &&
    subjects.every((s) => {
      const holes = cards[s.id]?.holes ?? {};
      for (let h = 1; h <= 18; h++) if (!holes[String(h)]) return false;
      return true;
    });
  const finished = finishedRound === round.id && complete;

  /*
   * The hole in view: the first the flight hasn't fully entered — derived from the
   * cards, never remembered, so a new round never opens on last week's hole 4 and a
   * refresh on the 14th tee lands on the 14th. A manual position (‹ › in the entry
   * sheet, or a score just entered) pins it so the view can't yank forward under a
   * thumb; the pin resets when the round changes.
   */
  const firstOpenHole = (() => {
    for (let h = 1; h <= 18; h++) {
      if (!subjects.every((s) => cards[s.id]?.holes?.[String(h)])) return h;
    }
    return 18;
  })();
  const hole = pin ?? firstOpenHole;

  return (
    <div className="pb-4">
      {/* One line of header: the round is context, not content, while playing. */}
      <Header
        title={`R${round.seq} · ${course.shortName}`}
        subtitle={
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className={`inline-block w-2 h-2 rounded-full ${teeDotClass[round.tee]}`} />
            {teeLabel[round.tee]}
          </span>
        }
        right={
          !entryOpen && view !== "card" && subjects.length > 0 ? (
            <button
              onClick={() => setView("card")}
              className="pill border border-slate-700 bg-slate-900 text-slate-300 font-semibold shrink-0"
            >
              Scorecard
            </button>
          ) : undefined
        }
      />

      {round.status !== "open" && (
        /* Early scoring is a one-way door without this: the choice is remembered
           for the session, so the screen itself must offer the way back. */
        <p className="mx-4 mt-1 text-[12px] leading-relaxed text-slate-500 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 flex items-center justify-between gap-3">
          <span>Scoring before the round has been opened.</span>
          <button
            onClick={() => setScoreAnyway(null)}
            className="shrink-0 underline underline-offset-2 text-slate-400"
          >
            Back to tee times
          </button>
        </p>
      )}

      {round.provisional && (
        <p className="mx-4 mt-3 text-[12px] leading-relaxed text-amber-400/90 bg-amber-950/40 border border-amber-900/60 rounded-xl px-3 py-2">
          Format and tee are provisional — seeded from 2025 until the official 2026 programme lands.
          Confirm them in Admin.
        </p>
      )}

      {noFlight && subjects.length > 0 && (
        <p className="mx-4 mt-3 text-[12px] leading-relaxed text-slate-400 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2">
          You're not assigned to a flight for this round, so this is just your own card. Ask the
          organiser to set the groups in Admin.
        </p>
      )}

      {subjects.length === 0 ? (
        <div className="mt-4">
          <Empty
            title="Nothing to score yet"
            body={
              scrambleRound
                ? "This round is a scramble, which needs the pairs set. The organiser enters them in Admin after the draft."
                : "Pick your name first, then your flight will show up here."
            }
          />
        </div>
      ) : view === "card" ? (
        <div className="mt-3 px-4">
          <button className="btn-ghost w-full mb-3 text-sm" onClick={() => setView("hole")}>
            ← Back to the round
          </button>
          <Scorecard
            course={course}
            subjects={subjects}
            cards={cards}
            mainKind={(round.formats.find((f) => f.hector) ?? round.formats[0])?.kind ?? "stableford"}
            currentHole={hole}
            onPickHole={(h) => {
              setPin(h);
              setView("hole");
              setEntryOpen(true);
            }}
          />
        </div>
      ) : finished ? (
        <RoundFinished
          round={round}
          course={course}
          subjects={subjects}
          cards={cards}
          scramble={scrambleRound}
          onReopen={() => setFinishedRound(null)}
          onShowRound={() => onShowRound(round.id)}
        />
      ) : entryOpen ? (
        <EntrySheet
          round={round}
          course={course}
          subjects={subjects}
          cards={cards}
          hole={hole}
          setHoleNo={(h) => setPin(h)}
          setHole={setHole}
          complete={complete}
          onFinish={() => {
            setEntryOpen(false);
            setFinishedRound(round.id);
          }}
          onClose={() => setEntryOpen(false)}
        />
      ) : (
        <OnCourse
          round={round}
          course={course}
          event={event}
          flightIds={flightIds}
          subjects={subjects}
          cards={cards}
          result={result}
          hole={hole}
          setHoleNo={(h) => setPin(h)}
          complete={complete}
          onEnter={() => setEntryOpen(true)}
          onFinish={() => setFinishedRound(round.id)}
        />
      )}
      <p className="sr-only">Tee {teeLabel[round.tee]}, course rating {tee.cr}, slope {tee.slope}.</p>
    </div>
  );
}

/**
 * Mode A — on the course. What you see while walking: the hole you're on, where your
 * flight stands in the round's main format, and one big door into scoring. No score
 * buttons live here, so a pocketed phone can't score anything.
 */
function OnCourse({
  round,
  course,
  event,
  flightIds,
  subjects,
  cards,
  result,
  hole,
  setHoleNo,
  complete,
  onEnter,
  onFinish,
}: {
  round: Round;
  course: NonNullable<(typeof courses)[string]>;
  event: EventDoc;
  flightIds: string[];
  subjects: Subject[];
  cards: Record<string, Card>;
  result: RoundResult | undefined;
  hole: number;
  setHoleNo: (h: number) => void;
  complete: boolean;
  onEnter: () => void;
  onFinish: () => void;
}) {
  const [showMap, setShowMap] = usePersistentState("hectro_ui.holemap", false);
  const par = course.par[hole - 1];
  const si = course.si[hole - 1];
  const metres = holeMetres[round.courseId]?.[round.tee]?.[hole - 1];

  // The round's main format: the one that feeds the Hector, else the first listed.
  const main = round.formats.find((f) => f.hector) ?? round.formats[0];
  const fr = result?.formats.find((f) => f.spec.id === main?.id);
  /** A card's running figure in the main format, spoken as the Round tab speaks it. */
  const figureFor = (sub: Subject): string => {
    if (!fr) return "—";
    if (fr.teams.length > 0) {
      // Team formats: a player row shows its pair's figure (partners share it).
      const pairId = sub.id.startsWith("team__")
        ? sub.id.slice("team__".length)
        : event.pairs.find((p) => p.aId === sub.id || p.bId === sub.id)?.id;
      const t = fr.teams.find((t) => t.pairId === pairId);
      return t && t.thru > 0 ? `${formatToPar(t.toPar)} (${t.value})` : "—";
    }
    const p = fr.players.find((p) => p.playerId === sub.id);
    if (!p || p.thru === 0) return "—";
    const toPar = p.toPar ?? 0;
    return fr.spec.kind === "stableford"
      ? `${p.value} (${formatToPar(toPar)})`
      : `${formatToPar(toPar)} (${p.value})`;
  };
  const flightRows = subjects.filter((sub) => {
    // Cards in the flight — the same set and order as the entry sheet.
    if (sub.id.startsWith("team__")) return true;
    return flightIds.includes(sub.id);
  });

  return (
    <div className="mt-3 px-4 space-y-3">
      {/* Browsable: step back to see what happened, ahead to see what's coming.
          The hole in view is the one Enter scores opens on — fixing hole 6 is
          just browsing there first. */}
      <div className="card px-3 py-4 text-center">
        <div className="flex items-center justify-between gap-2">
          <NavButton dir="prev" disabled={hole === 1} onClick={() => setHoleNo(Math.max(1, hole - 1))} />
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-widest text-slate-500">
              Hole
            </div>
            <div className="score text-6xl leading-none mt-0.5">{hole}</div>
          </div>
          <NavButton dir="next" disabled={hole === 18} onClick={() => setHoleNo(Math.min(18, hole + 1))} />
        </div>
        <div className="mt-2 flex items-center justify-center gap-2 text-sm text-slate-400 num">
          <span>
            Par {par} · SI {si}
            {metres ? ` · ${metres} m` : ""}
          </span>
          {holeMapUrl(round.courseId, hole) && (
            <button
              onClick={() => setShowMap((v) => !v)}
              className={`pill transition-colors font-semibold ${
                showMap
                  ? "bg-violet-600 text-white"
                  : "border border-violet-700/70 bg-violet-950/30 text-violet-300"
              }`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3" aria-hidden="true">
                <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2ZM9 4v14M15 6v14" strokeLinejoin="round" strokeLinecap="round" />
              </svg>
              Map
            </button>
          )}
        </div>
        {showMap && holeMapUrl(round.courseId, hole) && (
          <img
            src={holeMapUrl(round.courseId, hole)!}
            alt={`Hole ${hole} layout`}
            loading="lazy"
            className="mt-3 mx-auto max-w-[min(60%,260px)]"
          />
        )}

        {/* One row per card, in flight order — the same order as the entry sheet, so
            "third row down" is the same person in both. The hole cell is always
            filled: the score once played (a real score mark), otherwise the stroke
            allocation for the hole (−1, or a dim 0), GameBook-style. A result is
            always a positive count and a stroke never is, so the two can't blur. */}
        <div className="mt-3 border-t border-slate-800 pt-2 text-left">
          <div className="grid grid-cols-[1fr_3rem_auto] items-end gap-x-3 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
            <span className="truncate">Your flight</span>
            <span className="text-center">Hole {hole}</span>
            <span className="text-right">Round</span>
          </div>
          <ul className="divide-y divide-slate-800/70">
            {flightRows.map((sub) => {
              const gross = cards[sub.id]?.holes?.[String(hole)];
              const strokes = sub.strokes[hole - 1];
              return (
                <li key={sub.id} className="grid grid-cols-[1fr_3rem_auto] items-center gap-x-3 py-1.5">
                  <span className={`text-lg truncate ${sub.mine ? "font-semibold text-violet-300" : "text-slate-200"}`}>
                    {sub.name}
                  </span>
                  <span className="flex justify-center">
                    {gross ? (
                      <ScoreMark value={gross} par={par} strokes={strokes} size="lg" />
                    ) : strokes !== 0 ? (
                      <span className={`num text-base font-semibold ${strokes > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {strokes > 0 ? `−${strokes}` : `+${Math.abs(strokes)}`}
                      </span>
                    ) : (
                      <span className="num text-base text-slate-600">0</span>
                    )}
                  </span>
                  <span className={`score text-2xl text-right ${sub.mine ? "text-violet-300" : ""}`}>
                    {figureFor(sub)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {complete ? (
        <button className="btn-primary w-full py-4 text-lg" onClick={onFinish}>
          Finish round
        </button>
      ) : (
        <button className="btn-primary w-full py-4 text-lg" onClick={onEnter}>
          Enter scores · hole {hole}
        </button>
      )}
    </div>
  );
}

/**
 * Mode B — entering. Opens on demand and contains only the scoring: one row per card
 * with the quick-score grid, ‹ › for the hole, and Next hole → which returns to the
 * course. Nothing here is decoration. An idle timer closes it as insurance against a
 * phone pocketed mid-entry.
 */
function EntrySheet({
  round,
  course,
  subjects,
  cards,
  hole,
  setHoleNo,
  setHole,
  complete,
  onFinish,
  onClose,
}: {
  round: Round;
  course: NonNullable<(typeof courses)[string]>;
  subjects: Subject[];
  cards: Record<string, Card>;
  hole: number;
  setHoleNo: (h: number) => void;
  setHole: (subjectId: string, hole: number, value: number | null) => void;
  complete: boolean;
  onFinish: () => void;
  onClose: () => void;
}) {
  const par = course.par[hole - 1];
  const si = course.si[hole - 1];
  const metres = holeMetres[round.courseId]?.[round.tee]?.[hole - 1];
  const allScored = subjects.length > 0 && subjects.every((s) => cards[s.id]?.holes?.[String(hole)]);

  // Idle insurance: 90 s without a touch closes the sheet.
  const [touched, setTouched] = useState(0);
  useEffect(() => {
    const t = setTimeout(onClose, 90_000);
    return () => clearTimeout(t);
  }, [touched, onClose]);

  return (
    <div className="mt-3 px-4 space-y-3" onPointerDown={() => setTouched((n) => n + 1)}>
      <div className="flex items-center justify-between gap-2">
        <NavButton dir="prev" disabled={hole === 1} onClick={() => setHoleNo(Math.max(1, hole - 1))} />
        <div className="text-center">
          <div className="score text-5xl leading-none">{hole}</div>
          <div className="text-[12px] text-slate-500 num mt-1">
            Par {par} · SI {si}
            {metres ? ` · ${metres} m` : ""}
          </div>
        </div>
        <NavButton dir="next" disabled={hole === 18} onClick={() => setHoleNo(Math.min(18, hole + 1))} />
      </div>

      <div className="space-y-3">
        {subjects.map((s) => (
          <SubjectRow
            key={s.id}
            subject={s}
            hole={hole}
            par={par}
            card={cards[s.id]}
            onScore={(v) => {
              // Pin before writing so completing the flight's last score can't
              // advance the derived hole under a thumb — Next hole is the way on.
              setHoleNo(hole);
              setHole(s.id, hole, v);
            }}
          />
        ))}
      </div>

      {hole < 18 ? (
        <button
          className="btn-primary w-full py-4 text-lg"
          disabled={!allScored}
          onClick={() => {
            setHoleNo(hole + 1);
            onClose();
          }}
        >
          Next hole →
        </button>
      ) : (
        <>
          <button className="btn-primary w-full py-4 text-lg" disabled={!complete} onClick={onFinish}>
            Finish round
          </button>
          {!complete && (
            <p className="text-[12px] text-slate-500 text-center num">
              Still missing:{" "}
              {Array.from({ length: 18 }, (_, i) => i + 1)
                .filter((h) => !subjects.every((s) => cards[s.id]?.holes?.[String(h)]))
                .join(" · ")}
            </p>
          )}
        </>
      )}
      <button className="btn-ghost w-full text-sm" onClick={onClose}>
        Done
      </button>
    </div>
  );
}

/**
 * The flight's card is in — a small ceremony instead of a screen that just stops.
 * Totals per card, the falcon landing, and the one honest escape hatch: someone
 * always remembers a wrong 5, so reopening is a single tap, not an admin errand.
 */
function RoundFinished({
  round,
  course,
  subjects,
  cards,
  scramble,
  onReopen,
  onShowRound,
}: {
  round: Round;
  course: NonNullable<(typeof courses)[string]>;
  subjects: Subject[];
  cards: Record<string, Card>;
  scramble: boolean;
  onReopen: () => void;
  onShowRound: () => void;
}) {
  const totals = subjects.map((s) => {
    let gross = 0;
    let net = 0;
    let points = 0;
    course.par.forEach((par, i) => {
      const g = cards[s.id]?.holes?.[String(i + 1)] ?? 0;
      const n = netScore(g, s.strokes[i]);
      gross += g;
      net += n;
      points += stablefordPoints(par, n);
    });
    return { subject: s, gross, toPar: gross - course.par.reduce((a, b) => a + b, 0), net, points };
  });

  return (
    <div className="mt-4 px-4">
      <div className="rounded-3xl border border-gold-400/30 bg-gradient-to-b from-gold-400/[0.07] to-transparent p-6 text-center">
        <HectorMark className="finish-flourish w-14 h-14 mx-auto text-gold-400" />
        <p className="num text-[12px] font-semibold tracking-[0.25em] uppercase text-gold-400 mt-3">
          Round {round.seq} · in the books
        </p>
        <p className="font-serif text-xl font-semibold mt-1">Well played.</p>

        <ul className="mt-5 space-y-1 text-left">
          {totals.map((t, i) => (
            <li
              key={t.subject.id}
              className="finish-rise flex items-baseline justify-between gap-2 border-t border-slate-800 py-2 first:border-0"
              style={{ animationDelay: `${300 + i * 120}ms` }}
            >
              <span className="text-sm font-medium truncate">
                {t.subject.name}
                {t.subject.mine && (
                  <span className="ml-1.5 text-[11px] font-semibold text-violet-400">you</span>
                )}
              </span>
              <span className="shrink-0 flex items-baseline gap-2">
                <span className="score text-lg">{t.gross}</span>
                <span className="text-[12px] text-slate-500 num">
                  {t.toPar === 0 ? "E" : t.toPar > 0 ? `+${t.toPar}` : t.toPar}
                  {scramble ? ` · net ${t.net}` : ` · ${t.points} pts`}
                </span>
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-5 space-y-2">
          <button className="btn-primary w-full" onClick={onShowRound}>
            See the round results
          </button>
          <button className="btn-ghost w-full text-sm" onClick={onReopen}>
            Adjust a score
          </button>
        </div>
      </div>
      <p className="text-[12px] text-slate-500 text-center leading-relaxed mt-3">
        The organiser closes the round for everyone once all flights are in.
      </p>
    </div>
  );
}

/** The scorecard's colour for each result, so entry and card speak the same language. */
function quickTint(diff: number): string {
  if (diff <= -2) return "text-amber-300";
  if (diff === -1) return "text-rose-400";
  if (diff === 0) return "text-slate-100";
  if (diff === 1) return "text-sky-300";
  return "text-slate-300";
}

/** Result names under the quick-row numbers — nobody counts buttons from the left. */
function quickTag(diff: number): string {
  if (diff <= -2) return "eagle";
  if (diff === -1) return "birdie";
  if (diff === 0) return "par";
  if (diff === 1) return "bogey";
  return `+${diff}`;
}

/**
 * Lasse's "nag Juuso at dinner" feature, the player half: the app can't submit
 * rounds to golfliitto, so each player marks the finished individual rounds they
 * have entered into eBirdie/GameBook themselves. Admin sees who still owes one.
 */
function hcpRelevantRounds(
  rounds: Round[],
  allCards: Record<string, Record<string, Card>>,
  me: FieldPlayer,
): Round[] {
  // Finished rounds played off an individual card, where this player has scores.
  return rounds.filter(
    (r) =>
      r.status === "final" &&
      !r.formats.some((f) => f.teamCard) &&
      Object.keys(allCards[r.id]?.[me.id]?.holes ?? {}).length > 0,
  );
}

function HcpSection({
  rounds,
  allCards,
  me,
  onToggle,
}: {
  rounds: Round[];
  allCards: Record<string, Record<string, Card>>;
  me: FieldPlayer;
  onToggle: (roundId: string, subjectId: string, submitted: boolean) => void;
}) {
  const relevant = hcpRelevantRounds(rounds, allCards, me);
  if (relevant.length === 0) return null;
  const missing = relevant.filter((r) => !allCards[r.id]?.[me.id]?.hcpSubmitted).length;

  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <div className="label">HCP bookkeeping</div>
        {missing === 0 ? (
          <span className="text-[12px] text-emerald-400 num">all entered ✓</span>
        ) : (
          <span className="text-[12px] text-amber-400 num">
            {missing} round{missing > 1 ? "s" : ""} to enter
          </span>
        )}
      </div>
      <p className="text-[12px] text-slate-500 leading-relaxed mt-1">
        Mark each round once it's in eBirdie or GameBook.
      </p>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {relevant.map((r) => {
          const done = Boolean(allCards[r.id]?.[me.id]?.hcpSubmitted);
          return (
            <button
              key={r.id}
              onClick={() => onToggle(r.id, me.id, !done)}
              className={`pill num font-semibold transition-colors ${
                done
                  ? "bg-emerald-950 text-emerald-400"
                  : "border border-slate-700 bg-slate-900 text-slate-400"
              }`}
            >
              R{r.seq}
              {done ? " ✓" : ""}
            </button>
          );
        })}
      </div>
    </>
  );
}

/** Standalone card form, for the wrap screen where it is the remaining business. */
function HcpChecklist(props: {
  rounds: Round[];
  allCards: Record<string, Record<string, Card>>;
  me: FieldPlayer;
  onToggle: (roundId: string, subjectId: string, submitted: boolean) => void;
}) {
  if (hcpRelevantRounds(props.rounds, props.allCards, props.me).length === 0) return null;
  return (
    <div className="px-4 mt-3">
      <div className="card p-3.5">
        <HcpSection {...props} />
      </div>
    </div>
  );
}

function Waiting({
  title,
  body,
  actions,
  hero,
}: {
  title: string;
  body: string;
  actions?: React.ReactNode;
  hero?: React.ReactNode;
}) {
  return (
    <div className="px-4 pt-8">
      <div className="card p-6 text-center">
        {hero}
        <p className="font-serif text-xl font-semibold">{title}</p>
        <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">{body}</p>
        {actions && <div className="mt-5 space-y-2">{actions}</div>}
      </div>
    </div>
  );
}

/** The between-rounds home: what's next, when you tee off, and with whom. */
function NextRound({
  round,
  course,
  event,
  me,
  lastFinal,
  onShowRound,
  onScoreAnyway,
  hcpSection,
}: {
  round: Round;
  course: NonNullable<(typeof courses)[string]>;
  event: EventDoc;
  me: FieldPlayer | null;
  lastFinal: Round | null;
  onShowRound: (roundId: string) => void;
  onScoreAnyway: () => void;
  /** HCP bookkeeping, embedded in the card so it sits at the fold instead of
      below a full tee sheet nobody has reason to scroll past. */
  hcpSection?: React.ReactNode;
}) {
  const tee = effectiveTee(round, course);
  const group = round.groups.find((g) => g.playerIds.includes(me?.id ?? ""));
  const byId = new Map(event.players.map((p) => [p.id, p]));
  const flight = (group?.playerIds ?? [])
    .map((id) => byId.get(id))
    .filter((p): p is FieldPlayer => Boolean(p));
  const ch = me ? courseHandicap(hiFor(round, me), tee) : null;
  const otherFlights = round.groups.filter(
    (g) => g.playerIds.length > 0 && g.id !== group?.id,
  ).length;

  return (
    <div className="pb-4">
      <Header
        title={`Round ${round.seq} · ${course.shortName}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            {round.day}
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span className={`inline-block w-2 h-2 rounded-full ${teeDotClass[round.tee]}`} />
              {teeLabel[round.tee]}
            </span>
            · {round.formats.map((f) => f.label.replace(/ (NET|SCR)$/, "")).join(" · ")}
          </span>
        }
        right={<span className="pill bg-slate-800 text-slate-300 shrink-0">Up next</span>}
      />

      <div className="px-4 space-y-3">
        <div className="card p-4">
          <CourseHero courseId={round.courseId} />
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="label">{group ? "Your tee time" : "Tee times"}</div>
              <div className="score text-4xl mt-1">
                {group?.teeTime ?? teeWindow(round)}
              </div>
            </div>
            {ch !== null && (
              <div className="text-right">
                <div className="label">Your CH</div>
                <div className="score text-4xl mt-1 text-violet-300">{ch}</div>
              </div>
            )}
          </div>

          <div className="mt-4 border-t border-slate-800 pt-3">
            <div className="label mb-1.5">{group ? "Your flight" : "Flights"}</div>
            {flight.length > 0 ? (
              <ul className="space-y-1">
                {flight.map((p) => (
                  <li key={p.id} className="flex items-baseline justify-between text-sm">
                    <span className={p.id === me?.id ? "font-semibold" : "text-slate-300"}>
                      {p.name}
                      {p.id === me?.id && (
                        <span className="ml-1.5 text-[11px] font-semibold text-violet-400">you</span>
                      )}
                    </span>
                    <span className="text-[12px] text-slate-500 num">
                      HCP {hiFor(round, p).toFixed(1)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : round.groups.length > 0 ? (
              /* Not placed yet: the whole sheet, free slots and all — what you want
                 while choosing a tee time, and the live board during the draw. */
              <FlightList round={round} event={event} meId={me?.id ?? null} openSlots />
            ) : (
              <p className="text-xs text-slate-500 leading-relaxed">
                Flights for this round haven't been set yet — they'll appear here once the
                organiser enters them.
              </p>
            )}
          </div>

          {hcpSection && (
            <div className="mt-3 border-t border-slate-800 pt-3">{hcpSection}</div>
          )}

          {/* The rest of the tee sheet, always in view — "when do the others go
              out?" is half of what this card gets opened for. */}
          {group && otherFlights > 0 && (
            <div className="mt-3 border-t border-slate-800 pt-3">
              <div className="label mb-1.5">All flights</div>
              <FlightList round={round} event={event} meId={me?.id ?? null} />
            </div>
          )}
        </div>

        {round.provisional && (
          <p className="text-[12px] leading-relaxed text-amber-400/90 bg-amber-950/40 border border-amber-900/60 rounded-xl px-3 py-2">
            Format and tee are provisional — seeded from 2025 until the official 2026 programme
            lands.
          </p>
        )}

        {lastFinal && (
          <button className="btn-ghost w-full" onClick={() => onShowRound(lastFinal.id)}>
            Round {lastFinal.seq} results
          </button>
        )}

        {/* The escape hatch for a flight already on the tee before the round is
            opened — worded for that case only, and kept deliberately drab: an
            invitation to defy "the organiser" would find takers on this trip. */}
        <p className="text-[12px] text-slate-600 text-center leading-relaxed pt-1">
          Scoring opens with the round.{" "}
          <button
            onClick={onScoreAnyway}
            className="text-slate-500 underline underline-offset-2 hover:text-slate-400"
          >
            Teeing off before it has been opened? Start scoring
          </button>
        </p>
      </div>
    </div>
  );
}

/** Without a flight, a player still gets their own card — and their partner's if paired. */
function fallbackGroup(me: FieldPlayer, event: EventDoc): string[] {
  const pair = event.pairs.find((p) => p.aId === me.id || p.bId === me.id);
  if (!pair) return [me.id];
  return [pair.aId, pair.bId];
}

function NavButton({
  dir,
  disabled,
  onClick,
}: {
  dir: "prev" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "prev" ? "Previous hole" : "Next hole"}
      className="w-14 h-14 rounded-2xl bg-slate-800 text-slate-300 disabled:opacity-30
                 hover:bg-slate-700 active:bg-slate-700 flex items-center justify-center shrink-0"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
        <path
          d={dir === "prev" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

function SubjectRow({
  subject,
  hole,
  par,
  card,
  onScore,
}: {
  subject: Subject;
  hole: number;
  par: number;
  card: Card | undefined;
  onScore: (value: number | null) => void;
}) {
  const [showOther, setShowOther] = useState(false);
  const value = card?.holes?.[String(hole)] ?? null;
  const strokes = subject.strokes[hole - 1];
  // Eagle through triple bogey covers virtually every score; "…" handles the rest.
  const quick = Array.from({ length: 7 }, (_, i) => par - 2 + i).filter((n) => n >= 1);
  const net = value ? netScore(value, strokes) : null;
  const points = net === null ? null : stablefordPoints(par, net);

  return (
    <div className="card p-3">
      <div className="flex items-baseline justify-between gap-2 mb-2.5">
        <div className="min-w-0">
          <div className="font-semibold text-xl truncate">
            {subject.name}
            {subject.mine && (
              <span className="ml-1.5 text-[11px] font-semibold text-violet-400 align-middle">
                you
              </span>
            )}
          </div>
          <div className="text-[12px] text-slate-500 truncate num">{subject.detail}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {strokes !== 0 && (
            /* Signed the Golf GameBook way — the app everyone's instincts come from:
               minus for strokes received (they come OFF the score), plus for the
               plus-handicapper's give-back. */
            <span
              className={`pill num ${
                strokes > 0 ? "bg-emerald-950 text-emerald-400" : "bg-rose-950 text-rose-400"
              }`}
            >
              {strokes > 0 ? `−${strokes}` : `+${Math.abs(strokes)}`} stroke
              {Math.abs(strokes) > 1 ? "s" : ""}
            </span>
          )}
          {net !== null && (
            <span className="pill bg-slate-800 text-slate-300 num">
              net {net} · {points} pt{points === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-1.5">
        {quick.map((n) => {
          const diff = n - par;
          return (
            <button
              key={n}
              onClick={() => onScore(value === n ? null : n)}
              /* No ring on par: it read as already selected. Selection is the only
                 highlight; the "par" tag underneath says which one it is. */
              /* No colour transition: on a hole change the digits redraw at once
                 and a fading highlight lagged behind them, reading as a jump. */
              className={`flex-1 h-16 rounded-xl flex flex-col items-center
                          justify-center leading-none gap-0.5 ${
                value === n ? "bg-violet-600" : "bg-slate-800/70 hover:bg-slate-700"
              }`}
            >
              <span
                className={`score text-[28px] ${
                  value === n ? "text-white" : quickTint(diff)
                }`}
              >
                {n}
              </span>
              <span
                className={`text-[11px] font-medium tracking-wide ${
                  value === n ? "text-violet-200" : "text-slate-500"
                }`}
              >
                {quickTag(diff)}
              </span>
            </button>
          );
        })}
        <button
          onClick={() => setShowOther((v) => !v)}
          aria-label="Enter another score"
          className={`w-12 h-16 rounded-xl font-bold text-lg shrink-0 ${
            value !== null && !quick.includes(value)
              ? "bg-violet-600 text-white num"
              : "bg-slate-900 text-slate-500 border border-slate-700"
          }`}
        >
          {value !== null && !quick.includes(value) ? value : "…"}
        </button>
      </div>

      {showOther && (
        <div className="flex items-center gap-2 mt-2">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            autoFocus
            className="input w-24 num text-center"
            placeholder="score"
            defaultValue={value ?? ""}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (n >= 1 && n <= 20) onScore(n);
            }}
          />
          <button
            className="text-xs text-slate-400 underline underline-offset-2"
            onClick={() => {
              onScore(null);
              setShowOther(false);
            }}
          >
            Clear hole
          </button>
        </div>
      )}
    </div>
  );
}

