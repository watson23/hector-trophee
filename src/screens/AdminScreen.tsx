import { useEffect, useMemo, useRef, useState } from "react";
import { usePersistentState } from "../hooks/usePersistentState";
import { flightsForPairs, MAX_PER_FLIGHT, teeWindow } from "../lib/flights";
import type { Card, EventDoc, FieldPlayer, Round, RoundStatus } from "../types";
import { snapshotHandicaps, type RoundResult } from "../lib/engine";
import { courses, teeDotClass, teeLabel, teeText } from "../data/courses";
import { DEFAULT_FLIGHT_COUNT, defaultGroups, defaultRounds } from "../data/rounds";
import { Header, Segmented } from "../components/Chrome";
import { spaceLink, switchSpace, type Space } from "../lib/space";
import ScoreAdmin from "./ScoreAdmin";
import HandicapRefresh from "../components/HandicapRefresh";

interface Props {
  event: EventDoc;
  rounds: Round[];
  space: Space;
  backend: "firestore" | "local" | null;
  mirrorFrom: ((sourceEventId: string) => Promise<number>) | null;
  cards: Record<string, Record<string, Card>>;
  roundResults: Record<string, RoundResult>;
  setCard: (roundId: string, subjectId: string, holes: Record<string, number>) => Promise<void>;
  deleteCard: (roundId: string, subjectId: string) => Promise<void>;
  saveEvent: (patch: Partial<EventDoc>) => Promise<void>;
  saveRound: (round: Round) => Promise<void>;
  setHole: (roundId: string, subjectId: string, hole: number, value: number | null) => void;
  onClose: () => void;
  /** Hand the organiser role back: the pill goes, the PIN is needed to return. */
  onSignOut: () => void;
}

