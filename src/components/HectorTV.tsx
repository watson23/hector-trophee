import { useState } from "react";
import type { EventDoc, FieldPlayer, Round } from "../types";
import type { RoundResult, TournamentTotals } from "../lib/engine";
import { rank } from "../lib/leaderboard";
import { hectorLowerIsBetter } from "../lib/hector";
import HectorMark from "./HectorMark";

/**
 * Hector TV — the spectator experience, for the Hectorians at home and the families
 * following a favourite. Watching only: no PIN, no score entry, no announcements. These
 * are the pieces around the ordinary read-only screens: the channel ident, picking who
 * to follow, and the follow strip that keeps a favourite pinned above the leaderboard.
 */

/** The channel ident: brand on the left, "change who you follow" on the right. */
export function TVBar({
  following,
  players,
  onEdit,
}: {
  following: string[];
  players: FieldPlayer[];
  onEdit: () => void;
}) {
  const names = following
    .map((id) => players.find((p) => p.id === id)?.name)
    .filter(Boolean)
    .join(", ");
  return (
    <div className="bg-violet-950/50 border-b border-violet-900/60 px-4 py-1.5 flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.2em] text-violet-300 num">
        <HectorMark className="w-3.5 h-3.5" />
        HECTOR TV
        <span className="live-dot text-violet-400" />
      </span>
      {/* Dressed as the control it is — a status-looking label here meant nobody
          realised the follows can be changed mid-tournament. */}
      <button
        onClick={onEdit}
        className="flex items-center gap-1.5 min-w-0 rounded-full border border-violet-800/70
                   bg-violet-950/40 px-2.5 py-1 text-[11px] text-slate-300 active:bg-violet-900/40"
      >
        {names ? (
          <span className="truncate">
            ★ <span className="text-violet-300">{names}</span>
          </span>
        ) : (
          <span>follow a player</span>
        )}
        <span className="shrink-0 text-violet-400 font-semibold">change</span>
      </button>
    </div>
  );
}

/**
 * "Who are you following?" — first thing a spectator sees, and reachable again from the
 * TV bar. Multi-select: a parent follows one, a Hectorian at home follows three buddies.
 */
