import { useEffect, useMemo, useState } from "react";
import { usePersistentState } from "../hooks/usePersistentState";
import type { Card, EventDoc, FieldPlayer, Round } from "../types";
import { courses, holeMetres, teeDotClass, teeLabel } from "../data/courses";
import { effectiveTee, hiFor, teamCardId } from "../lib/engine";
import { allocationFor, netScore, stablefordPoints } from "../lib/formats";
import { courseHandicap, scrambleTeamHandicap, strokeAllocation } from "../lib/handicap";
import { Empty, Header, Segmented } from "../components/Chrome";
import FlightList from "../components/FlightList";
import Scorecard from "../components/Scorecard";

interface Props {
  event: EventDoc;
  round: Round | null;
  rounds: Round[];
  cards: Record<string, Card>;
  me: FieldPlayer | null;
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
  me,
  setHole,
  onShowRound,
  onShowTrophy,
}: Props) {
  /*
   * The entry view opens on the first hole the flight hasn't fully entered — derived
   * from the cards, not remembered. This used to be persisted per round id, which
   * survived a reset (round ids don't change) and greeted a brand-new round on "hole 4"
   * from last week's testing. Deriving it also gives the refresh-on-the-14th-tee case
   * for free, and on any device, not just the one that was scoring.
   *
   * Manual position wins once taken: navigating or entering a score pins the hole until
   * the round or the view changes, so the view never jumps out from under a thumb.
   */
  const [manualHole, setManualHole] = useState<number | null>(null);
  const [view, setView] = usePersistentState<"hole" | "card">("hectro_ui.playview", "hole");
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
          detail: `Team playing HCP ${teamHcp}`,
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
          detail: `HCP ${hiFor(round, p).toFixed(1)} · playing ${playingHcp}`,
          strokes,
          mine: p.id === me.id,
        };
      });
  }, [round, course, me, event]);

  const firstOpenHole = (() => {
    if (subjects.length === 0) return 1;
    for (let h = 1; h <= 18; h++) {
      if (!subjects.every((s) => cards[s.id]?.holes?.[String(h)])) return h;
    }
    return 18;
  })();
  const hole = manualHole ?? firstOpenHole;
  const setHole_ = (next: number | ((prev: number) => number)) =>
    setManualHole(typeof next === "function" ? next(hole) : next);

  // A new round, or re-entering the hole-by-hole view, releases the pin: the view
  // opens on the next un-entered hole again.
  useEffect(() => {
    setManualHole(null);
  }, [round?.id, view]);

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
    if (complete) {
      return (
        <Waiting
          title="That's a wrap"
          body="Every round is in and the trophies are decided."
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
      />
    );
  }

  const tee = effectiveTee(round, course);
  const par = course.par[hole - 1];
  const si = course.si[hole - 1];
  const metres = holeMetres[round.courseId]?.[round.tee]?.[hole - 1];
  const scrambleRound = round.formats.some((f) => f.teamCard);
  const noFlight = !round.groups.some((g) => g.playerIds.includes(me?.id ?? ""));
  const allScored = subjects.length > 0 && subjects.every((s) => cards[s.id]?.holes?.[String(hole)]);

  return (
    <div className="pb-4">
      <Header
        title={`Round ${round.seq} · ${course.shortName}`}
        subtitle={
          <span className="flex items-center gap-1.5">
            <span className={`inline-block w-2 h-2 rounded-full ${teeDotClass[round.tee]}`} />
            {teeLabel[round.tee]} · {round.formats.map((f) => f.label.replace(/ (NET|SCR)$/, "")).join(" · ")}
          </span>
        }
      />

      <Segmented
        value={view}
        onChange={setView}
        options={[
          { id: "hole", label: "Hole by hole" },
          { id: "card", label: "Scorecard" },
        ]}
      />

      {round.provisional && (
        <p className="mx-4 mt-3 text-[11px] leading-relaxed text-amber-400/90 bg-amber-950/40 border border-amber-900/60 rounded-xl px-3 py-2">
          Format and tee are provisional — seeded from 2025 until the official 2026 programme lands.
          Confirm them in Admin.
        </p>
      )}

      {noFlight && subjects.length > 0 && (
        <p className="mx-4 mt-3 text-[11px] leading-relaxed text-slate-400 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2">
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
        <div className="mt-4 px-4">
          <Scorecard course={course} subjects={subjects} cards={cards} tee={round.tee} courseId={round.courseId} />
        </div>
      ) : (
        <>
          <div className="mt-4 px-4">
            <div className="card flex items-center justify-between px-2 py-3">
              <NavButton
                dir="prev"
                disabled={hole === 1}
                onClick={() => setHole_((h) => Math.max(1, h - 1))}
              />
              <div className="text-center">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                  Hole
                </div>
                <div className="text-4xl font-extrabold num leading-none mt-0.5">{hole}</div>
                <div className="flex items-center justify-center gap-2 mt-2 text-xs">
                  <span className="pill bg-violet-950 text-violet-300 num">Par {par}</span>
                  <span className="pill bg-slate-800 text-slate-300 num">SI {si}</span>
                  {metres && <span className="pill bg-slate-800 text-slate-400 num">{metres} m</span>}
                </div>
              </div>
              <NavButton
                dir="next"
                disabled={hole === 18}
                onClick={() => setHole_((h) => Math.min(18, h + 1))}
              />
            </div>
          </div>

          <div className="mt-3 px-4 space-y-3">
            {subjects.map((s) => (
              <SubjectRow
                key={s.id}
                subject={s}
                hole={hole}
                par={par}
                card={cards[s.id]}
                onScore={(v) => {
                  // Pin the view before writing: without this, completing the flight's
                  // last score would advance firstOpenHole and yank the view forward
                  // mid-look — "Next hole" is the deliberate way onwards.
                  setManualHole(hole);
                  setHole(s.id, hole, v);
                }}
              />
            ))}
          </div>

          {/* Always in the layout, enabled once the flight is scored — appearing out of
              nowhere made everything below it jump on the last score of each hole. */}
          {hole < 18 && (
            <div className="px-4 mt-4">
              <button
                className="btn-primary w-full"
                disabled={!allScored}
                onClick={() => setHole_((h) => h + 1)}
              >
                Next hole →
              </button>
            </div>
          )}

          <HoleStrip
            hole={hole}
            onPick={setHole_}
            filled={(h) => subjects.every((s) => Boolean(cards[s.id]?.holes?.[String(h)]))}
            partial={(h) => subjects.some((s) => Boolean(cards[s.id]?.holes?.[String(h)]))}
          />
        </>
      )}
      <p className="sr-only">Tee {teeLabel[round.tee]}, course rating {tee.cr}, slope {tee.slope}.</p>
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

function Waiting({
  title,
  body,
  actions,
}: {
  title: string;
  body: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="px-4 pt-8">
      <div className="card p-6 text-center">
        <p className="text-lg font-bold">{title}</p>
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
}: {
  round: Round;
  course: NonNullable<(typeof courses)[string]>;
  event: EventDoc;
  me: FieldPlayer | null;
  lastFinal: Round | null;
  onShowRound: (roundId: string) => void;
  onScoreAnyway: () => void;
}) {
  const tee = effectiveTee(round, course);
  const group = round.groups.find((g) => g.playerIds.includes(me?.id ?? ""));
  const byId = new Map(event.players.map((p) => [p.id, p]));
  const flight = (group?.playerIds ?? [])
    .map((id) => byId.get(id))
    .filter((p): p is FieldPlayer => Boolean(p));
  const ch = me ? courseHandicap(hiFor(round, me), tee) : null;
  const [allFlights, setAllFlights] = useState(false);
  const otherFlights = round.groups.filter(
    (g) => g.playerIds.length > 0 && g.id !== group?.id,
  ).length;

  return (
    <div className="pb-4">
      <Header
        title={`Round ${round.seq} · ${course.shortName}`}
        subtitle={
          <span className="flex items-center gap-1.5">
            {round.day}
            <span className={`inline-block w-2 h-2 rounded-full ${teeDotClass[round.tee]}`} />
            {teeLabel[round.tee]} ·{" "}
            {round.formats.map((f) => f.label.replace(/ (NET|SCR)$/, "")).join(" · ")}
          </span>
        }
        right={<span className="pill bg-slate-800 text-slate-300 shrink-0">Up next</span>}
      />

      <div className="px-4 space-y-3">
        <div className="card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="label">{group ? "Your tee time" : "Tee times"}</div>
              <div className="text-3xl font-extrabold num mt-1">
                {group?.teeTime ?? round.teeTimeWindow}
              </div>
            </div>
            {ch !== null && (
              <div className="text-right">
                <div className="label">Your CH</div>
                <div className="text-3xl font-extrabold num mt-1 text-violet-300">{ch}</div>
              </div>
            )}
          </div>

          <div className="mt-4 border-t border-slate-800 pt-3">
            <div className="label mb-1.5">{group ? "Your flight" : "Flight"}</div>
            {flight.length > 0 ? (
              <ul className="space-y-1">
                {flight.map((p) => (
                  <li key={p.id} className="flex items-baseline justify-between text-sm">
                    <span className={p.id === me?.id ? "font-semibold" : "text-slate-300"}>
                      {p.name}
                      {p.id === me?.id && (
                        <span className="ml-1.5 text-[10px] font-semibold text-violet-400">you</span>
                      )}
                    </span>
                    <span className="text-[11px] text-slate-500 num">
                      HCP {hiFor(round, p).toFixed(1)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500 leading-relaxed">
                Flights for this round haven't been set yet — they'll appear here once the
                organiser enters them.
              </p>
            )}
          </div>

          {/* The rest of the tee sheet, for relaying "when do the others go out?". */}
          {otherFlights > 0 && (
            <div className="mt-3 border-t border-slate-800 pt-3">
              <button
                onClick={() => setAllFlights((v) => !v)}
                className="text-xs text-violet-400 font-medium"
              >
                {allFlights ? "Hide other flights" : `All flights (${otherFlights + (group ? 1 : 0)})`}
              </button>
              {allFlights && (
                <div className="mt-2">
                  <FlightList round={round} event={event} meId={me?.id ?? null} />
                </div>
              )}
            </div>
          )}
        </div>

        {round.provisional && (
          <p className="text-[11px] leading-relaxed text-amber-400/90 bg-amber-950/40 border border-amber-900/60 rounded-xl px-3 py-2">
            Format and tee are provisional — seeded from 2025 until the official 2026 programme
            lands.
          </p>
        )}

        {lastFinal && (
          <button className="btn-ghost w-full" onClick={() => onShowRound(lastFinal.id)}>
            Round {lastFinal.seq} results
          </button>
        )}

        <p className="text-[11px] text-slate-500 text-center leading-relaxed pt-1">
          Scoring opens when the organiser opens the round.{" "}
          <button onClick={onScoreAnyway} className="text-violet-400 underline underline-offset-2">
            Enter scores anyway
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
          <div className="font-semibold text-sm truncate">
            {subject.name}
            {subject.mine && (
              <span className="ml-1.5 text-[10px] font-semibold text-violet-400 align-middle">
                you
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-500 truncate num">{subject.detail}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {strokes !== 0 && (
            <span
              className={`pill num ${
                strokes > 0 ? "bg-emerald-950 text-emerald-400" : "bg-rose-950 text-rose-400"
              }`}
            >
              {strokes > 0 ? `+${strokes}` : strokes} stroke{Math.abs(strokes) > 1 ? "s" : ""}
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
              className={`flex-1 h-12 rounded-xl transition-colors flex flex-col items-center
                          justify-center leading-none gap-0.5 ${
                value === n
                  ? "bg-violet-600"
                  : n === par
                    ? "bg-slate-800 ring-1 ring-slate-600"
                    : "bg-slate-800/60 hover:bg-slate-700"
              }`}
            >
              <span
                className={`font-bold num text-base ${
                  value === n ? "text-white" : quickTint(diff)
                }`}
              >
                {n}
              </span>
              <span
                className={`text-[8px] font-medium tracking-wide ${
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
          className={`w-11 h-12 rounded-xl font-bold text-sm shrink-0 transition-colors ${
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

function HoleStrip({
  hole,
  onPick,
  filled,
  partial,
}: {
  hole: number;
  onPick: (h: number) => void;
  filled: (h: number) => boolean;
  partial: (h: number) => boolean;
}) {
  return (
    <div className="mt-5 px-4">
      <div className="grid grid-cols-9 gap-1">
        {Array.from({ length: 18 }, (_, i) => i + 1).map((h) => (
          <button
            key={h}
            onClick={() => onPick(h)}
            className={`h-8 rounded-lg text-[11px] font-semibold num transition-colors ${
              h === hole
                ? "bg-violet-600 text-white"
                : filled(h)
                  ? "bg-emerald-900/70 text-emerald-300"
                  : partial(h)
                    ? "bg-slate-800 text-amber-400"
                    : "bg-slate-900 text-slate-600 border border-slate-800"
            }`}
          >
            {h}
          </button>
        ))}
      </div>
    </div>
  );
}
