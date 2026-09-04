import { Fragment, useMemo, useState } from "react";
import { teeWindow } from "../lib/flights";
import { usePersistentState } from "../hooks/usePersistentState";
import type { Card, EventDoc, FieldPlayer, Round } from "../types";
import { courses, holeMapUrl, holeMetres, teeDotClass, teeHex, teeText } from "../data/courses";
import holeArcs from "../data/holeArcs.json";
import { effectiveTee, hiFor, teamCardId, type RoundResult } from "../lib/engine";
import { formatToPar } from "../lib/leaderboard";
import { allocationFor, netScore, stablefordPoints } from "../lib/formats";
import { courseHandicap, scrambleTeamHandicap, strokeAllocation } from "../lib/handicap";
import { Empty, Header } from "../components/Chrome";
import FlightList from "../components/FlightList";
import HectorMark from "../components/HectorMark";
import CourseHero, { EstablishingShot } from "../components/CourseHero";
import Scorecard from "../components/Scorecard";

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
  /** From the scorecard: the Round tab on this round, on the same board, with a way back. */
  onShowRoundBoard: (roundId: string, boardId: string) => void;
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
  onShowRoundBoard,
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

  // The game being played, in the header: which format the flight rows below follow.
  const mainFormat = round.formats.find((f) => f.hector) ?? round.formats[0];
  return (
    <div className="pb-4">
      {/* One line of header: the round is context, not content, while playing —
          and while the entry sheet is open the hole is the header, so none at all. */}
      {!entryOpen && (
        <Header
          title={`R${round.seq} · ${course.shortName}`}
          subtitle={
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span className={`inline-block w-2 h-2 rounded-full ${teeDotClass[round.tee]}`} />
              {teeText(round.tee)}
              {mainFormat && (
                <>
                  <span className="text-slate-600">·</span>
                  {mainFormat.label.replace(/^(Better Ball|Scramble) Stroke Play/, "$1")}
                </>
              )}
            </span>
          }
        />
      )}

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
          You're not in a flight for this round yet, so this is just your own card. The organiser
          can place you in Admin → Flights, where everyone not yet assigned is listed.
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
          <Scorecard
            course={course}
            subjects={subjects}
            cards={cards}
            event={event}
            flightIds={flightIds}
            formats={result?.formats ?? []}
            mainId={(round.formats.find((f) => f.hector) ?? round.formats[0])?.id}
            currentHole={hole}
            onPickHole={(h) => {
              setPin(h);
              setView("hole");
              setEntryOpen(true);
            }}
            onBack={() => setView("hole")}
            onShowWholeRound={(boardId) => onShowRoundBoard(round.id, boardId)}
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
          onShowCard={() => setView("card")}
        />
      )}
      <p className="sr-only">{teeText(round.tee)}, course rating {tee.cr}, slope {tee.slope}.</p>
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
  onShowCard,
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
  onShowCard: () => void;
}) {
  const [showMap, setShowMap] = usePersistentState("hectro_ui.holemap", false);
  const par = course.par[hole - 1];
  const si = course.si[hole - 1];
  const metres = holeMetres[round.courseId]?.[round.tee]?.[hole - 1];

  // The round's main format: the one that feeds the Hector, else the first listed.
  const main = round.formats.find((f) => f.hector) ?? round.formats[0];
  const fr = result?.formats.find((f) => f.spec.id === main?.id);
  /*
   * Rows follow the main format's units: pairs on a Better Ball or scramble day,
   * players otherwise — because "how are we doing" means the game being played, not
   * the raw cards. Order is flight order, the same as the entry sheet.
   */
  type Row = {
    key: string;
    label: string;
    mine: boolean;
    /** What the format counted on the hole in view, or null if not played yet. */
    holeValue: number | null;
    /** Gross card cell (individual formats) draws a real score mark. */
    gross: boolean;
    /** Strokes to show before the hole is played (per partner for a pair). */
    strokes: number[];
    figure: string;
  };
  const rows: Row[] = [];
  if (fr && fr.teams.length > 0) {
    const teams = fr.teams
      .map((t) => ({ t, pair: event.pairs.find((p) => p.id === t.pairId) }))
      .filter(({ pair }) => pair && (flightIds.includes(pair.aId) || flightIds.includes(pair.bId)))
      .sort((a, b) => {
        const idx = (pr: NonNullable<typeof a.pair>) =>
          Math.min(...[pr.aId, pr.bId].map((id) => (flightIds.indexOf(id) < 0 ? 99 : flightIds.indexOf(id))));
        return idx(a.pair!) - idx(b.pair!);
      });
    for (const { t, pair } of teams) {
      const teamSubject = subjects.find((s) => s.id === `team__${pair!.id}`);
      const partners = [pair!.aId, pair!.bId].map((id) => subjects.find((s) => s.id === id));
      rows.push({
        key: t.pairId,
        label: t.label,
        mine: Boolean(teamSubject?.mine || partners.some((p) => p?.mine)),
        holeValue: t.perHole[hole - 1] ?? null,
        gross: false,
        strokes: teamSubject
          ? [teamSubject.strokes[hole - 1]]
          : partners.map((p) => p?.strokes[hole - 1] ?? 0),
        figure: t.thru > 0 ? formatToPar(t.toPar) : "—",
      });
    }
  } else {
    for (const sub of subjects) {
      if (!sub.id.startsWith("team__") && !flightIds.includes(sub.id)) continue;
      const p = fr?.players.find((p) => p.playerId === sub.id);
      const toPar = p?.toPar ?? 0;
      rows.push({
        key: sub.id,
        label: sub.name,
        mine: Boolean(sub.mine),
        holeValue: cards[sub.id]?.holes?.[String(hole)] ?? null,
        gross: true,
        strokes: [sub.strokes[hole - 1]],
        // To par (or points) alone: the stroke total mid-round says little, and the
        // scorecard is one tap away for anyone who wants it.
        figure: !p || p.thru === 0 ? "—" : formatToPar(toPar),
      });
    }
  }
  const strokeText = (n: number) => (n > 0 ? `−${n}` : n < 0 ? `+${Math.abs(n)}` : "0");

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
        <div className="mt-2 text-sm text-slate-400 num">
          Par {par} · SI {si}
          {metres ? ` · ${metres} m` : ""}
        </div>
        {/* The hole map is the feature for a course most of the field has played
            once or never: a real button, not a pill in the meta line. The choice
            persists, so once opened it stays open hole after hole. */}
        {holeMapUrl(round.courseId, hole) && (
          <button
            onClick={() => setShowMap((v) => !v)}
            className={`mt-2.5 mx-auto flex h-8 items-center justify-center gap-1.5 rounded-lg px-3.5 text-[13px] font-semibold ${
              showMap
                ? "bg-slate-800 text-slate-300"
                : "bg-violet-600 text-white shadow-[0_2px_12px_rgba(83,64,173,0.35)]"
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5" aria-hidden="true">
              <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2ZM9 4v14M15 6v14" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
            {showMap ? "Hide map" : "Hole map"}
          </button>
        )}
        {showMap && holeMapUrl(round.courseId, hole) && (
          <HoleMap courseId={round.courseId} hole={hole} tee={round.tee} par={par} />
        )}

        {/* One row per card, in flight order — the same order as the entry sheet, so
            "third row down" is the same person in both. The hole cell is always
            filled: the score once played (a real score mark), otherwise the stroke
            allocation for the hole (−1, or a dim 0), GameBook-style. A result is
            always a positive count and a stroke never is, so the two can't blur. */}
        {/* One grid for the caption and every row: the third column is `auto`, so
            separate per-row grids let it vary and shifted the hole column sideways
            row by row. Shared grid, shared columns, everything lines up. */}
        <div className="mt-3 border-t border-slate-800 pt-2 text-left grid grid-cols-[1fr_3rem_auto] items-center gap-x-3">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 truncate">Your flight</span>
          <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 text-center">Hole</span>
          <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 text-right">Round</span>
          {rows.map((r, i) => {
            const cell = "py-1.5";
            return (
              <Fragment key={r.key}>
                {/* A continuous hairline between rows — per-cell borders broke at the gaps. */}
                {i > 0 && <span className="col-span-3 border-t border-slate-800/70" />}
                <span
                  className={`${cell} truncate ${r.label.length > 16 ? "text-base" : "text-lg"} ${
                    r.mine ? "font-semibold text-violet-300" : "text-slate-200"
                  }`}
                >
                  {r.label}
                </span>
                <span className={`${cell} flex justify-center`}>
                  {r.holeValue !== null ? (
                    /* The hole's result, big and tinted against par — the same for a
                       gross card and a pair's counted net. (The scorecard keeps the
                       ring/box marks; here legibility on the move wins.) */
                    <span className={`score text-2xl ${quickTint(r.holeValue - par)}`}>{r.holeValue}</span>
                  ) : (
                    <span
                      className={`num text-base font-semibold whitespace-nowrap ${
                        r.strokes.some((n) => n !== 0) ? "text-emerald-400" : "text-slate-600"
                      }`}
                    >
                      {r.strokes.map(strokeText).join("·")}
                    </span>
                  )}
                </span>
                <span className={`${cell} score text-2xl text-right ${r.mine ? "text-violet-300" : ""}`}>
                  {r.figure}
                </span>
              </Fragment>
            );
          })}
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
      <button className="btn-ghost w-full py-3" onClick={onShowCard}>
        Scorecard →
      </button>
    </div>
  );
}

/**
 * Mode B — entering. Opens on demand and contains only the scoring: one row per card
 * with the quick-score grid, ‹ › for the hole, and Next hole → which returns to the
 * course. Nothing here is decoration.
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

  // Four cards must fit one screen with the buttons still big: 64px targets for a
  // two-ball, 56px for three or four.
  const tall = subjects.length <= 2;

  return (
    <div className="pt-3 px-4">
      <div className="flex items-center justify-between gap-2">
        <NavButton dir="prev" disabled={hole === 1} onClick={() => setHoleNo(Math.max(1, hole - 1))} />
        <div className="text-center">
          <div className="score text-4xl leading-none">{hole}</div>
          <div className="text-[12px] text-slate-500 num mt-0.5">
            Par {par} · SI {si}
            {metres ? ` · ${metres} m` : ""}
          </div>
        </div>
        <NavButton dir="next" disabled={hole === 18} onClick={() => setHoleNo(Math.min(18, hole + 1))} />
      </div>

      <div className="mt-2 divide-y divide-slate-800">
        {subjects.map((s) => (
          <SubjectRow
            key={s.id}
            subject={s}
            hole={hole}
            par={par}
            card={cards[s.id]}
            tall={tall}
            onScore={(v) => {
              // Pin before writing so completing the flight's last score can't
              // advance the derived hole under a thumb — Next hole is the way on.
              setHoleNo(hole);
              setHole(s.id, hole, v);
            }}
          />
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <button className="btn-ghost basis-1/3 py-3" onClick={onClose}>
          Done
        </button>
        {hole < 18 ? (
          <button
            className="btn-primary basis-2/3 py-3 text-lg"
            disabled={!allScored}
            onClick={() => {
              setHoleNo(hole + 1);
              onClose();
            }}
          >
            Next hole →
          </button>
        ) : (
          <button className="btn-primary basis-2/3 py-3 text-lg" disabled={!complete} onClick={onFinish}>
            Finish round
          </button>
        )}
      </div>
      {hole === 18 && !complete && (
        <p className="mt-2 text-[12px] text-slate-500 text-center num">
          Still missing:{" "}
          {Array.from({ length: 18 }, (_, i) => i + 1)
            .filter((h) => !subjects.every((s) => cards[s.id]?.holes?.[String(h)]))
            .join(" · ")}
        </p>
      )}
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
type HoleArc = {
  w: number;
  h: number;
  tees: Record<string, { x: number; y: number }>;
  arcs: Record<string, Record<string, { d: string; mid: [number, number] }>>;
};
const HOLE_ARCS = holeArcs as unknown as Record<string, Record<string, HoleArc>>;

/**
 * The hole illustration with distance arcs from the round's tee. hector.golf draws
 * the maps to scale (~2.1 px/m, checked against the tee-to-tee metre differences), so
 * scripts/hole-arcs.py can place "150 / 200 / 250 m from this tee" as real arcs across
 * the hole — 200 m, the number a tee shot is planned around, drawn solid; the others
 * dashed. A marker on the tee shows where the measuring starts. Par 3s don't get arcs:
 * the green is the target. The overlay can be switched off for anyone who finds it
 * distracting; the choice sticks.
 */
function HoleMap({ courseId, hole, tee, par }: { courseId: string; hole: number; tee: string; par: number }) {
  const [showArcs, setShowArcs] = usePersistentState("hectro_ui.holearcs", true);
  const data = HOLE_ARCS[courseId]?.[String(hole)];
  const teePos = data?.tees[tee];
  const arcs = par >= 4 && data ? data.arcs[tee] : undefined;
  const hasArcs = Boolean(arcs && teePos && Object.keys(arcs).length > 0);
  // Marker sizes are in image pixels; the map is drawn ~280px tall, so scale them up
  // for tall images to land at the same size on screen.
  const k = data ? Math.max(1, data.h / 280) : 1;
  return (
    <div className="mt-3 flex flex-col items-center">
      <div className="relative inline-block">
        <img
          src={holeMapUrl(courseId, hole)!}
          alt={`Hole ${hole} layout`}
          loading="eager"
          className="block max-h-[280px] w-auto max-w-[80vw]"
        />
        {hasArcs && showArcs && data && teePos && arcs && (
          <>
            <svg
              viewBox={`0 0 ${data.w} ${data.h}`}
              className="absolute inset-0 w-full h-full pointer-events-none"
              aria-hidden="true"
            >
              {["150", "200", "250"].map((m) => {
                const a = arcs[m];
                if (!a) return null;
                const main = m === "200";
                return (
                  <g key={m}>
                    <path d={a.d} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={main ? 4 : 3} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
                    <path
                      d={a.d}
                      fill="none"
                      stroke={main ? "#fff" : "rgba(255,255,255,0.85)"}
                      strokeWidth={main ? 1.5 : 1}
                      strokeDasharray={main ? undefined : "3 3"}
                      vectorEffect="non-scaling-stroke"
                      strokeLinecap="round"
                    />
                  </g>
                );
              })}
              {/* The marker wears the tee's colour — the one you are playing from. */}
              <circle cx={teePos.x} cy={teePos.y} r={3.2 * k} fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth={4} vectorEffect="non-scaling-stroke" />
              <circle cx={teePos.x} cy={teePos.y} r={3.2 * k} fill={teeHex[tee] ?? "#fff"} stroke="#fff" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            </svg>
            {["150", "200", "250"].map((m) => {
              const a = arcs[m];
              if (!a) return null;
              const main = m === "200";
              return (
                <span
                  key={m}
                  className={`absolute left-full ml-1.5 -translate-y-1/2 whitespace-nowrap num text-[11px] ${
                    main ? "font-semibold text-slate-200" : "text-slate-500"
                  }`}
                  style={{ top: `${(a.mid[1] / data.h) * 100}%` }}
                >
                  ≈{m}{main ? " m" : ""}
                </span>
              );
            })}
            <span
              className="absolute left-full ml-1.5 -translate-y-1/2 whitespace-nowrap num text-[11px] text-slate-500"
              style={{ top: `${(teePos.y / data.h) * 100}%` }}
            >
              0 m
            </span>
          </>
        )}
      </div>
      {/* One quiet line: the toggle, and while the arcs are on, the caveat — the "≈"
          on every label already says "estimate"; this says from what. */}
      {hasArcs && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-600">
          <button
            onClick={() => setShowArcs((v) => !v)}
            className="font-medium text-slate-500 underline underline-offset-4 py-1"
          >
            {showArcs ? "Hide distances" : "Show distances"}
          </button>
          {showArcs && <span>· estimated from the course drawing</span>}
        </div>
      )}
    </div>
  );
}

function quickTint(diff: number): string {
  if (diff <= -2) return "text-amber-300";
  if (diff === -1) return "text-rose-400";
  if (diff === 0) return "text-slate-100";
  if (diff === 1) return "text-sky-300";
  // Double or worse: the deeper blue, as on the scorecard marks.
  return "text-blue-400";
}

/** Result names under the quick-row numbers — nobody counts buttons from the left. */
function quickTag(diff: number): string {
  if (diff <= -2) return "eagle";
  if (diff === -1) return "birdie";
  if (diff === 0) return "par";
  if (diff === 1) return "bogey";
  if (diff === 2) return "double";
  if (diff === 3) return "triple";
  // No standard shorthand past triple: the number says it.
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
              {teeText(round.tee)}
            </span>
            · {(round.formats.find((f) => f.hector) ?? round.formats[0])?.label.replace(/^(Better Ball|Scramble) Stroke Play/, "$1")}
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
                <div className="label">Playing HCP</div>
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
  tall,
  onScore,
}: {
  subject: Subject;
  hole: number;
  par: number;
  card: Card | undefined;
  /** 64px buttons for a two-ball; 56px so four cards fit one screen. */
  tall: boolean;
  onScore: (value: number | null) => void;
}) {
  // Tagged by hole: paging to the next hole with the "…" box open closes it, instead of
  // showing the previous hole's number over the new hole.
  const [otherFor, setOtherFor] = useState<number | null>(null);
  const showOther = otherFor === hole;
  const value = card?.holes?.[String(hole)] ?? null;
  const strokes = subject.strokes[hole - 1];
  // Eagle through triple bogey covers virtually every score; "…" handles the rest.
  const quick = Array.from({ length: 7 }, (_, i) => par - 2 + i).filter((n) => n >= 1);
  const h = tall ? "h-16" : "h-14";
  const digit = tall ? "text-[28px]" : "text-[26px]";

  return (
    <div className="py-2.5">
      {/* One line: name, then HCP and this hole's stroke (GameBook-signed: minus
          for strokes received) in the quiet voice. Nothing after the score is
          entered — the buttons show it. */}
      <div className="flex items-baseline gap-2 mb-2 min-w-0">
        <span className="font-semibold text-lg truncate">
          {subject.name}
          {subject.mine && (
            <span className="ml-1.5 text-[11px] font-semibold text-violet-400 align-middle">you</span>
          )}
        </span>
        <span className="shrink-0 text-[12px] text-slate-500 num">{subject.detail}</span>
        {strokes !== 0 && (
          <span className={`shrink-0 text-[12px] num font-semibold ${strokes > 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {strokes > 0 ? `−${strokes}` : `+${Math.abs(strokes)}`}
          </span>
        )}
      </div>

      {/* Tighter gaps and a narrower "…" on a 360px phone, so seven buttons keep their width. */}
      <div className="flex gap-1 min-[380px]:gap-1.5">
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
              className={`flex-1 ${h} rounded-xl flex flex-col items-center
                          justify-center leading-none gap-0.5 ${
                value === n ? "bg-violet-600" : "bg-slate-800/70 hover:bg-slate-700"
              }`}
            >
              <span
                className={`score ${digit} ${
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
          onClick={() => setOtherFor(showOther ? null : hole)}
          aria-label="Enter another score"
          className={`w-10 min-[380px]:w-12 ${h} rounded-xl font-bold text-lg shrink-0 ${
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
          {/* Committed on Enter or when focus leaves — typing "15" must not write a 1
              to every phone on the way. Keyed by hole so the box never carries a value
              over from another hole. */}
          <input
            key={hole}
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            autoFocus
            className="input w-24 num text-center"
            placeholder="score"
            defaultValue={value ?? ""}
            onBlur={(e) => {
              const n = Number(e.currentTarget.value);
              if (n >= 1 && n <= 20 && n !== value) onScore(n);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
          <button
            className="text-xs text-slate-400 underline underline-offset-2"
            onClick={() => {
              onScore(null);
              setOtherFor(null);
            }}
          >
            Clear hole
          </button>
        </div>
      )}
    </div>
  );
}

