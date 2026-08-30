import { useEffect, useMemo, useState } from "react";
import { useSession } from "./hooks/useSession";
import { useTournament } from "./hooks/useTournament";
import Onboarding from "./components/Onboarding";
import { SyncBanner, TabBar, type Tab } from "./components/Chrome";
import PlayScreen from "./screens/PlayScreen";
import RoundScreen from "./screens/RoundScreen";
import TournamentScreen from "./screens/TournamentScreen";
import MoreScreen from "./screens/MoreScreen";
import AdminScreen from "./screens/AdminScreen";
import type { StoreError } from "./lib/store";

export default function App() {
  const { session, update, reset } = useSession();
  const t = useTournament(session.playerId ?? "anon");
  const [tab, setTab] = useState<Tab>("play");
  const [adminOpen, setAdminOpen] = useState(false);

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

  if (!t.ready || !t.event) {
    // A silent forever-spinner is the worst failure on a golf course, so say what's wrong.
    return <Connecting error={t.error} />;
  }

  if (!session.unlocked || !session.playerId) {
    // The banner belongs here too: a misconfigured deployment is worth knowing about
    // before you type the event code, not after.
    return (
      <div className="min-h-dvh">
        <SyncBanner online={t.online} pending={t.pending} backend={t.backend} />
        <Onboarding
          event={t.event}
          unlocked={session.unlocked}
          onUnlock={() => update({ unlocked: true })}
          onPickPlayer={(playerId) => update({ playerId })}
        />
      </div>
    );
  }

  return (
    <div className="min-h-dvh">
      <SyncBanner online={t.online} pending={t.pending} backend={t.backend} />

      <main className="max-w-lg mx-auto pb-24">
        {adminOpen ? (
          <AdminScreen
            event={t.event}
            rounds={t.rounds}
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
                cards={activeRound ? (t.cards[activeRound.id] ?? {}) : {}}
                me={me}
                setHole={(subjectId, hole, value) =>
                  activeRound && t.setHole(activeRound.id, subjectId, hole, value)
                }
              />
            )}
            {tab === "round" && (
              <RoundScreen
                rounds={t.rounds}
                results={t.roundResults}
                initialRoundId={activeRound?.id ?? null}
              />
            )}
            {tab === "tournament" && (
              <TournamentScreen rounds={t.rounds} hector={t.hector} victor={t.victor} />
            )}
            {tab === "more" && (
              <MoreScreen
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
              />
            )}
          </>
        )}
      </main>

      {/* Admin lived at the bottom of the More tab behind faint grey text, which was
          effectively hidden. Once unlocked, it gets a button that follows you around. */}
      {!adminOpen && session.admin && (
        <button
          onClick={() => setAdminOpen(true)}
          aria-label="Open Admin"
          className="fixed top-2 right-2 z-40 flex items-center gap-1.5 rounded-full
                     bg-violet-600/90 text-white pl-2.5 pr-3 py-1.5 text-xs font-semibold
                     shadow-lg backdrop-blur active:bg-violet-700"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.35.4.64.73.83" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Admin
        </button>
      )}

      {!adminOpen && <TabBar tab={tab} onChange={setTab} />}
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
          <p className="text-[10px] text-slate-600 mt-3 num">{error.code}</p>
        )}
        <button className="btn-ghost w-full mt-4 text-sm" onClick={() => location.reload()}>
          Try again
        </button>
      </div>
    </div>
  );
}
