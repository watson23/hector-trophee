import { useState } from "react";
import type { TodayTask } from "../lib/today";

/**
 * The top of Admin: what to do next, as one card per task — a title, a sentence, and
 * either the button that does it or the tab where it is done. The one place a helper
 * who has never opened Admin needs to look. Opening and closing a round are two-tap:
 * they change every phone in the field.
 */
export default function TodayPanel({
  tasks,
  onOpenRound,
  onCloseRound,
  onReopenRound,
  onConclude,
  onGo,
}: {
  tasks: TodayTask[];
  onOpenRound: (roundId: string) => void;
  onCloseRound: (roundId: string) => void;
  onReopenRound: (roundId: string) => void;
  onConclude: () => void;
  onGo: (tab: "groups" | "pairs") => void;
}) {
  const [confirm, setConfirm] = useState<string | null>(null);

  return (
    <section className="mx-4 mb-4 space-y-2">
      <h2 className="text-[12px] font-semibold uppercase tracking-wider text-slate-400 px-0.5">Today</h2>
      {tasks.map((t) => {
        const key = `${t.action}-${t.roundId ?? ""}`;
        const asking = confirm === key;
        if (t.quiet) {
          // The way back, as a line rather than a card: present, never inviting.
          return (
            <div key={key} className="flex items-center justify-between gap-3 px-1 pt-1 text-[12px] text-slate-500">
              <span>{asking ? t.body : t.title}</span>
              {asking ? (
                <span className="flex gap-2 shrink-0">
                  <button
                    onClick={() => {
                      setConfirm(null);
                      if (t.roundId) onReopenRound(t.roundId);
                    }}
                    className="rounded-md bg-rose-600 text-white px-2 py-0.5 font-semibold"
                  >
                    Yes, reopen
                  </button>
                  <button onClick={() => setConfirm(null)} className="underline underline-offset-2">
                    Not now
                  </button>
                </span>
              ) : (
                <button onClick={() => setConfirm(key)} className="underline underline-offset-2 text-slate-400 shrink-0">
                  Reopen
                </button>
              )}
            </div>
          );
        }
        const primary = t.enabled && t.action !== "done" && t.action !== "idle";
        return (
          <div
            key={key}
            className={`card p-4 ${primary ? "border-violet-800/60 bg-violet-950/25" : ""}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className={`text-[15px] font-semibold ${primary ? "text-slate-100" : "text-slate-300"}`}>{t.title}</h3>
                <p className="text-[13px] text-slate-400 leading-relaxed mt-0.5">{t.body}</p>
              </div>
            </div>
            {t.enabled && (
              <div className="mt-3 flex items-center gap-2">
                {t.tab ? (
                  <button onClick={() => onGo(t.tab!)} className="btn-primary px-4 py-2.5 text-sm">
                    {t.action === "draw" ? "Go to the draw →" : "Go to Pairs →"}
                  </button>
                ) : asking ? (
                  <>
                    <button
                      onClick={() => {
                        setConfirm(null);
                        if (t.action === "open" && t.roundId) onOpenRound(t.roundId);
                        if (t.action === "close" && t.roundId) onCloseRound(t.roundId);
                        if (t.action === "conclude") onConclude();
                      }}
                      className="btn-primary px-4 py-2.5 text-sm"
                    >
                      {t.action === "open" ? "Yes, open it" : t.action === "close" ? "Yes, make it final" : "Yes, conclude"}
                    </button>
                    <button onClick={() => setConfirm(null)} className="btn-ghost px-3 py-2.5 text-sm">
                      Not yet
                    </button>
                  </>
                ) : (
                  <button onClick={() => setConfirm(key)} className="btn-primary px-4 py-2.5 text-sm">
                    {t.title}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