export default function AdminScreen({
  event,
  rounds,
  space,
  backend,
  mirrorFrom,
  cards,
  roundResults,
  setCard,
  deleteCard,
  saveEvent,
  saveRound,
  setHole,
  onClose,
  onSignOut,
}: Props) {
  // Rounds first: it and Flights are the daily workspace, while Pairs is essentially
  // never touched again after Thursday's draft. Session-persisted, like the rest of the
  // UI position, so a refresh lands back on the same section.
  const [tab, setTab] = usePersistentState<"pairs" | "groups" | "rounds" | "scores">(
    "hectro_ui.adminTab",
    "rounds",
    "session",
  );

  return (
    <div className="pb-4">
      <Header
        title="Admin"
        subtitle="Draft results, flights and round setup"
        right={
          <button onClick={onClose} className="btn-ghost px-3 py-2 text-sm shrink-0">
            Done
          </button>
        }
      />
      {/* Which copy of the event this device edits — visible on every admin tab, since
          it changes what all the buttons below actually touch. */}
      <div
        className={`mx-4 mb-3 rounded-2xl border p-3 ${
          space === "test"
            ? "border-sky-900 bg-sky-950/30"
            : space === "field"
              ? "border-amber-900 bg-amber-950/20"
              : "border-slate-800 bg-slate-900"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div
              className={`text-xs font-semibold ${
                space === "test" ? "text-sky-300" : space === "field" ? "text-amber-300" : ""
              }`}
            >
              {space === "test" ? "Test space" : space === "field" ? "Field test · Hirsala" : "Tournament"}
            </div>
            <p className="text-[12px] text-slate-500 leading-relaxed">
              {space === "test"
                ? "A sandbox with its own data — nothing here touches the tournament."
                : space === "field"
                  ? "Real rounds at Hirsala, fully separate from the tournament and sandbox."
                  : "The real data everyone sees. Switch this phone to the test space to play around safely."}
            </p>
          </div>
          <button
            onClick={() => switchSpace(space === "live" ? "test" : "live")}
            className="btn-ghost px-3 py-1.5 text-xs shrink-0"
          >
            {space === "live" ? "To test space" : "To tournament"}
          </button>
        </div>
        {space === "live" && (
          <button
            onClick={() => switchSpace("field")}
            className="mt-2 text-xs text-amber-400/90 underline underline-offset-2"
          >
            Field test space (Hirsala)
          </button>
        )}
        {space !== "live" && <InviteLink space={space} />}
      </div>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { id: "rounds", label: "Rounds" },
          { id: "groups", label: "Flights" },
          { id: "scores", label: "Scores" },
          { id: "pairs", label: "Pairs" },
        ]}
      />
      <div className="mt-4">
        {tab === "pairs" && (
          <PairsEditor
            event={event}
            rounds={rounds}
            roundResults={roundResults}
            saveEvent={saveEvent}
          />
        )}
        {tab === "groups" && <GroupsEditor event={event} rounds={rounds} saveRound={saveRound} />}
        {tab === "rounds" && (
          <>
            <RoundsEditor rounds={rounds} players={event.players} saveRound={saveRound} />
            <HandicapRefresh event={event} rounds={rounds} saveEvent={saveEvent} />
          </>
        )}
        {tab === "scores" && (
          <ScoreAdmin
            event={event}
            rounds={rounds}
            space={space}
            backend={backend}
            mirrorFrom={mirrorFrom}
            cards={cards}
            setHole={setHole}
            setCard={setCard}
            deleteCard={deleteCard}
            saveEvent={saveEvent}
            saveRound={saveRound}
          />
        )}
      </div>

      {/* A formal way out of the role, for someone who wants to play a round as a
          plain player — no hovering pill, no accidental edits. Bottom of the page,
          under everything: an exit, not a control you reach for daily. */}
      <div className="px-4 mt-10 text-center">
        <button
          onClick={onSignOut}
          className="text-[13px] font-medium text-slate-500 underline underline-offset-4 py-2"
        >
          Sign out of organiser role
        </button>
        <p className="mt-1 text-[12px] text-slate-600">
          The Admin button disappears from your screen. The organiser PIN lets you back in.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pairs — entered manually after Thursday night's draft
// ---------------------------------------------------------------------------

/**
 * Inviting another phone into this space: a link that sets the space on arrival, so a
 * tester goes straight to the PIN and their name — no organiser access needed.
 */
function InviteLink({ space }: { space: Space }) {
  const [copied, setCopied] = useState(false);
  const link = spaceLink(space);
  return (
    <div className="mt-2.5 flex items-center justify-between gap-3 text-[12px]">
      <span className="min-w-0 truncate text-slate-500">
        Invite a tester: <span className="num text-slate-400">{link.replace(/^https?:\/\//, "")}</span>
      </span>
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard unavailable — the link is written out beside the button */
          }
        }}
        className="btn-ghost px-2.5 py-1 text-xs shrink-0"
      >
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}

function PairsEditor({
  event,
  rounds,
  roundResults,
  saveEvent,
}: {
  event: EventDoc;
  rounds: Round[];
  roundResults: Record<string, RoundResult>;
  saveEvent: (patch: Partial<EventDoc>) => Promise<void>;
}) {
  const [picking, setPicking] = useState<string | null>(null);
  const [chooseAny, setChooseAny] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const byId = useMemo(() => new Map(event.players.map((p) => [p.id, p])), [event.players]);
  const paired = useMemo(
    () => new Set(event.pairs.flatMap((p) => [p.aId, p.bId])),
    [event.pairs],
  );

  /**
   * Last year's winners defend together, so they are not drafted. Until that is settled
   * they sit out of the pool entirely — the draft runs among the other eighteen.
   */
  const defending = event.defendingPair;
  const defenders = (defending ?? []).map((id) => byId.get(id)).filter(Boolean) as FieldPlayer[];
  const defenceUnsettled = defenders.length === 2 && !defenders.some((d) => paired.has(d.id));
  const outOfDraft = new Set(defenceUnsettled ? defenders.map((d) => d.id) : []);

  async function lockInDefenders() {
    if (defenders.length !== 2) return;
    await saveEvent({
      pairs: [
        { id: `pair-defending-${defenders[0].id}`, aId: defenders[0].id, bId: defenders[1].id, defending: true },
        ...event.pairs,
      ],
    });
  }

  /**
   * The draft order is the round 1 Stableford result, and the winner may come from either
   * bucket — in 2025 it was a 16.5 handicap from bucket 2 who picked first. Ranking here
   * rather than making the organiser work it out also means the app can just say whose
   * turn it is.
   */
  const draftRound = rounds.find((r) => r.formats.some((f) => f.hector?.source === "betterIndividual"));
  const order = useMemo(() => {
    const stableford = draftRound
      ? roundResults[draftRound.id]?.formats.find((f) => f.spec.kind === "stableford")
      : undefined;
    return [...(stableford?.players ?? [])]
      .filter((p) => p.thru > 0)
      .sort((a, b) => b.value - a.value);
  }, [draftRound, roundResults]);

  const hasResult = order.length > 0;
  const unpaired = event.players.filter((p) => !paired.has(p.id) && !outOfDraft.has(p.id));
  // Whoever is highest in the round 1 order and still without a partner.
  const nextUp =
    order.find((p) => !paired.has(p.playerId) && !outOfDraft.has(p.playerId))?.playerId ?? null;
  const picker = picking ?? (chooseAny ? null : nextUp);
  const pickerPlayer = picker ? byId.get(picker) : null;
  const choices = pickerPlayer
    ? unpaired.filter((p) => p.bucket !== pickerPlayer.bucket && p.id !== pickerPlayer.id)
    : [];
  const rankOf = (id: string) => order.findIndex((p) => p.playerId === id) + 1;
  const pointsOf = (id: string) => order.find((p) => p.playerId === id)?.value;

  async function addPair(aId: string, bId: string) {
    await saveEvent({
      pairs: [...event.pairs, { id: `pair-${event.pairs.length + 1}-${aId}`, aId, bId }],
    });
    setPicking(null);
    setChooseAny(false);
  }

  async function removePair(id: string) {
    await saveEvent({ pairs: event.pairs.filter((p) => p.id !== id) });
  }

  const target = Math.floor(event.players.length / 2);

  return (
    <div className="px-4 space-y-4">
      {!hasResult && (
        <p className="text-xs text-amber-400/90 bg-amber-950/30 border border-amber-900/60 rounded-xl px-3 py-2 leading-relaxed">
          Round 1 hasn't been played yet, so there's no draft order. Pairs don't exist until
          it has been — you can still enter them by hand below if you're setting up ahead of
          time.
        </p>
      )}

      {defenceUnsettled && (
        <section className="card p-3.5 border-amber-500/30 bg-amber-500/[0.06]">
          <h2 className="text-[12px] font-semibold uppercase tracking-wider text-amber-400 mb-1">
            Defending champions
          </h2>
          <p className="text-sm font-semibold text-amber-100">
            {defenders[0].name} + {defenders[1].name}
          </p>
          <p className="text-[12px] text-slate-400 leading-relaxed mt-1 mb-3">
            Won in 2025, so they defend together and are not in the draft. The other{" "}
            {event.players.length - 2} pick among themselves.
          </p>
          <div className="flex gap-2">
            <button onClick={lockInDefenders} className="btn-primary flex-1 py-2 text-xs">
              Pair them
            </button>
            <button
              onClick={() => saveEvent({ defendingPair: null })}
              className="btn-ghost px-3 py-2 text-xs"
            >
              They're not defending
            </button>
          </div>
        </section>
      )}

      {/* Draft night's on/off switch. The board on everyone's Round tab — relabelled
          "Draft" — stays up after the last pick so the room can look at the result;
          this is where the organiser brings the app back to its normal shape. */}
      {draftRound?.status === "final" && (
        <section className="card p-3.5 border-violet-800/60 bg-violet-950/25">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[12px] font-semibold uppercase tracking-wider text-violet-300">
                Draft night
              </h2>
              <p className="text-[12px] text-slate-400 leading-relaxed mt-0.5">
                {event.draftConcluded
                  ? "Concluded — the Round tab and board are back to normal."
                  : event.pairs.length >= target
                    ? "All pairs set. The board stays on every phone until you conclude the draft."
                    : `The Round tab reads "Draft" and shows the board on every phone.`}
              </p>
            </div>
            <button
              onClick={() => saveEvent({ draftConcluded: !event.draftConcluded })}
              className={`${event.draftConcluded ? "btn-ghost" : "btn-primary"} px-3 py-2 text-xs shrink-0`}
            >
              {event.draftConcluded ? "Reopen draft" : "Conclude draft"}
            </button>
          </div>
        </section>
      )}

      <section>
        <h2 className="label mb-2">
          Pairs ({event.pairs.length} of {target})
        </h2>
        {event.pairs.length === 0 ? (
          <p className="text-sm text-slate-500 py-3">No pairs yet.</p>
        ) : (
          <ol className="space-y-2">
            {event.pairs.map((pair, i) => (
              <li key={pair.id} className="card p-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs num text-slate-600 w-4">{i + 1}</span>
                  <span className="text-sm font-medium truncate">
                    {byId.get(pair.aId)?.name} + {byId.get(pair.bId)?.name}
                  </span>
                  {pair.defending && (
                    <span className="pill bg-amber-950 text-amber-300 shrink-0">defending</span>
                  )}
                </div>
                {/* Two taps, like clearing a round: pairs drive the scoring for rounds
                    2–6, so a stray thumb must not dissolve one mid-tournament. */}
                {confirmRemove === pair.id ? (
                  <span className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => {
                        removePair(pair.id);
                        setConfirmRemove(null);
                      }}
                      className="text-xs font-semibold text-white bg-rose-600 rounded-lg px-2 py-1"
                    >
                      Yes, remove
                    </button>
                    <button
                      onClick={() => setConfirmRemove(null)}
                      className="text-xs text-slate-400 px-1.5 py-1"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmRemove(pair.id)}
                    className="text-xs text-rose-400 hover:text-rose-300 shrink-0 px-2"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {unpaired.length > 1 && (
        <section>
          <h2 className="label mb-2">Next pick</h2>

          {pickerPlayer ? (
            <>
              <div className="card p-3 mb-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-violet-300 truncate">
                    {pickerPlayer.name}
                  </div>
                  <div className="text-[12px] text-slate-500 num">
                    Bucket {pickerPlayer.bucket} · HCP {pickerPlayer.hi.toFixed(1)}
                    {hasResult && rankOf(pickerPlayer.id) > 0 && (
                      <> · round 1: {pointsOf(pickerPlayer.id)} pts, #{rankOf(pickerPlayer.id)}</>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setPicking(null);
                    setChooseAny(true);
                  }}
                  className="text-xs text-slate-400 underline underline-offset-2 shrink-0"
                >
                  someone else
                </button>
              </div>
              <p className="text-xs text-slate-400 mb-2">
                picks from bucket {pickerPlayer.bucket === 1 ? 2 : 1}:
              </p>
              <div className="grid grid-cols-2 gap-2">
                {choices.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addPair(pickerPlayer.id, p.id)}
                    className="card px-3 py-2.5 text-left hover:border-violet-600"
                  >
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-[12px] text-slate-500 num">
                      {hasResult && rankOf(p.id) > 0
                        ? `${pointsOf(p.id)} pts · #${rankOf(p.id)}`
                        : `HCP ${p.hi.toFixed(1)}`}
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-slate-400 mb-2">Who is picking?</p>
              <div className="grid grid-cols-2 gap-2">
                {(hasResult
                  ? order
                      .filter((o) => !paired.has(o.playerId) && !outOfDraft.has(o.playerId))
                      .map((o) => byId.get(o.playerId)!)
                  : unpaired
                ).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setPicking(p.id);
                      setChooseAny(false);
                    }}
                    className="card px-3 py-2.5 text-left hover:border-violet-600"
                  >
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-[12px] text-slate-500 num">
                      B{p.bucket}
                      {hasResult && rankOf(p.id) > 0
                        ? ` · ${pointsOf(p.id)} pts · #${rankOf(p.id)}`
                        : ` · HCP ${p.hi.toFixed(1)}`}
                    </div>
                  </button>
                ))}
              </div>
              {nextUp && (
                <button
                  onClick={() => {
                    setChooseAny(false);
                    setPicking(null);
                  }}
                  className="text-xs text-slate-500 mt-3 underline underline-offset-2"
                >
                  back to {byId.get(nextUp)?.name}, who is up next
                </button>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flights — who plays with whom, per round
// ---------------------------------------------------------------------------


/**
 * A "unit" is what gets moved in and out of flights: a whole pair once the draft is
 * done (the team formats need both cards in the same flight anyway, and assigning
 * twenty players one tap at a time was twice the work), or a single player in the
 * individual round — and as a fallback for anyone whose partner is somewhere odd.
 */
interface FlightUnit {
  key: string;
  label: string;
  playerIds: string[];
}

function GroupsEditor({
  event,
  rounds,
  saveRound,
}: {
  event: EventDoc;
  rounds: Round[];
  saveRound: (round: Round) => Promise<void>;
}) {
  const [roundId, setRoundId] = useState(rounds[0]?.id);
  // Both bulk actions replace the whole sheet — and flights are usually built by hand,
  // by whatever principle the group negotiates (leaders pick first, reverse of
  // yesterday…), so a stray tap must not be able to flatten that work.
  const [confirmSheet, setConfirmSheet] = useState<"fill" | "clear" | null>(null);
  const round = rounds.find((r) => r.id === roundId) ?? rounds[0];
  const byId = new Map(event.players.map((p) => [p.id, p]));

  if (!round) return null;

  // Pairs are the unit everywhere except the draft round, which is played individually.
  const pairMode =
    event.pairs.length > 0 &&
    !round.formats.some((f) => f.hector?.source === "betterIndividual");

  const assigned = new Set(round.groups.flatMap((g) => g.playerIds));

  /** Unassigned, grouped into movable units. */
  const unassignedUnits: FlightUnit[] = [];
  if (pairMode) {
    const inPair = new Set<string>();
    for (const pair of event.pairs) {
      inPair.add(pair.aId);
      inPair.add(pair.bId);
      if (!assigned.has(pair.aId) && !assigned.has(pair.bId)) {
        const a = byId.get(pair.aId);
        const b = byId.get(pair.bId);
        if (a && b) {
          unassignedUnits.push({ key: pair.id, label: `${a.name} + ${b.name}`, playerIds: [pair.aId, pair.bId] });
        }
      }
    }
    // Anyone unpaired, or whose partner is already placed, still moves alone.
    for (const p of event.players) {
      if (assigned.has(p.id)) continue;
      if (inPair.has(p.id) && !unassignedUnits.some((u) => u.playerIds.includes(p.id))) {
        unassignedUnits.push({ key: p.id, label: p.name, playerIds: [p.id] });
      } else if (!inPair.has(p.id)) {
        unassignedUnits.push({ key: p.id, label: p.name, playerIds: [p.id] });
      }
    }
  } else {
    for (const p of event.players) {
      if (!assigned.has(p.id)) unassignedUnits.push({ key: p.id, label: p.name, playerIds: [p.id] });
    }
  }

  /** What a flight holds, rendered in the same units. */
  function groupUnits(g: Round["groups"][number]): FlightUnit[] {
    if (!pairMode) {
      return g.playerIds.map((id) => ({ key: id, label: byId.get(id)?.name ?? id, playerIds: [id] }));
    }
    const units: FlightUnit[] = [];
    const used = new Set<string>();
    for (const pair of event.pairs) {
      if (g.playerIds.includes(pair.aId) && g.playerIds.includes(pair.bId)) {
        const a = byId.get(pair.aId);
        const b = byId.get(pair.bId);
        units.push({ key: pair.id, label: `${a?.name} + ${b?.name}`, playerIds: [pair.aId, pair.bId] });
        used.add(pair.aId);
        used.add(pair.bId);
      }
    }
    for (const id of g.playerIds) {
      if (!used.has(id)) units.push({ key: id, label: byId.get(id)?.name ?? id, playerIds: [id] });
    }
    return units;
  }

  const update = (groups: Round["groups"]) => saveRound({ ...round, groups });

  function moveUnit(unit: FlightUnit, toGroupId: string | null) {
    const groups = round.groups.map((g) => ({
      ...g,
      playerIds: g.playerIds.filter((id) => !unit.playerIds.includes(id)),
    }));
    if (toGroupId) {
      const target = groups.find((g) => g.id === toGroupId);
      // Four to a flight is a hard fact of golf, not a preference — never overfill.
      if (!target || target.playerIds.length + unit.playerIds.length > MAX_PER_FLIGHT) return;
      target.playerIds.push(...unit.playerIds);
    }
    void update(groups);
  }

  /**
   * Keeps each pair in the same flight — the team formats need both cards together —
   * and rotates which pairs share one, so it's different company every round rather
   * than the same arrangement six times over.
   */
  function autoFillByPairs() {
    if (event.pairs.length === 0) return;
    void update(flightsForPairs(round, event.pairs));
  }

  const draftRound = round.formats.some((f) => f.hector?.source === "betterIndividual");

  return (
    <div className="px-4 space-y-4">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {rounds.map((r) => (
          <button
            key={r.id}
            onClick={() => {
              setRoundId(r.id);
              setConfirmSheet(null);
            }}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold num ${
              r.id === round.id ? "bg-violet-600 text-white" : "bg-slate-900 text-slate-400 border border-slate-800"
            }`}
          >
            R{r.seq}
          </button>
        ))}
      </div>

      {/* A sheet that lost tee slots (the pre-fix auto-fill could shrink it) gets a
          one-tap rebuild that keeps everyone already placed. */}
      {round.groups.length < DEFAULT_FLIGHT_COUNT && (
        <section className="card p-3.5 border-amber-900/60 bg-amber-950/20">
          <p className="text-xs text-amber-400/90 leading-relaxed mb-3">
            This round has only {round.groups.length} of the {DEFAULT_FLIGHT_COUNT} booked
            tee times, so there aren't enough seats for the field.
          </p>
          <button
            className="btn-ghost w-full py-2 text-xs"
            onClick={() => {
              const groups = defaultGroups(round.teeTimeWindow);
              round.groups.forEach((g, i) => {
                if (groups[i]) groups[i].playerIds = [...g.playerIds];
              });
              void update(groups);
            }}
          >
            Restore all {DEFAULT_FLIGHT_COUNT} tee times (keeps current flights)
          </button>
        </section>
      )}

      {draftRound && unassignedUnits.length > 0 && (
        <TeeTimeDraw
          remaining={unassignedUnits}
          groups={round.groups}
          onPlace={(unit, gid) => moveUnit(unit, gid)}
        />
      )}

      {confirmSheet ? (
        <div className="flex gap-2">
          <button
            onClick={() => {
              if (confirmSheet === "fill") autoFillByPairs();
              else void update(defaultGroups(round.teeTimeWindow));
              setConfirmSheet(null);
            }}
            className="flex-1 rounded-xl py-2 text-xs font-semibold bg-rose-600 text-white"
          >
            Yes, {confirmSheet === "fill" ? "replace the sheet with auto-fill" : "clear every flight"}
          </button>
          <button onClick={() => setConfirmSheet(null)} className="btn-ghost px-4 py-2 text-xs">
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() =>
              round.groups.some((g) => g.playerIds.length > 0)
                ? setConfirmSheet("fill")
                : autoFillByPairs()
            }
            disabled={event.pairs.length === 0}
            className="btn-ghost flex-1 py-2 text-xs"
          >
            Auto-fill two pairs per flight
          </button>
          <button
            onClick={() =>
              round.groups.some((g) => g.playerIds.length > 0)
                ? setConfirmSheet("clear")
                : void update(defaultGroups(round.teeTimeWindow))
            }
            className="btn-ghost px-3 py-2 text-xs"
          >
            Clear
          </button>
        </div>
      )}

      {unassignedUnits.length > 0 && (
        <section>
          <h2 className="label mb-2">
            Not assigned ({unassignedUnits.reduce((a, u) => a + u.playerIds.length, 0)})
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {unassignedUnits.map((u) => (
              <UnitChip key={u.key} unit={u} groups={round.groups} onMove={(gid) => moveUnit(u, gid)} />
            ))}
          </div>
        </section>
      )}

      {round.groups.map((g) => {
        const full = g.playerIds.length >= MAX_PER_FLIGHT;
        return (
          <section key={g.id} className="card p-3">
            <div className="flex items-center justify-between mb-2">
              <input
                className="input py-1 px-2 w-24 num text-sm"
                value={g.teeTime}
                onChange={(e) =>
                  update(round.groups.map((x) => (x.id === g.id ? { ...x, teeTime: e.target.value } : x)))
                }
              />
              <span className={`text-[12px] num ${full ? "text-emerald-500" : "text-slate-500"}`}>
                {g.playerIds.length} players{full ? " · full" : ""}
              </span>
            </div>
            {g.playerIds.length === 0 ? (
              <p className="text-xs text-slate-600">Empty</p>
            ) : (
              <ul className="space-y-1">
                {groupUnits(g).map((u) => (
                  <li key={u.key} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{u.label}</span>
                    <button
                      onClick={() => moveUnit(u, null)}
                      className="text-xs text-slate-500 hover:text-rose-400 px-1"
                      aria-label={`Remove ${u.label}`}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function UnitChip({
  unit,
  groups,
  onMove,
}: {
  unit: FlightUnit;
  groups: Round["groups"];
  onMove: (groupId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-full bg-slate-800 border border-slate-700 px-2.5 py-1 text-xs hover:border-violet-600"
      >
        {unit.label}
      </button>
      {open && (
        <div className="absolute z-20 mt-1 card p-1 min-w-[8rem] shadow-xl">
          {groups.map((g) => {
            const full = g.playerIds.length + unit.playerIds.length > MAX_PER_FLIGHT;
            return (
              <button
                key={g.id}
                disabled={full}
                onClick={() => {
                  onMove(g.id);
                  setOpen(false);
                }}
                className="block w-full text-left text-xs px-2 py-1.5 rounded-lg num
                           hover:bg-slate-800 disabled:text-slate-600 disabled:hover:bg-transparent"
              >
                {g.teeTime} · {g.playerIds.length}/{MAX_PER_FLIGHT}
                {full ? " full" : ""}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * The bus tradition, digitised. Round 1's tee-time order has always been drawn on the
 * bus, one name at a time — the suspense of who picks next is the point, which is why
 * this reveals a single name per draw instead of randomising the whole list at once.
 *
 * "Still in the hat" is simply "not yet assigned to a flight", so there is no draw
 * state to store or migrate: draw a name, the drawn player calls a tee time, the
 * organiser taps it, and every phone's tee sheet updates live. A short roll through
 * the remaining names builds the drumroll before the reveal (skipped under reduced
 * motion). Each draw is uniform over whoever remains, which is exactly the paper
 * version's fairness.
 */
function TeeTimeDraw({
  remaining,
  groups,
  onPlace,
}: {
  remaining: FlightUnit[];
  groups: Round["groups"];
  onPlace: (unit: FlightUnit, groupId: string) => void;
}) {
  const [drawn, setDrawn] = useState<FlightUnit | null>(null);
  const [rolling, setRolling] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
    },
    [],
  );

  // Placed from another device mid-draw? Then they're out of the hat here too.
  const current = drawn && remaining.some((u) => u.key === drawn.key) ? drawn : null;

  function draw() {
    const pick = remaining[Math.floor(Math.random() * remaining.length)];
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDrawn(pick);
      return;
    }
    let ticks = 0;
    setRolling(remaining[Math.floor(Math.random() * remaining.length)].label);
    timer.current = window.setInterval(() => {
      ticks += 1;
      if (ticks > 14) {
        if (timer.current) clearInterval(timer.current);
        setRolling(null);
        setDrawn(pick);
      } else {
        setRolling(remaining[Math.floor(Math.random() * remaining.length)].label);
      }
    }, 90);
  }

  return (
    <section className="card p-3.5 border-violet-800/60 bg-violet-950/20">
      <h2 className="text-[12px] font-semibold uppercase tracking-wider text-violet-300 mb-1">
        Tee time draw
      </h2>
      <p className="text-[12px] text-slate-400 leading-relaxed">
        One name at a time. The drawn player calls a tee time; tap it to lock them in,
        then draw the next.{" "}
        <span className="num">{remaining.length}</span> still in the hat.
      </p>

      {rolling ? (
        <p className="font-serif text-2xl text-center my-4 text-slate-500">{rolling}</p>
      ) : current ? (
        <>
          <p className="finish-flourish font-serif text-2xl font-semibold text-center my-4 text-gold-300">
            {current.label}
          </p>
          <p className="text-xs text-slate-400 mb-2 text-center">picks a tee time:</p>
          <div className="grid grid-cols-3 gap-2">
            {groups.map((g) => {
              const full = g.playerIds.length + current.playerIds.length > MAX_PER_FLIGHT;
              return (
                <button
                  key={g.id}
                  disabled={full}
                  onClick={() => {
                    onPlace(current, g.id);
                    setDrawn(null);
                  }}
                  className="btn-ghost py-2 text-xs num disabled:opacity-40"
                >
                  {g.teeTime}
                  <span className="block text-[11px] text-slate-500">
                    {g.playerIds.length}/{MAX_PER_FLIGHT}
                    {full ? " full" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <button className="btn-primary w-full py-2.5 mt-3" onClick={draw}>
          Draw a name
        </button>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Round setup — course, tee, status, rating overrides
// ---------------------------------------------------------------------------

const STATUSES: RoundStatus[] = ["upcoming", "open", "final"];

function RoundsEditor({
  rounds,
  players,
  saveRound,
}: {
  rounds: Round[];
  players: FieldPlayer[];
  saveRound: (round: Round) => Promise<void>;
}) {
  return (
    <div className="px-4 space-y-3">
      <p className="text-xs text-slate-400 leading-relaxed">
        Open a round when the first flight tees off — that's what puts it on everyone's Play tab.
        Only one round should be open at a time.
      </p>
      {rounds.map((round) => (
        <RoundEditorCard
          key={round.id}
          round={round}
          players={players}
          saveRound={saveRound}
        />
      ))}
    </div>
  );
}

function RoundEditorCard({
  round,
  players,
  saveRound,
}: {
  round: Round;
  players: FieldPlayer[];
  saveRound: (round: Round) => Promise<void>;
}) {
  const course = courses[round.courseId];
  const tee = course.tees[round.tee];
  // One step of undo: the round as it was before the last edit made from this card.
  // A stray tap on a select is the accident this exists for.
  const [undo, setUndo] = useState<Round | null>(null);
  const patch = (p: Partial<Round>) => {
    setUndo(round);
    return saveRound({ ...round, ...p });
  };
  // What the official programme says for this round — shown when the card has strayed
  // from it. Only meaningful for the tournament's own courses (the field space plays
  // elsewhere and has no programme to stray from).
  const programme = defaultRounds.find((r) => r.id === round.id);
  const programmeCourses = new Set(defaultRounds.map((r) => r.courseId));
  const strayed =
    programme &&
    programmeCourses.has(round.courseId) &&
    (programme.courseId !== round.courseId || programme.tee !== round.tee);

  /**
   * Opening a round freezes the handicaps it is played off. Handicaps are refreshed each
   * morning, so without this a later update would rescore a round already in the books.
   */
  function setStatus(status: RoundStatus) {
    setUndo(round);
    if (status === "open" && !round.handicaps) {
      void saveRound({ ...snapshotHandicaps(round, players), status });
    } else {
      void saveRound({ ...round, status });
    }
  }

  return (
    <div className="card p-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-bold text-violet-400 num">R{round.seq}</span>
          <span className="text-sm font-semibold ml-2">{round.day}</span>
          <span className="text-xs text-slate-500 ml-2 num">{teeWindow(round)}</span>
        </div>
        {round.provisional && (
          <button
            onClick={() => patch({ provisional: false })}
            className="pill bg-amber-950 text-amber-300 hover:bg-amber-900"
          >
            Provisional — confirm
          </button>
        )}
      </div>

      <div className="flex gap-1">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`flex-1 rounded-lg py-1.5 text-xs font-semibold capitalize transition-colors ${
              round.status === s
                ? s === "open"
                  ? "bg-emerald-600 text-white"
                  : "bg-violet-600 text-white"
                : "bg-slate-800 text-slate-400"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="label">Course</span>
          <select
            className="input w-full mt-1 text-sm"
            value={round.courseId}
            onChange={(e) => {
              const next = courses[e.target.value];
              const nextTee = next.tees[round.tee] ? round.tee : Object.keys(next.tees)[0];
              patch({ courseId: e.target.value, tee: nextTee, crOverride: undefined, slopeOverride: undefined });
            }}
          >
            {Object.values(courses).map((c) => (
              <option key={c.id} value={c.id}>
                {c.shortName}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Tee</span>
          <select
            className="input w-full mt-1 text-sm"
            value={round.tee}
            onChange={(e) => patch({ tee: e.target.value, crOverride: undefined, slopeOverride: undefined })}
          >
            {Object.keys(course.tees).map((t) => (
              <option key={t} value={t}>
                {teeLabel[t]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {strayed && programme && (
        <p className="text-[12px] text-amber-400/90 leading-relaxed flex items-center justify-between gap-3">
          <span>
            Programme: {courses[programme.courseId]?.shortName} · {teeText(programme.tee)}
          </span>
          <button
            onClick={() => patch({ courseId: programme.courseId, tee: programme.tee, crOverride: undefined, slopeOverride: undefined })}
            className="shrink-0 underline underline-offset-2"
          >
            Reset to programme
          </button>
        </p>
      )}

      {undo && (
        <p className="text-[12px] text-slate-400 flex items-center justify-between gap-3 bg-slate-800/60 rounded-lg px-2.5 py-1.5">
          <span>Changed.</span>
          <button
            onClick={() => {
              void saveRound(undo);
              setUndo(null);
            }}
            className="shrink-0 font-semibold text-violet-300 underline underline-offset-2"
          >
            Undo
          </button>
        </p>
      )}

      <div className="flex items-center gap-2 text-xs">
        <span className={`inline-block w-2.5 h-2.5 rounded-full ${teeDotClass[round.tee]}`} />
        <label className="flex items-center gap-1.5">
          <span className="text-slate-500">CR</span>
          <input
            type="number"
            step="0.1"
            className="input py-1 px-2 w-20 num text-xs"
            value={round.crOverride ?? tee.cr}
            onChange={(e) => patch({ crOverride: Number(e.target.value) })}
          />
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-slate-500">Slope</span>
          <input
            type="number"
            className="input py-1 px-2 w-20 num text-xs"
            value={round.slopeOverride ?? tee.slope}
            onChange={(e) => patch({ slopeOverride: Number(e.target.value) })}
          />
        </label>
        {(round.crOverride !== undefined || round.slopeOverride !== undefined) && (
          <button
            onClick={() => patch({ crOverride: undefined, slopeOverride: undefined })}
            className="text-slate-500 underline underline-offset-2"
          >
            reset
          </button>
        )}
      </div>

      {tee.suspect && round.crOverride === undefined && (
        <p className="text-[11px] text-amber-500/80 leading-relaxed">
          hector.golf publishes {teeLabel[round.tee]} at {tee.cr}, higher than the white tee — almost
          certainly the ladies' rating. Check the club scorecard and override CR above.
        </p>
      )}

      <ul className="text-[12px] text-slate-500 space-y-0.5">
        {round.formats.map((f) => (
          <li key={f.id}>
            {f.label} · {Math.round(f.allowance * 100)}%
            {f.hector && ` · Hector ${Math.round(f.hector.pct * 100)}% ${f.hector.source}`}
            {f.victor && " · Victor"}
          </li>
        ))}
      </ul>
    </div>
  );
}
