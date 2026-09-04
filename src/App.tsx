import { useEffect, useMemo, useState } from "react";
import { useSession } from "./hooks/useSession";
import { usePersistentState } from "./hooks/usePersistentState";
import { useTournament } from "./hooks/useTournament";
import Onboarding from "./components/Onboarding";
import { SpaceBanner, SyncBanner, TabBar, type Tab } from "./components/Chrome";
import { currentSpace, eventIdFor } from "./lib/space";
import PlayScreen from "./screens/PlayScreen";
import RoundScreen from "./screens/RoundScreen";
import TournamentScreen from "./screens/TournamentScreen";
import InfoScreen from "./screens/InfoScreen";
import AdminScreen from "./screens/AdminScreen";
import type { StoreError } from "./lib/store";
import { FollowPicker, FollowStrip, TVBar } from "./components/HectorTV";

export default function App() {
  const { session, update, reset } = useSession();
  // Which copy of the event this device is on — the tournament, or the test sandbox.
  // Fixed for the lifetime of the page; switching spaces reloads.
  const space = currentSpace();
  const t = useTournament(session.playerId ?? "anon", eventIdFor(space));
  // A refresh keeps you where you were: same tab, same round, and admin stays open.
  const [storedTab, setTab] = usePersistentState<Tab>("hectro_ui.tab", "play");
  // The fourth tab was renamed "more" → "info"; a stored value from before the rename
  // (or any other stale id) falls back to Play instead of rendering nothing.
  const tab: Tab = ["play", "round", "tournament", "info"].includes(storedTab)
    ? storedTab
    : storedTab === ("more" as Tab)
      ? "info"
      : "play";
  const [adminOpen, setAdminOpen] = usePersistentState("hectro_ui.admin", false, "session");
  // Hector TV: #watch in a shared link drops straight into spectator mode — no PIN,
  // because there is nothing to protect: the spectator shell has no write paths.
  // Decided once, at mount: arriving via the shared link (/tv — plus the older
  // #watch, which is out in the wild) flips the device into Hector TV — for a fresh
  // spectator via the follow picker, and for a signed-in player as a peek that keeps
  // their identity.
  const [enteredViaWatch] = useState(
    () => (location.pathname === "/tv" || location.hash === "#watch") && !session.spectator,
  );
  const [editFollows, setEditFollows] = useState(enteredViaWatch && !session.playerId);
  useEffect(() => {
    if (enteredViaWatch) update({ spectator: true });
    // Once, on mount — enteredViaWatch never changes and update is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The address bar mirrors the mode — /tv while watching, / when not. People read
  // the URL as the "where am I" cue (they typed /tv themselves), and because exiting
  // rewrites it back to /, a reload can trust the path completely.
  useEffect(() => {
    const want = session.spectator ? "/tv" : "/";
    if (location.pathname !== want) history.replaceState(null, "", want);
  }, [session.spectator]);
  // Which round the Round tab is on — session-scoped, so tomorrow follows the live
  // round again instead of the one browsed last night.
  const [roundSel, setRoundSel] = usePersistentState<string | null>(
    "hectro_ui.round",
    null,
    "session",
  );
  // Set when the scorecard sends the viewer to the Round tab; the Round screen then
  // shows a breadcrumb back. Any tab tap clears it — it is a path, not a control.
  const [returnToCard, setReturnToCard] = useState(false);
  // Timestamp of the newest announcement this device has seen; the Info tab gets an
  // amber dot while something newer exists.
  const [newsSeen, setNewsSeen] = usePersistentState("hectro_ui.newsSeen", 0);

  const me = useMemo(
    () => t.event?.players.find((p) => p.id === session.playerId) ?? null,
    [t.event, session.playerId],
  );

  /** The round being played: whatever the organiser has opened, else the next one up. */
  const activeRound = useMemo(() => {
    return (
      t.rounds.find((r) => r.status === "open") ??
      t.rounds.find((r) => r.status === "upcoming") ??
      t.rounds[t.rounds.length - 1] ??
      null
    );
  }, [t.rounds]);

  const newsUnread = (t.event?.announcements ?? []).some((a) => a.at > newsSeen);

  // Followed players and the pairs they belong to — the star treatment on every table.
  const following = useMemo(() => session.following ?? [], [session.following]);
  const highlightPlayers = useMemo(() => new Set(following), [following]);
  const highlightPairs = useMemo(
    () =>
      new Set(
        (t.event?.pairs ?? [])
          .filter((p) => following.includes(p.aId) || following.includes(p.bId))
          .map((p) => p.id),
      ),
    [t.event?.pairs, following],
  );

  if (!t.ready || !t.event) {
    // A silent forever-spinner is the worst failure on a golf course, so say what's wrong.
    return <Connecting error={t.error} />;
  }

  // ------------------------------- Hector TV -------------------------------
  if (session.spectator) {
    if (editFollows) {
      return (
        <FollowPicker
          event={t.event}
          initial={following}
          exitLabel={
            session.playerId ? "Back to the player view" : "Actually playing? Enter the event"
          }
          onDone={(f) => {
            update({ following: f });
            setEditFollows(false);
          }}
          onExit={() => {
            // A signed-in player peeking at TV keeps their identity; only a pure
            // spectator backing out goes through onboarding again.
            if (session.playerId) update({ spectator: false });
            else reset();
            setEditFollows(false);
          }}
        />
      );
    }
    // The persisted tab may point at a tab the TV doesn't have (Play, from a
    // player session on this device once) — Live is the home channel.
    const tvTab: Tab = ["round", "tournament", "info"].includes(tab) ? tab : "round";
    return (
      <div className="min-h-dvh">
        <SpaceBanner space={space} />
        <TVBar following={following} players={t.event.players} onEdit={() => setEditFollows(true)} />
        <main className="max-w-lg mx-auto pb-32">
          {tvTab === "round" && (
            <>
              <FollowStrip
                following={following}
                event={t.event}
                round={activeRound}
                result={activeRound ? t.roundResults[activeRound.id] : undefined}
                hector={t.hector}
              />
              <RoundScreen
                event={t.event}
                rounds={t.rounds}
                results={t.roundResults}
                cards={t.cards}
                roundId={roundSel ?? activeRound?.id ?? null}
                onRoundChange={setRoundSel}
                highlightPlayers={highlightPlayers}
                highlightPairs={highlightPairs}
              />
            </>
          )}
          {tvTab === "tournament" && (
            <TournamentScreen
              rounds={t.rounds}
              hector={t.hector}
              victor={t.victor}
              movement={t.hectorMovement}
              highlightPlayers={highlightPlayers}
              highlightPairs={highlightPairs}
            />
          )}
          {tvTab === "info" && (
            <InfoScreen
              spectator
              newsSeen={newsSeen}
              onSeenNews={setNewsSeen}
              saveEvent={t.saveEvent}
              event={t.event}
              rounds={t.rounds}
              me={null}
              admin={false}
              backend={t.backend}
              onAdmin={() => {}}
              onOpenAdmin={() => {}}
              onSwitchPlayer={() => setEditFollows(true)}
            />
          )}
        </main>
        {session.playerId && (
          <button
            onClick={() => update({ spectator: false })}
            style={{ bottom: "calc(env(safe-area-inset-bottom) + 76px)" }}
            className="fixed right-3 z-40 rounded-full bg-violet-600/90 text-white px-3 py-1.5
                       text-xs font-semibold shadow-lg backdrop-blur active:bg-violet-700"
          >
            Exit TV
          </button>
        )}
        <TabBar
          tab={tvTab}
          onChange={setTab}
          visible={["round", "tournament", "info"]}
          labels={{ round: "Live" }}
        />
      </div>
    );
  }

  if (!session.unlocked || !session.playerId) {
    // The banner belongs here too: a misconfigured deployment is worth knowing about
    // before you type the event code, not after.
    return (
      <div className="min-h-dvh">
        <SpaceBanner space={space} />
        <SyncBanner online={t.online} pending={t.pending} backend={t.backend} onNudge={t.nudge} />
        <Onboarding
          event={t.event}
          unlocked={session.unlocked}
          onUnlock={() => update({ unlocked: true })}
          onPickPlayer={(playerId) => update({ playerId })}
          onSpectate={() => {
            update({ spectator: true });
            setEditFollows(true);
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-dvh">
      <SpaceBanner space={space} />
      <SyncBanner online={t.online} pending={t.pending} backend={t.backend} onNudge={t.nudge} />

      <main className="max-w-lg mx-auto pb-32">
        {adminOpen ? (
          <AdminScreen
            event={t.event}
            rounds={t.rounds}
            space={space}
            backend={t.backend}
            mirrorFrom={t.mirrorFrom}
            cards={t.cards}
            roundResults={t.roundResults}
            setCard={t.setCard}
            deleteCard={t.deleteCard}
            saveEvent={t.saveEvent}
            saveRound={t.saveRound}
            setHole={t.setHole}
            onClose={() => setAdminOpen(false)}
          />
        ) : (
          <>
            {tab === "play" && (
              <PlayScreen
                event={t.event}
                round={activeRound}
                rounds={t.rounds}
                cards={activeRound ? (t.cards[activeRound.id] ?? {}) : {}}
                allCards={t.cards}
                setHcpSubmitted={t.setHcpSubmitted}
                result={activeRound ? t.roundResults[activeRound.id] : undefined}
                me={me}
                setHole={(subjectId, hole, value) =>
                  activeRound && t.setHole(activeRound.id, subjectId, hole, value)
                }
                onShowRound={(roundId) => {
                  setRoundSel(roundId);
                  setTab("round");
                }}
                onShowRoundBoard={(roundId, boardId) => {
                  // Land on the same board the card was showing; the Round screen
                  // reads its persisted picker on mount.
                  try {
                    sessionStorage.setItem("hectro_ui.roundboard", JSON.stringify(boardId));
                  } catch {
                    /* no storage — the round's default board is fine */
                  }
                  setRoundSel(roundId);
                  setReturnToCard(true);
                  setTab("round");
                }}
                onShowTrophy={() => setTab("tournament")}
              />
            )}
            {tab === "round" && (
              <RoundScreen
                event={t.event}
                rounds={t.rounds}
                results={t.roundResults}
                cards={t.cards}
                roundId={roundSel ?? activeRound?.id ?? null}
                onRoundChange={setRoundSel}
                onBackToCard={
                  returnToCard
                    ? () => {
                        setReturnToCard(false);
                        setTab("play");
                      }
                    : undefined
                }
              />
            )}
            {tab === "tournament" && (
              <TournamentScreen rounds={t.rounds} hector={t.hector} victor={t.victor} movement={t.hectorMovement} />
            )}
            {tab === "info" && (
              <InfoScreen
                newsSeen={newsSeen}
                onSeenNews={setNewsSeen}
                saveEvent={t.saveEvent}
                event={t.event}
                rounds={t.rounds}
                me={me}
                admin={session.admin}
                backend={t.backend}
                onAdmin={() => {
                  update({ admin: true });
                  setAdminOpen(true);
                }}
                onOpenAdmin={() => setAdminOpen(true)}
                onSwitchPlayer={reset}
                onWatchTV={() => update({ spectator: true })}
              />
            )}
          </>
        )}
      </main>

      {/* Admin lived at the bottom of the Info tab behind faint grey text, which was
          effectively hidden. Once unlocked, it gets a button that follows you around —
          bottom-right, above the tab bar, where it covers nothing: fixed top-right it sat
          on the sync banner's text and on the identity block of the Info header. It's a
          toggle: the way out of Admin lives in the same spot as the way in, so one thumb
          position switches modes in both directions. */}
      {session.admin && (
        <button
          onClick={() => setAdminOpen((v) => !v)}
          aria-label={adminOpen ? "Close Admin" : "Open Admin"}
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 76px)" }}
          className="fixed right-3 z-40 flex items-center gap-1.5 rounded-full
                     bg-violet-600/90 text-white pl-2.5 pr-3 py-1.5 text-xs font-semibold
                     shadow-lg backdrop-blur active:bg-violet-700"
        >
          {adminOpen ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="w-3.5 h-3.5">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.35.4.64.73.83" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {adminOpen ? "Exit admin" : "Admin"}
        </button>
      )}

      {!adminOpen && (
        <TabBar
          tab={tab}
          onChange={(next) => {
            setReturnToCard(false);
            setTab(next);
          }}
          badges={{ info: newsUnread }}
        />
      )}
    </div>
  );
}

/**
 * Startup screen. Shows a spinner briefly, then admits that something is wrong —
 * with the specific fix when the backend told us what it was.
 */
function Connecting({ error }: { error: StoreError | null }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(id);
  }, []);

  if (!error && !slow) {
    return (
      <div className="min-h-dvh grid place-items-center text-slate-600 text-sm">Loading…</div>
    );
  }

  return (
    <div className="min-h-dvh grid place-items-center px-6">
      <div className="card p-5 max-w-sm text-center">
        <h1 className="font-semibold text-slate-100">
          {error ? "Can't reach the scoring database" : "Still connecting…"}
        </h1>
        <p className="text-sm text-slate-400 mt-2 leading-relaxed">
          {error ? error.message : "This is taking longer than it should."}
        </p>
        <p className="text-xs text-slate-500 mt-3 leading-relaxed">
          {error ? error.hint : "Check your signal, then try again."}
        </p>
        {error && (
          <p className="text-[11px] text-slate-600 mt-3 num">{error.code}</p>
        )}
        <button className="btn-ghost w-full mt-4 text-sm" onClick={() => location.reload()}>
          Try again
        </button>
      </div>
    </div>
  );
}
