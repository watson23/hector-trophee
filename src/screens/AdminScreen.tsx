import { useEffect, useMemo, useRef, useState } from "react";
import { DEFENDING_PAIR } from "../lib/store";
import { HOLE_CAP_HELP, HOLE_CAP_LABEL } from "../lib/holeCap";
import { usePersistentState } from "../hooks/usePersistentState";
import { flightsForPairs, MAX_PER_FLIGHT, teeWindow, placeUnit } from "../lib/flights";
import type { Card, EventDoc, FieldPlayer, FormatSpec, Round, Course, Pair, HoleCapRule, UsageDay } from "../types";
import { DEFAULT_DRIVES, type RoundResult } from "../lib/engine";
import { courses, teeDotClass, teeLabel, teeText } from "../data/courses";
import { DEFAULT_FLIGHT_COUNT, defaultGroups, defaultRounds, FORMAT_PRESETS } from "../data/rounds";
import { Header, Segmented } from "../components/Chrome";
import TodayPanel from "../components/TodayPanel";
import ToolCard from "../components/ToolCard";
import HcpOwed from "../components/HcpOwed";
import { todayTasks } from "../lib/today";
import type { AdminLevel } from "../hooks/useSession";
import { shareOrDownload, summarizeUsage, usageCsv, usageText } from "../lib/usageExport";
import { SPACES, spaceLink, spaceMeta, switchSpace, type Space } from "../lib/space";
import ScoreAdmin from "./ScoreAdmin";
import BackupAdmin, { type BackupApi } from "./BackupAdmin";
import HandicapRefresh from "../components/HandicapRefresh";
import HandicapAdjust from "../components/HandicapAdjust";

interface Props {
  /** Full: everything. Helper: Today, Flights, Pairs, and two tools — the week, not its setup. */
  level: AdminLevel;
  event: EventDoc;
  rounds: Round[];
  space: Space;
  backend: "firestore" | "local" | null;
  mirrorFrom: ((sourceEventId: string) => Promise<number>) | null;
  cards: Record<string, Record<string, Card>>;
  roundResults: Record<string, RoundResult>;
  setCard: (roundId: string, subjectId: string, holes: Record<string, number>, drives?: Record<string, string>) => Promise<void>;
  deleteCard: (roundId: string, subjectId: string) => Promise<void>;
  saveEvent: (patch: Partial<EventDoc>) => Promise<void>;
  saveRound: (round: Round) => Promise<void>;
  patchRound: (roundId: string, patch: Partial<Round>) => Promise<void>;
  setHole: (roundId: string, subjectId: string, hole: number, value: number | null) => void;
  onClose: () => void;
  /** Hand the organiser role back: the pill goes, the PIN is needed to return. */
  onSignOut: () => void;
  backups: BackupApi;
  usage: { list: () => Promise<UsageDay[]> };
}

