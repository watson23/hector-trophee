import { useMemo, useState } from "react";
import { useSession } from "./hooks/useSession";
import { useTournament } from "./hooks/useTournament";
import Onboarding from "./components/Onboarding";
import { SyncBanner, TabBar, type Tab } from "./components/Chrome";
import PlayScreen from "./screens/PlayScreen";
import RoundScreen from "./screens/RoundScreen";
import TournamentScreen from "./screens/TournamentScreen";
import MoreScreen from "./screens/MoreScreen";
import AdminScreen from "./screens/AdminScreen";

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
    return (
      <div className="min-h-dvh grid place-items-center text-slate-600 text-sm">Loading…</div>
    );
  }

  if (!session.unlocked || !session.playerId) {
    return (
      <Onboarding
        event={t.event}
        unlocked={session.unlocked}
        onUnlock={() => update({ unlocked: true })}
        onPickPlayer={(playerId) => update({ playerId })}
      />
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
            saveEvent={t.saveEvent}
            saveRound={t.saveRound}
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

      {!adminOpen && <TabBar tab={tab} onChange={setTab} />}
    </div>
  );
}