export function FollowPicker({
  event,
  initial,
  onDone,
  onExit,
}: {
  event: EventDoc;
  initial: string[];
  onDone: (following: string[]) => void;
  /** "Actually playing?" — back out of Hector TV to the player onboarding. */
  onExit?: () => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set(initial));
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="min-h-dvh flex flex-col justify-center px-5 py-10 max-w-lg mx-auto">
      <header className="mb-6 text-center">
        <HectorMark className="w-16 h-16 mx-auto mb-2 text-violet-400" />
        <div className="text-[11px] font-semibold uppercase tracking-[0.25em] text-violet-400">
          Hector TV
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight mt-1">{event.name}</h1>
        <p className="text-slate-400 text-sm mt-2">
          Who are you following? Your picks get a star on every leaderboard.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-2">
        {event.players.map((p) => {
          const on = picked.has(p.id);
          return (
            <button
              key={p.id}
              onClick={() => toggle(p.id)}
              className={`card px-3 py-2.5 text-left transition-colors ${
                on ? "border-violet-500 bg-violet-950/40" : "hover:border-slate-700"
              }`}
            >
              <div className="font-semibold text-sm truncate">
                {on && <span className="text-violet-400 mr-1">★</span>}
                {p.name}
              </div>
              <div className="text-slate-500 text-xs num">HCP {p.hi.toFixed(1)}</div>
            </button>
          );
        })}
      </div>

      <div className="mt-5 space-y-2">
        <button className="btn-primary w-full" onClick={() => onDone([...picked])}>
          {picked.size > 0
            ? `Watch ${picked.size} player${picked.size > 1 ? "s" : ""}`
            : "Just watch the tournament"}
        </button>
        {onExit && (
          <button className="w-full text-sm text-slate-500 py-1.5" onClick={onExit}>
            Actually playing? Enter the event
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * A followed player's line right now, pinned above the Live leaderboards: how they
 * stand in the round, and where their pair sits in the Hector.
 */
export function FollowStrip({
  following,
  event,
  round,
  result,
  hector,
}: {
  following: string[];
  event: EventDoc;
  round: Round | null;
  result: RoundResult | undefined;
  hector: TournamentTotals["hector"];
}) {
  if (following.length === 0) return null;
  const byId = new Map(event.players.map((p) => [p.id, p]));
  const hectorRanked = rank(
    hector,
    (r) => r.points,
    hectorLowerIsBetter,
    (r) => r.roundsPlayed > 0,
  );

  return (
    <div className="px-4 pt-3 space-y-2">
      {following.map((id) => {
        const player = byId.get(id);
        if (!player) return null;

        // Their pair, and their line in the round: an individual format when there is
        // one, otherwise their pair's team row — a scramble Sunday still has a score.
        const pair = event.pairs.find((p) => p.aId === id || p.bId === id);
        const pairRank = pair ? hectorRanked.find((r) => r.item.key === pair.id) : undefined;

        const format = result?.formats.find((f) => f.players.some((p) => p.playerId === id));
        const teamFormat =
          !format && pair
            ? result?.formats.find((f) => f.teams.some((t) => t.pairId === pair.id))
            : undefined;
        const ranked = format
          ? rank(
              format.players,
              (p) => p.value,
              format.spec.kind !== "stableford",
              (p) => p.thru > 0,
            ).find((r) => r.item.playerId === id)
          : teamFormat && pair
            ? rank(
                teamFormat.teams,
                (t) => t.value,
                true,
                (t) => t.thru > 0,
              ).find((r) => r.item.pairId === pair.id)
            : undefined;
        const row = ranked?.item;
        const spec = format?.spec ?? teamFormat?.spec;
        const unit = spec?.kind === "stableford" ? "pts" : "";

        // Not out yet: show when they tee off instead of a blank line.
        const group = round?.groups.find((g) => g.playerIds.includes(id));

        return (
          <div
            key={id}
            className="rounded-xl border border-violet-800/60 bg-gradient-to-br from-violet-950/60 to-violet-950/10 px-3.5 py-2.5"
          >
            <div className="font-bold text-sm text-violet-200">
              <span className="text-violet-400 mr-1">★</span>
              {player.name}
            </div>
            <div className="text-[11px] text-slate-400 num mt-0.5 leading-relaxed">
              {row && row.thru > 0 ? (
                <>
                  thru <span className="text-slate-200 font-semibold">{row.thru >= 18 ? "F" : row.thru}</span> ·{" "}
                  <span className="text-slate-200 font-semibold">
                    {row.value}
                    {unit && ` ${unit}`}
                  </span>
                  {ranked && ranked.position > 0 && spec && (
                    <>
                      {" "}
                      · <span className="text-slate-200 font-semibold">#{ranked.label.replace("T", "")}</span> in{" "}
                      {spec.label.replace(/ (Stroke Play)? ?(NET|SCR)$/, "")}
                    </>
                  )}
                </>
              ) : group ? (
                <>
                  tees off <span className="text-slate-200 font-semibold">{group.teeTime}</span>
                </>
              ) : (
                <>waiting for the round</>
              )}
              {pair && pairRank && pairRank.position > 0 && (
                <>
                  {" "}
                  · pair{" "}
                  <span className="text-slate-200">
                    {byId.get(pair.aId)?.name} + {byId.get(pair.bId)?.name}
                  </span>{" "}
                  sits <span className="text-slate-200 font-semibold">#{pairRank.label.replace("T", "")}</span> in the
                  Hector
                  {pairRank.diff !== null && (
                    <span className="text-slate-500"> · +{Math.abs(pairRank.diff).toFixed(1)}</span>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
