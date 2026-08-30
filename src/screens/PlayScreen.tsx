import { useMemo, useState } from "react";
import type { Card, EventDoc, FieldPlayer, Round } from "../types";
import { courses, holeMetres, teeDotClass, teeLabel } from "../data/courses";
import { effectiveTee, teamCardId } from "../lib/engine";
import { allocationFor, netScore, stablefordPoints } from "../lib/formats";
import { courseHandicap, scrambleTeamHandicap, strokeAllocation } from "../lib/handicap";
import { Empty, Header, Segmented } from "../components/Chrome";
import Scorecard from "../components/Scorecard";

interface Props {
  event: EventDoc;
  round: Round | null;
  cards: Record<string, Card>;
  me: FieldPlayer | null;
  setHole: (subjectId: string, hole: number, value: number | null) => void;
}

/** A card being filled in: one per player, or one per pair in a scramble. */
interface Subject {
  id: string;
  name: string;
  detail: string;
  /** Strokes received on each hole under the round's main net format. */
  strokes: number[];
}

export default function PlayScreen({ event, round, cards, me, setHole }: Props) {
  const [hole, setHole_] = useState(1);
  const [view, setView] = useState<"hole" | "card">("hole");

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
          courseHandicap(a.hi, tee),
          courseHandicap(b.hi, tee),
          scramble.allowance,
        );
        out.push({
          id: teamCardId(pair.id),
          name: `${a.name} + ${b.name}`,
          detail: `Team playing HCP ${teamHcp}`,
          strokes: strokeAllocation(teamHcp, course.si),
        });
      }
      return out;
    }

    return memberIds
      .map((id) => byId.get(id))
      .filter((p): p is FieldPlayer => Boolean(p))
      .map((p) => {
        const { playingHcp, strokes } = allocationFor({
          hi: p.hi,
          course,
          tee,
          allowance: netFormat?.net ? netFormat.allowance : 0,
        });
        return {
          id: p.id,
          name: p.name,
          detail: `HCP ${p.hi.toFixed(1)} · playing ${playingHcp}`,
          strokes,
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
                onScore={(v) => setHole(s.id, hole, v)}
              />
            ))}
          </div>

          {allScored && hole < 18 && (
            <div className="px-4 mt-4">
              <button className="btn-primary w-full" onClick={() => setHole_((h) => h + 1)}>
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
          <div className="font-semibold text-sm truncate">{subject.name}</div>
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
        {quick.map((n) => (
          <button
            key={n}
            onClick={() => onScore(value === n ? null : n)}
            className={`flex-1 h-12 rounded-xl font-bold num text-base transition-colors ${
              value === n
                ? "bg-violet-600 text-white"
                : n === par
                  ? "bg-slate-800 text-slate-200 ring-1 ring-slate-700"
                  : "bg-slate-800/60 text-slate-300 hover:bg-slate-700"
            }`}
          >
            {n}
          </button>
        ))}
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