export default function AdminScreen({
  level,
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
  patchRound,
  setHole,
  onClose,
  onSignOut,
  backups,
  usage,
}: Props) {
  // Rounds first: it and Flights are the daily workspace, while Pairs is essentially
  // never touched again after Thursday's draft. Session-persisted, like the rest of the
  // UI position, so a refresh lands back on the same section.
  // Tabs grouped by when they are used: Today, Flights and Pairs run the week; Setup is
  // touched before the trip; Tools are corrections and safety, on need. Session-persisted
  // so a refresh lands back on the same section.
  const [storedTab, setTab] = usePersistentState<"today" | "groups" | "pairs" | "setup" | "tools">(
    "hectro_ui.adminTab",
    "today",
    "session",
  );
  const helper = level === "helper";
  // A helper has no Setup: a stored "setup" from a full session on the same phone opens Today.
  const tab = helper && storedTab === "setup" ? "today" : storedTab;
  const tasks = todayTasks(event, rounds, cards);
  const scoreAdminProps = {
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
    patchRound,
    backup: backups.take,
  };

  return (
    <div className="pb-4">
      <Header
        title={helper ? "Admin · helper" : "Admin"}
        subtitle={helper ? `${spaceMeta(space).label} · tee times, rounds and the draft` : `${spaceMeta(space).label} · today, setup and tools`}
        right={
          <button onClick={onClose} className="btn-ghost px-3 py-2 text-sm shrink-0">
            Done
          </button>
        }
      />
      <Segmented
        value={tab}
        onChange={setTab}
        options={
          helper
            ? [
                { id: "today", label: "Today" },
                { id: "groups", label: "Flights" },
                { id: "pairs", label: "Pairs" },
                { id: "tools", label: "Tools" },
              ]
            : [
                { id: "today", label: "Today" },
                { id: "groups", label: "Flights" },
                { id: "pairs", label: "Pairs" },
                { id: "setup", label: "Setup" },
                { id: "tools", label: "Tools" },
              ]
        }
      />
      <div className="mt-4">
        {tab === "today" && (
          <div className="space-y-4">
            <TodayPanel
              tasks={tasks}
              onOpenRound={(id) => void patchRound(id, { status: "open" })}
              onCloseRound={(id) => void patchRound(id, { status: "final" })}
              onReopenRound={(id) => void patchRound(id, { status: "open" })}
              onConclude={() => void saveEvent({ draftConcluded: true })}
              onGo={setTab}
            />
            <HcpOwed event={event} rounds={rounds} cards={cards} />
            {helper && <Handbook rounds={rounds} />}
          </div>
        )}
        {tab === "pairs" && (
          <PairsEditor
            event={event}
            rounds={rounds}
            roundResults={roundResults}
            saveEvent={saveEvent}
            patchRound={patchRound}
          />
        )}
        {tab === "groups" && <GroupsEditor event={event} rounds={rounds} patchRound={patchRound} />}
        {tab === "setup" && !helper && (
          <>
            <HoleCapCard event={event} saveEvent={saveEvent} />
            <RoundsEditor rounds={rounds} cards={cards} saveRound={saveRound} patchRound={patchRound} />
            <HandicapRefresh event={event} rounds={rounds} saveEvent={saveEvent} />
            <HandicapAdjust event={event} rounds={rounds} saveEvent={saveEvent} patchRound={patchRound} />
          </>
        )}
        {tab === "tools" && (
          <div className="space-y-3">
            {/* First and open: which copy of the event this phone edits is the one thing
                here an organiser reaches for often, and the thing that must never be
                mistaken. */}
            <ToolCard
              defaultOpen
              tone={space === "test" ? "test" : "default"}
              title={`Space · ${spaceMeta(space).label}`}
              description="Which copy of the event this phone edits. Switch between the tournament and the sandbox, or share the sandbox link."
            >
              <SpacesCard space={space} />
            </ToolCard>
            <ToolCard title="Fix a score" description="Correct any hole on any card in any round. Every change is written with your name on it.">
              <ScoreAdmin {...scoreAdminProps} sections={{ fix: true }} />
            </ToolCard>
            {!helper && (
            <>
            <ToolCard title="Backups" description="Snapshots are taken when a round goes final and before anything destructive. Restore a round or the whole week from here.">
              <BackupAdmin rounds={rounds} backups={backups} />
            </ToolCard>
            {space === "test" && mirrorFrom && (
              <ToolCard tone="test" title="Mirror the tournament" description="Copy the tournament's live data into this sandbox, replacing what is here. The tournament is only read.">
                <ScoreAdmin {...scoreAdminProps} sections={{ mirror: true }} />
              </ToolCard>
            )}
            {(space === "test" || backend === "local") && (
              <ToolCard tone="test" title="Test data" description="Play the whole week or fill one round with plausible scores. Sandbox only — this card does not exist in the tournament.">
                <ScoreAdmin {...scoreAdminProps} sections={{ testData: true }} />
              </ToolCard>
            )}
            <ToolCard tone="danger" title="Clear a round" description="Delete every card in one round and put it back to upcoming. A snapshot is taken first.">
              <ScoreAdmin {...scoreAdminProps} sections={{ clear: true }} />
            </ToolCard>
            <ToolCard title="Round status" description="Put any round at upcoming, open or final — reopen an earlier round for a correction, or shuffle the sandbox to another day. Two taps.">
              <ScoreAdmin {...scoreAdminProps} sections={{ status: true }} />
            </ToolCard>
            <ToolCard tone="danger" title="Reset everything" description="Scores, pairs and flights back to a clean event. Two taps, snapshot first, restorable from Backups.">
              <ScoreAdmin {...scoreAdminProps} sections={{ reset: true }} />
            </ToolCard>
            <ToolCard title="App usage" description="Who has opened the app and how much it has been used. Nothing here affects scores.">
              <UsageCard players={event.players} usage={usage} />
            </ToolCard>
            </>
            )}
          </div>
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
          {helper ? "Sign out of helper role" : "Sign out of organiser role"}
        </button>
        <p className="mt-1 text-[12px] text-slate-600">
          The Admin button disappears from your screen. The {helper ? "helper" : "organiser"} PIN lets you back in.
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
/**
 * How the week runs, for a helper standing in the bus: six numbered lines with the
 * timing, in the place the question gets asked. Rounds come from the programme, so a
 * reshuffle rewrites the list on its own.
 */
function Handbook({ rounds }: { rounds: Round[] }) {
  const ordered = [...rounds].sort((a, b) => a.seq - b.seq);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const steps = [
    first ? `${first.day}, in the bus: Today › Draw the tee times. Draw a name, they pick a slot, tap the flight. Then Open round ${first.seq}.` : "",
    "Each round: open it on Today when the first flight tees off (that puts it on everyone's Play tab); close it once every card is in.",
    first ? `${first.day} evening: round ${first.seq} final → Today › Run the draft. Best round picks first, from the other bucket. Conclude the draft when ten pairs stand.` : "",
    "A wrong score: Tools › Fix a score. A round closed too soon: Today › Reopen.",
    "Announcements go on Info › News; the handicap-card list on Today says who still owes a round.",
    last ? `${last.day}: close round ${last.seq} and the week is final.` : "",
  ].filter(Boolean);
  return (
    <section className="mx-4 card p-3.5">
      <h2 className="text-[12px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">How the week runs</h2>
      <ol className="space-y-1.5 text-[12px] text-slate-400 leading-relaxed list-decimal pl-4">
        {steps.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ol>
    </section>
  );
}

/** Which copy of the event this phone edits — the tournament or the sandbox. */
function SpacesCard({ space }: { space: Space }) {
  return (
    <div className="px-2">
      {SPACES.map((s) => {
        const active = s.id === space;
        const tone = s.tone === "test" ? "text-sky-300" : "text-slate-100";
        return (
          <button
            key={s.id}
            onClick={() => !active && switchSpace(s.id)}
            className={`w-full text-left rounded-xl px-3 py-2 flex items-start gap-3 ${
              active ? "bg-slate-800" : "hover:bg-slate-800/50"
            }`}
          >
            <span
              className={`mt-1.5 inline-block w-2.5 h-2.5 rounded-full shrink-0 ${
                active ? "bg-violet-400" : "border border-slate-600"
              }`}
            />
            <span className="min-w-0">
              <span className={`block text-xs font-semibold ${tone}`}>{s.label}</span>
              <span className="block text-[12px] text-slate-500 leading-relaxed">{s.description}</span>
            </span>
          </button>
        );
      })}
      {space !== "live" && (
        <div className="px-3 pb-1 pt-1">
          <InviteLink space={space} />
        </div>
      )}
    </div>
  );
}

function InviteLink({ space }: { space: Space }) {
  const [copied, setCopied] = useState(false);
  const link = spaceLink(space);
  return (
    <div className="mt-2.5 flex items-center justify-between gap-3 text-[12px]">
      <span className="min-w-0 truncate text-slate-500">
        Invite a tester: <span className="num text-slate-400">{link.replace(/^https?:\/\//, "")}</span>
        {spaceMeta(space).code && (
          <>
            {" "}· or type <span className="num text-slate-400">{spaceMeta(space).code}</span> as the event code
          </>
        )}
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

/**
 * The tournament's maximum score on a hole. Tradition caps a blow-up (par + 5, or net
 * double bogey + 2 — the committee to confirm which); with a rule set, the entry sheet offers
 * the cap as a button and stores anything above it as the cap.
 */
function HoleCapCard({ event, saveEvent }: { event: EventDoc; saveEvent: (patch: Partial<EventDoc>) => Promise<void> }) {
  const rule: HoleCapRule = event.holeCap ?? "none";
  return (
    <section className="mx-4 mb-3 card p-3.5">
      <h2 className="text-[12px] font-semibold uppercase tracking-wider text-slate-400">Max score per hole</h2>
      <p className="text-[12px] text-slate-500 leading-relaxed mt-0.5 mb-2.5">{HOLE_CAP_HELP[rule]}</p>
      {/* Every rule the app knows, from the one table — a hard-coded list here is how
          Par + 4 went missing on the day it was introduced. */}
      <div className="flex gap-1.5">
        {(Object.keys(HOLE_CAP_LABEL) as HoleCapRule[]).map((r) => (
          <button
            key={r}
            onClick={() => void saveEvent({ holeCap: r })}
            className={`flex-1 rounded-lg py-1.5 px-1 text-xs font-semibold leading-tight ${
              rule === r ? "bg-violet-600 text-white" : "bg-slate-800 text-slate-400"
            }`}
          >
            {HOLE_CAP_LABEL[r]}
          </button>
        ))}
      </div>
    </section>
  );
}

/**
 * Who has opened the app — the Wednesday-evening question — and, for curiosity after the
 * trip, how much it was used. Read on open, refreshed on tap; nothing here affects scores.
 */
function UsageCard({ players, usage }: { players: FieldPlayer[]; usage: { list: () => Promise<UsageDay[]> } }) {
  const [days, setDays] = useState<UsageDay[] | null>(null);
  useEffect(() => {
    let alive = true;
    usage
      .list()
      .then((d) => {
        if (alive) setDays(d);
      })
      .catch(() => {
        if (alive) setDays([]);
      });
    return () => {
      alive = false;
    };
  }, [usage]);
  const rows = summarizeUsage(days ?? [], players);
  const missing = players.filter((p) => !rows.some((r) => r.playerId === p.id));
  const when = (at: number) =>
    new Date(at).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" });
  const stamp = new Date().toISOString().slice(0, 10);
  // Inside a Tools card, so no frame or heading of its own: a summary line, a row per
  // player on two lines (nothing truncates), and the two exports at the bottom.
  return (
    <div className="px-3.5 space-y-3">
      <p className="text-sm">
        {days === null ? (
          <span className="text-slate-500">Loading…</span>
        ) : (
          <>
            <span className="font-semibold">{rows.length} of {players.length}</span> have opened the app
            {missing.length > 0 && missing.length <= 8 && (
              <span className="text-slate-500"> · not yet: {missing.map((p) => p.name).join(", ")}</span>
            )}
          </>
        )}
      </p>
      {days && rows.length > 0 && (
        <ul className="divide-y divide-slate-800/70">
          {rows.map((r) => {
            const views = Object.entries(r.views)
              .sort((a, b) => b[1] - a[1])
              .map(([k, n]) => `${k} ${n}`)
              .join(" · ");
            return (
              <li key={r.playerId} className="py-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] text-slate-200 truncate">{r.name}</span>
                  <span className="num text-[12px] text-slate-500 shrink-0">{when(r.lastSeen)}</span>
                </div>
                <div className="num text-[12px] text-slate-500 leading-relaxed">
                  {r.days} day{r.days === 1 ? "" : "s"} · {r.opens} open{r.opens === 1 ? "" : "s"}
                  {views && <span className="text-slate-600"> · {views}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {days && days.length > 0 && (
        <div className="flex gap-2">
          <button
            onClick={() => void shareOrDownload(new File([usageCsv(days, players)], `hector-usage-${stamp}.csv`, { type: "text/csv" }))}
            className="btn-ghost px-3 py-2 text-xs"
          >
            Save CSV
          </button>
          <button
            onClick={() => void shareOrDownload(new File([usageText(days, players)], `hector-usage-${stamp}.txt`, { type: "text/plain" }))}
            className="btn-ghost px-3 py-2 text-xs"
          >
            Save text
          </button>
        </div>
      )}
    </div>
  );
}

function PairsEditor({
  event,
  rounds,
  roundResults,
  saveEvent,
  patchRound,
}: {
  event: EventDoc;
  rounds: Round[];
  roundResults: Record<string, RoundResult>;
  saveEvent: (patch: Partial<EventDoc>) => Promise<void>;
  patchRound: (roundId: string, patch: Partial<Round>) => Promise<void>;
}) {
  /*
   * Draft-night tradition: a pair, once formed, picks its tee time for the morning.
   * So the first pair round's flights are set right here, under each pair, and appear
   * on the Flights tab and everyone's schedule as they are chosen.
   */
  const draftSeq = rounds.find((r) => r.formats.some((f) => f.hector?.source === "betterIndividual"))?.seq;
  const nextRound = draftSeq !== undefined
    ? rounds.find((r) => r.seq === draftSeq + 1 && r.status !== "final")
    : undefined;
  const flightOf = (pair: Pair) =>
    nextRound?.groups.find((g) => g.playerIds.includes(pair.aId) || g.playerIds.includes(pair.bId));
  // The pair just formed, until its tee time is picked: the question is asked right
  // where the pick was made, so the two of them answer it while they are still standing there.
  const [justPaired, setJustPaired] = useState<string | null>(null);
  const placePair = (pair: Pair, groupId: string | null) => {
    if (!nextRound) return;
    const groups = placeUnit(nextRound.groups, [pair.aId, pair.bId], groupId);
    if (groups) void patchRound(nextRound.id, { groups });
    if (groupId) setJustPaired((v) => (v === pair.id ? null : v));
  };
  const teeChips = (pair: Pair) =>
    nextRound && (
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] uppercase tracking-wider text-slate-500 mr-0.5">R{nextRound.seq} tee</span>
        {nextRound.groups.map((g) => {
          const mine = flightOf(pair)?.id === g.id;
          const others = g.playerIds.filter((id) => id !== pair.aId && id !== pair.bId).length;
          const full = !mine && others + 2 > MAX_PER_FLIGHT;
          return (
            <button
              key={g.id}
              disabled={full}
              onClick={() => placePair(pair, mine ? null : g.id)}
              className={`num rounded-lg px-2 py-1 text-[12px] font-semibold ${
                mine ? "bg-violet-600 text-white" : full ? "bg-slate-900 text-slate-600" : "bg-slate-800 text-slate-300"
              }`}
              title={full ? "Full" : undefined}
            >
              {g.teeTime}
              <span className={`ml-1 font-normal ${mine ? "text-violet-200" : "text-slate-500"}`}>
                {others + (mine ? 2 : 0)}/{MAX_PER_FLIGHT}
              </span>
            </button>
          );
        })}
      </div>
    );
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
    const id = `pair-defending-${defenders[0].id}`;
    await saveEvent({
      pairs: [{ id, aId: defenders[0].id, bId: defenders[1].id, defending: true }, ...event.pairs],
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

  // The flow area at the top shows one thing at a time: the tee-time question for the
  // pair just formed, the defenders' turn to choose theirs, or the next pick.
  const pendingPair = justPaired ? event.pairs.find((p) => p.id === justPaired) : undefined;
  const pendingTee = Boolean(pendingPair && nextRound && !flightOf(pendingPair));
  // Defenders choose their tee time when the draft reaches the better of their round-1
  // placings — not before. Once the picker on the clock ranks at or below that, it is
  // their turn; if the draft is finished and they still have none, it is overdue.
  const [defendersLater, setDefendersLater] = useState(false);
  const defPair = event.pairs.find((p) => p.defending);
  const defRank = defPair ? Math.min(...[defPair.aId, defPair.bId].map(rankOf).filter((r) => r > 0)) : Infinity;
  const defendersTurn =
    Boolean(defPair && nextRound && !flightOf(defPair!)) &&
    Number.isFinite(defRank) &&
    (nextUp === null || rankOf(nextUp) >= defRank) &&
    !pendingTee &&
    !defendersLater;

  async function addPair(aId: string, bId: string) {
    const id = `pair-${event.pairs.length + 1}-${aId}`;
    await saveEvent({ pairs: [...event.pairs, { id, aId, bId }] });
    setPicking(null);
    setChooseAny(false);
    setJustPaired(id);
  }

  async function removePair(id: string) {
    const pair = event.pairs.find((p) => p.id === id);
    await saveEvent({ pairs: event.pairs.filter((p) => p.id !== id) });
    // A dissolved pair gives its tee times back: a mispick (two Ollis…) must not leave
    // two ghosts holding seats in tomorrow's flight — or in any later pair round not yet final.
    if (!pair || draftSeq === undefined) return;
    for (const r of rounds) {
      if (r.seq <= draftSeq || r.status === "final") continue;
      const groups = placeUnit(r.groups, [pair.aId, pair.bId], null);
      if (groups && groups.some((g, i) => g.playerIds.length !== r.groups[i].playerIds.length)) {
        await patchRound(r.id, { groups });
      }
    }
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

      {/* The other answer is reversible too: until pairs exist, "not defending" can be
          taken back — a stray tap here used to be permanent, surviving even a full reset. */}
      {defending === null && event.pairs.length === 0 && (
        <p className="text-[12px] text-slate-500 leading-relaxed flex items-center justify-between gap-3 px-1">
          <span>Last year's winners are marked as not defending — everyone is in the draft.</span>
          <button
            onClick={() => saveEvent({ defendingPair: DEFENDING_PAIR })}
            className="shrink-0 underline underline-offset-2 text-slate-300"
          >
            Undo
          </button>
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

      {(() => {
        const pair = justPaired ? event.pairs.find((p) => p.id === justPaired) : undefined;
        if (!pair || !nextRound || flightOf(pair)) return null;
        return (
          <section className="card p-3.5 border-violet-800/60 bg-violet-950/25">
            <h2 className="text-[12px] font-semibold uppercase tracking-wider text-violet-300">
              New pair — pick their tee time
            </h2>
            <p className="text-sm font-semibold mt-0.5">
              {byId.get(pair.aId)?.name} + {byId.get(pair.bId)?.name}
            </p>
            {teeChips(pair)}
            <button
              onClick={() => setJustPaired(null)}
              className="mt-2 text-[12px] text-slate-500 underline underline-offset-2"
            >
              Decide later
            </button>
          </section>
        );
      })()}


      {defendersTurn && defPair && nextRound && (
        <section className="card p-3.5 border-amber-500/30 bg-amber-500/[0.06]">
          <h2 className="text-[12px] font-semibold uppercase tracking-wider text-amber-400">
            Defenders' turn — pick their tee time
          </h2>
          <p className="text-sm font-semibold mt-0.5">
            {byId.get(defPair.aId)?.name} + {byId.get(defPair.bId)?.name}
            <span className="text-[12px] font-normal text-slate-400 num"> · #{defRank} in round 1</span>
          </p>
          {teeChips(defPair)}
          <button
            onClick={() => setDefendersLater(true)}
            className="mt-2 text-[12px] text-slate-500 underline underline-offset-2"
          >
            Not now — the chips stay on their card below
          </button>
        </section>
      )}

      {unpaired.length > 1 && !pendingTee && (
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

      <section>
        <h2 className="label mb-2">
          Pairs ({event.pairs.length} of {target})
        </h2>
        {event.pairs.length === 0 ? (
          <p className="text-sm text-slate-500 py-3">No pairs yet.</p>
        ) : (
          <ol className="space-y-2">
            {event.pairs.map((pair, i) => (
              <li key={pair.id} className="card p-3">
              <div className="flex items-center justify-between gap-2">
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
              </div>
              {nextRound && teeChips(pair)}
              </li>
            ))}
          </ol>
        )}
      </section>
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
  patchRound,
}: {
  event: EventDoc;
  rounds: Round[];
  patchRound: (roundId: string, patch: Partial<Round>) => Promise<void>;
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

  const update = (groups: Round["groups"]) => patchRound(round.id, { groups });

  function moveUnit(unit: FlightUnit, toGroupId: string | null) {
    const groups = placeUnit(round.groups, unit.playerIds, toGroupId);
    if (groups) void update(groups);
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


function RoundsEditor({
  rounds,
  cards,
  saveRound,
  patchRound,
}: {
  rounds: Round[];
  cards: Record<string, Record<string, Card>>;
  saveRound: (round: Round) => Promise<void>;
  patchRound: (roundId: string, patch: Partial<Round>) => Promise<void>;
}) {
  return (
    <div className="px-4 space-y-3">
      <p className="text-xs text-slate-400 leading-relaxed">
        Course, tee, ratings and formats per round — the programme as the committee set it.
        Opening and closing rounds happens on Today. A round with scores on it is locked here.
      </p>
      {rounds.map((round) => (
        <RoundEditorCard
          key={round.id}
          round={round}
          locked={Object.values(cards[round.id] ?? {}).some((c) => Object.keys(c.holes ?? {}).length > 0)}
          saveRound={saveRound}
          patchRound={patchRound}
        />
      ))}
    </div>
  );
}

function RoundEditorCard({
  round,
  locked,
  saveRound,
  patchRound,
}: {
  round: Round;
  /** The round has scores: setup is read-only until deliberately unlocked. */
  locked: boolean;
  saveRound: (round: Round) => Promise<void>;
  patchRound: (roundId: string, patch: Partial<Round>) => Promise<void>;
}) {
  // Two taps to edit a played round's setup; the lock comes back on the next visit.
  const [unlock, setUnlock] = useState<"locked" | "asking" | "open">("locked");
  const frozen = locked && unlock !== "open";
  const course = courses[round.courseId] as Course | undefined;
  const tee = course?.tees[round.tee];
  // One step of undo: the round as it was before the last edit made from this card.
  // A stray tap on a select is the accident this exists for.
  const [undo, setUndo] = useState<Round | null>(null);
  const patch = (p: Partial<Round>) => {
    setUndo(round);
    return patchRound(round.id, p);
  };
  // What the official programme says for this round — shown when the card has strayed
  // from it. Only meaningful for the tournament's own courses (the field space plays
  // elsewhere and has no programme to stray from).
  const programme = defaultRounds.find((r) => r.id === round.id);
  const programmeCourses = new Set(defaultRounds.map((r) => r.courseId));
  const formatsStrayed =
    programme !== undefined &&
    programme.formats.map((f) => f.id).join(",") !== round.formats.map((f) => f.id).join(",");
  const strayed =
    programme &&
    programmeCourses.has(round.courseId) &&
    (programme.courseId !== round.courseId || programme.tee !== round.tee || formatsStrayed);

  // A round pointing at a course this build doesn't know (renamed, removed) must not
  // blank Admin on every phone — say so and let the course be reselected.
  if (!course || !tee) {
    return (
      <div className="card p-3.5 text-xs text-amber-300">
        Round {round.seq} refers to an unknown course or tee ({round.courseId} / {round.tee}).{" "}
        <button className="underline underline-offset-2" onClick={() => patch({ courseId: "radecky", tee: "yellow", crOverride: undefined, slopeOverride: undefined })}>
          Reset to Radecký yellow
        </button>
      </div>
    );
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

      {locked && (
        <div className="flex items-center justify-between gap-3 text-[12px] rounded-lg bg-slate-800/60 px-2.5 py-1.5">
          <span className="text-slate-400">
            {unlock === "open" ? "Unlocked for this visit — every change rescoring nothing already played." : "Locked: this round has scores."}
          </span>
          {unlock === "locked" && (
            <button onClick={() => setUnlock("asking")} className="shrink-0 underline underline-offset-2 text-slate-300">
              Unlock
            </button>
          )}
          {unlock === "asking" && (
            <button onClick={() => setUnlock("open")} className="shrink-0 rounded-md bg-rose-600 text-white px-2 py-0.5 font-semibold">
              Yes, edit anyway
            </button>
          )}
        </div>
      )}
      <div className={frozen ? "pointer-events-none opacity-50 space-y-3" : "space-y-3"}>

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
            {formatsStrayed && ` · ${programme.formats.map((f) => f.label.replace(/ Stroke Play/, "")).join(" + ")}`}
          </span>
          <button
            onClick={() =>
              patch({
                courseId: programme.courseId,
                tee: programme.tee,
                crOverride: undefined,
                slopeOverride: undefined,
                ...(formatsStrayed ? { formats: programme.formats } : {}),
              })
            }
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

      {/* Formats: tick what the round plays; the first listed is the main game (the one
          the course view follows), and any other can be moved up to take its place.
          Presets carry the tournament's own Hector/Victor settings. */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="label">Formats</span>
          <span className="text-[11px] text-slate-600">first = main game</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FORMAT_PRESETS.map((p) => {
            const on = round.formats.some((f) => f.id === p.id);
            return (
              <button
                key={p.id}
                onClick={() => {
                  const next = on
                    ? round.formats.filter((f) => f.id !== p.id)
                    : [...round.formats, p.spec];
                  if (next.length === 0) return; // a round always plays something
                  void patch({ formats: next });
                }}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                  on ? "bg-violet-600 text-white" : "bg-slate-800 text-slate-400"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <ul className="text-[12px] text-slate-500 space-y-0.5">
          {round.formats.map((f, i) => (
            <li key={f.id} className="flex items-center gap-2">
              <span className="min-w-0 truncate">
                {i === 0 && <span className="text-violet-300 font-semibold">main · </span>}
                {f.label} · {Math.round(f.allowance * 100)}%
                {f.hector && ` · Hector ${Math.round(f.hector.pct * 100)}% ${f.hector.source}`}
                {f.victor && " · Victor"}
              </span>
              {i > 0 && (
                <button
                  onClick={() => void patch({ formats: [f, ...round.formats.filter((x) => x.id !== f.id)] })}
                  className="shrink-0 underline underline-offset-2 text-slate-400"
                >
                  make main
                </button>
              )}
            </li>
          ))}
        </ul>
        {round.formats.some((f) => f.kind === "scramble") && (
          <DrivesRuleEditor
            spec={round.formats.find((f) => f.kind === "scramble")!}
            onChange={(drives) =>
              void patch({ formats: round.formats.map((f) => (f.kind === "scramble" ? { ...f, drives } : f)) })
            }
          />
        )}
      </div>
      </div>
    </div>
  );
}

/**
 * The 2026 scramble rule, per round: each player's tee shot at least `min` times, `penalty`
 * strokes for every missing one. The engine reads the marks the pairs make on the entry
 * sheet and adds the penalty to the pair's total; 0 switches the rule off for the round.
 */
function DrivesRuleEditor({
  spec,
  onChange,
}: {
  spec: FormatSpec;
  onChange: (drives: { min: number; penalty: number }) => void;
}) {
  const rule = spec.drives ?? DEFAULT_DRIVES;
  const field = (label: string, value: number, set: (n: number) => void) => (
    <label className="flex items-center gap-2 text-[12px] text-slate-400">
      {label}
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={18}
        value={value}
        onChange={(e) => set(Math.max(0, Math.min(18, Number(e.target.value) || 0)))}
        className="input w-14 px-2 py-1 text-center num text-sm"
      />
    </label>
  );
  return (
    <div className="mt-2 rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2.5 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="label">Tee shots</span>
        <span className="text-[11px] text-slate-600">
          {rule.min > 0 ? `${rule.min} each · ${rule.penalty} per missing` : "rule off"}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {field("Min tee shots per player", rule.min, (min) => onChange({ ...rule, min }))}
        {field("Strokes per missing", rule.penalty, (penalty) => onChange({ ...rule, penalty }))}
      </div>
      <p className="text-[11px] text-slate-500 leading-relaxed">
        Pairs mark whose tee shot was used on each hole as they score. Unmarked holes never cost anything.
      </p>
    </div>
  );
}
