import { useMemo, useState } from "react";
import type { Card, EventDoc, FieldPlayer, Round, RoundStatus } from "../types";
import { courses, teeDotClass, teeLabel } from "../data/courses";
import { defaultGroups } from "../data/rounds";
import { Header, Segmented } from "../components/Chrome";
import ScoreAdmin from "./ScoreAdmin";

interface Props {
  event: EventDoc;
  rounds: Round[];
  cards: Record<string, Record<string, Card>>;
  setCard: (roundId: string, subjectId: string, holes: Record<string, number>) => Promise<void>;
  deleteCard: (roundId: string, subjectId: string) => Promise<void>;
  saveEvent: (patch: Partial<EventDoc>) => Promise<void>;
  saveRound: (round: Round) => Promise<void>;
  setHole: (roundId: string, subjectId: string, hole: number, value: number | null) => void;
  onClose: () => void;
}

export default function AdminScreen({
  event,
  rounds,
  cards,
  setCard,
  deleteCard,
  saveEvent,
  saveRound,
  setHole,
  onClose,
}: Props) {
  const [tab, setTab] = useState<"pairs" | "groups" | "rounds" | "scores">("pairs");

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
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { id: "pairs", label: "Pairs" },
          { id: "groups", label: "Flights" },
          { id: "rounds", label: "Rounds" },
          { id: "scores", label: "Scores" },
        ]}
      />
      <div className="mt-4">
        {tab === "pairs" && <PairsEditor event={event} saveEvent={saveEvent} />}
        {tab === "groups" && <GroupsEditor event={event} rounds={rounds} saveRound={saveRound} />}
        {tab === "rounds" && <RoundsEditor rounds={rounds} saveRound={saveRound} />}
        {tab === "scores" && (
          <ScoreAdmin
            event={event}
            rounds={rounds}
            cards={cards}
            setHole={setHole}
            setCard={setCard}
            deleteCard={deleteCard}
            saveEvent={saveEvent}
            saveRound={saveRound}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pairs — entered manually after Thursday night's draft
// ---------------------------------------------------------------------------

function PairsEditor({
  event,
  saveEvent,
}: {
  event: EventDoc;
  saveEvent: (patch: Partial<EventDoc>) => Promise<void>;
}) {
  const [picking, setPicking] = useState<string | null>(null);

  const paired = useMemo(
    () => new Set(event.pairs.flatMap((p) => [p.aId, p.bId])),
    [event.pairs],
  );
  const byId = new Map(event.players.map((p) => [p.id, p]));
  const freeBucket1 = event.players.filter((p) => p.bucket === 1 && !paired.has(p.id));
  const freeBucket2 = event.players.filter((p) => p.bucket === 2 && !paired.has(p.id));

  async function addPair(aId: string, bId: string) {
    await saveEvent({
      pairs: [...event.pairs, { id: `pair-${event.pairs.length + 1}-${aId}`, aId, bId }],
    });
    setPicking(null);
  }

  async function removePair(id: string) {
    await saveEvent({ pairs: event.pairs.filter((p) => p.id !== id) });
  }

  return (
    <div className="px-4 space-y-4">
      <p className="text-xs text-slate-400 leading-relaxed">
        Round 1 decides the draft order. Its winner picks first, choosing from the other bucket.
        Enter each pick here as it happens — everyone's app updates live.
      </p>

      <section>
        <h2 className="label mb-2">Pairs ({event.pairs.length} of 10)</h2>
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
                </div>
                <button
                  onClick={() => removePair(pair.id)}
                  className="text-xs text-rose-400 hover:text-rose-300 shrink-0 px-2"
                >
                  Remove
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      {freeBucket1.length > 0 && (
        <section>
          <h2 className="label mb-2">Next pick</h2>
          {!picking ? (
            <div className="grid grid-cols-2 gap-2">
              {freeBucket1.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPicking(p.id)}
                  className="card px-3 py-2.5 text-left hover:border-violet-600"
                >
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="text-[11px] text-slate-500 num">Bucket 1 · {p.hi.toFixed(1)}</div>
                </button>
              ))}
            </div>
          ) : (
            <div>
              <p className="text-sm mb-2">
                <span className="font-semibold text-violet-300">{byId.get(picking)?.name}</span>{" "}
                picks from bucket 2:
              </p>
              <div className="grid grid-cols-2 gap-2">
                {freeBucket2.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addPair(picking, p.id)}
                    className="card px-3 py-2.5 text-left hover:border-violet-600"
                  >
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-[11px] text-slate-500 num">{p.hi.toFixed(1)}</div>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setPicking(null)}
                className="text-xs text-slate-500 mt-3 underline underline-offset-2"
              >
                Cancel
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flights — who plays with whom, per round
// ---------------------------------------------------------------------------

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
  const round = rounds.find((r) => r.id === roundId) ?? rounds[0];
  const byId = new Map(event.players.map((p) => [p.id, p]));

  if (!round) return null;

  const assigned = new Set(round.groups.flatMap((g) => g.playerIds));
  const unassigned = event.players.filter((p) => !assigned.has(p.id));

  const update = (groups: Round["groups"]) => saveRound({ ...round, groups });

  function movePlayer(playerId: string, toGroupId: string | null) {
    const groups = round.groups.map((g) => ({
      ...g,
      playerIds: g.playerIds.filter((id) => id !== playerId),
    }));
    if (toGroupId) {
      const target = groups.find((g) => g.id === toGroupId);
      target?.playerIds.push(playerId);
    }
    void update(groups);
  }

  /** Keeps each pair in the same flight — the team formats need both cards together. */
  function autoFillByPairs() {
    if (event.pairs.length === 0) return;
    const groups = defaultGroups(round.teeTimeWindow, Math.ceil(event.pairs.length / 2)).map(
      (g) => ({ ...g, playerIds: [] as string[] }),
    );
    event.pairs.forEach((pair, i) => {
      const target = groups[Math.floor(i / 2)] ?? groups[groups.length - 1];
      target.playerIds.push(pair.aId, pair.bId);
    });
    void update(groups);
  }

  return (
    <div className="px-4 space-y-4">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {rounds.map((r) => (
          <button
            key={r.id}
            onClick={() => setRoundId(r.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold num ${
              r.id === round.id ? "bg-violet-600 text-white" : "bg-slate-900 text-slate-400 border border-slate-800"
            }`}
          >
            R{r.seq}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <button onClick={autoFillByPairs} disabled={event.pairs.length === 0} className="btn-ghost flex-1 py-2 text-xs">
          Auto-fill two pairs per flight
        </button>
        <button
          onClick={() => update(defaultGroups(round.teeTimeWindow))}
          className="btn-ghost px-3 py-2 text-xs"
        >
          Clear
        </button>
      </div>

      {unassigned.length > 0 && (
        <section>
          <h2 className="label mb-2">Not assigned ({unassigned.length})</h2>
          <div className="flex flex-wrap gap-1.5">
            {unassigned.map((p) => (
              <PlayerChip
                key={p.id}
                player={p}
                groups={round.groups}
                onMove={(gid) => movePlayer(p.id, gid)}
              />
            ))}
          </div>
        </section>
      )}

      {round.groups.map((g) => (
        <section key={g.id} className="card p-3">
          <div className="flex items-center justify-between mb-2">
            <input
              className="input py-1 px-2 w-24 num text-sm"
              value={g.teeTime}
              onChange={(e) =>
                update(round.groups.map((x) => (x.id === g.id ? { ...x, teeTime: e.target.value } : x)))
              }
            />
            <span className="text-[11px] text-slate-500 num">{g.playerIds.length} players</span>
          </div>
          {g.playerIds.length === 0 ? (
            <p className="text-xs text-slate-600">Empty</p>
          ) : (
            <ul className="space-y-1">
              {g.playerIds.map((id) => (
                <li key={id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{byId.get(id)?.name}</span>
                  <button
                    onClick={() => movePlayer(id, null)}
                    className="text-xs text-slate-500 hover:text-rose-400 px-1"
                    aria-label={`Remove ${byId.get(id)?.name}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

function PlayerChip({
  player,
  groups,
  onMove,
}: {
  player: FieldPlayer;
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
        {player.name}
      </button>
      {open && (
        <div className="absolute z-20 mt-1 card p-1 min-w-[7rem] shadow-xl">
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => {
                onMove(g.id);
                setOpen(false);
              }}
              className="block w-full text-left text-xs px-2 py-1.5 rounded-lg hover:bg-slate-800 num"
            >
              {g.teeTime}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Round setup — course, tee, status, rating overrides
// ---------------------------------------------------------------------------

const STATUSES: RoundStatus[] = ["upcoming", "open", "final"];

function RoundsEditor({
  rounds,
  saveRound,
}: {
  rounds: Round[];
  saveRound: (round: Round) => Promise<void>;
}) {
  return (
    <div className="px-4 space-y-3">
      <p className="text-xs text-slate-400 leading-relaxed">
        Open a round when the first flight tees off — that's what puts it on everyone's Play tab.
        Only one round should be open at a time.
      </p>
      {rounds.map((round) => (
        <RoundEditorCard key={round.id} round={round} saveRound={saveRound} />
      ))}
    </div>
  );
}

function RoundEditorCard({
  round,
  saveRound,
}: {
  round: Round;
  saveRound: (round: Round) => Promise<void>;
}) {
  const course = courses[round.courseId];
  const tee = course.tees[round.tee];
  const patch = (p: Partial<Round>) => saveRound({ ...round, ...p });

  return (
    <div className="card p-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-bold text-violet-400 num">R{round.seq}</span>
          <span className="text-sm font-semibold ml-2">{round.day}</span>
          <span className="text-xs text-slate-500 ml-2 num">{round.teeTimeWindow}</span>
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
            onClick={() => patch({ status: s })}
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
        <p className="text-[10px] text-amber-500/80 leading-relaxed">
          hector.golf publishes {teeLabel[round.tee]} at {tee.cr}, higher than the white tee — almost
          certainly the ladies' rating. Check the club scorecard and override CR above.
        </p>
      )}

      <ul className="text-[11px] text-slate-500 space-y-0.5">
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
