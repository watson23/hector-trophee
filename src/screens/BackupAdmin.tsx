import { useEffect, useState } from "react";
import type { Round } from "../types";
import { roundsWithCards, snapshotFile, summarize, type Snapshot } from "../lib/backup";

export interface BackupApi {
  /** Take a snapshot now. Resolves to the snapshot, or null when the store is not ready. */
  take: (reason: string) => Promise<Snapshot | null>;
  list: () => Promise<Snapshot[]>;
  /** Restore one round (roundId) or, with null, the whole tournament. Snapshots first. */
  restore: (snap: Snapshot, roundId: string | null) => Promise<void>;
}

/**
 * The organiser's safety net, for a week when most of the organisers are at a party.
 * Snapshots are taken on their own when a round goes final and before anything
 * destructive; this page lists them, takes one by hand, and puts a round — or the whole
 * tournament — back the way a snapshot has it. Every restore is preceded by a snapshot
 * of the current state, so a wrong restore is one more restore away from undone.
 */
export default function BackupAdmin({ rounds, backups }: { rounds: Round[]; backups: BackupApi }) {
  const [snaps, setSnaps] = useState<Snapshot[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ snapId: string; roundId: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setSnaps(await backups.list());
      setError(null);
    } catch (e) {
      setError(`Could not load backups: ${(e as Error).message}`);
    }
  };
  useEffect(() => {
    let alive = true;
    backups
      .list()
      .then((s) => {
        if (alive) setSnaps(s);
      })
      .catch((e: Error) => {
        if (alive) setError(`Could not load backups: ${e.message}`);
      });
    return () => {
      alive = false;
    };
  }, [backups]);

  async function takeNow() {
    setBusy("Backing up…");
    try {
      await backups.take("Manual");
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function doRestore(snap: Snapshot, roundId: string | null) {
    const what = roundId ? `round ${snap.rounds.find((r) => r.id === roundId)?.seq}` : "everything";
    setBusy(`Restoring ${what}…`);
    try {
      await backups.restore(snap, roundId);
      await refresh();
    } catch (e) {
      setError(`Restore failed: ${(e as Error).message}`);
    } finally {
      setConfirm(null);
      setBusy(null);
    }
  }

  async function share(snap: Snapshot) {
    const file = snapshotFile(snap);
    try {
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: file.name });
        return;
      }
    } catch {
      /* cancelled or unsupported — fall through to a download */
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const when = (at: number) =>
    new Date(at).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", day: "numeric", month: "numeric" });

  return (
    <div className="px-4 space-y-4">
      <p className="text-xs text-slate-400 leading-relaxed">
        A snapshot of the whole tournament — pairs, rounds and every card — is taken on its own
        when a round goes final and before anything is cleared or reset. Take one by hand any
        time. Restoring a round puts its cards back exactly as they were; the current state is
        snapshotted first, so a restore can itself be undone.
      </p>

      <div className="flex items-center gap-2">
        <button onClick={takeNow} disabled={busy !== null} className="btn-primary px-4 py-2 text-sm">
          {busy ?? "Back up now"}
        </button>
        <button onClick={refresh} className="btn-ghost px-3 py-2 text-sm">
          Refresh
        </button>
      </div>

      {error && (
        <p className="text-xs text-rose-300 bg-rose-950/40 border border-rose-900/60 rounded-xl px-3 py-2">{error}</p>
      )}

      {snaps === null ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : snaps.length === 0 ? (
        <p className="text-sm text-slate-500">No snapshots yet. The first one is taken when a round goes final.</p>
      ) : (
        <ul className="space-y-2">
          {snaps.map((snap) => {
            const s = summarize(snap);
            const isOpen = open === snap.id;
            return (
              <li key={snap.id} className="card overflow-hidden">
                <button
                  onClick={() => {
                    setOpen(isOpen ? null : snap.id);
                    setConfirm(null);
                  }}
                  className="w-full text-left px-3.5 py-3 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{snap.reason}</div>
                    <div className="text-[12px] text-slate-500 num mt-0.5">{when(snap.at)}</div>
                  </div>
                  <div className="text-right text-[12px] text-slate-400 num shrink-0 leading-relaxed">
                    <div>
                      {s.finals.length > 0 ? `R${s.finals.join(" R")} final` : "no round final"}
                      {s.open ? ` · R${s.open} open` : ""}
                    </div>
                    <div className="text-slate-500">
                      {s.cards} cards · {snap.event.pairs.length} pairs
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-slate-800 px-3.5 py-3 space-y-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {roundsWithCards(snap).map((r) => {
                        const current = rounds.find((x) => x.id === r.id);
                        const asking = confirm?.snapId === snap.id && confirm.roundId === r.id;
                        return asking ? (
                          <button
                            key={r.id}
                            onClick={() => doRestore(snap, r.id)}
                            disabled={busy !== null}
                            className="rounded-lg bg-rose-600 text-white px-3 py-1.5 text-xs font-semibold"
                          >
                            Yes, restore R{r.seq}
                          </button>
                        ) : (
                          <button
                            key={r.id}
                            onClick={() => setConfirm({ snapId: snap.id, roundId: r.id })}
                            disabled={busy !== null}
                            className="rounded-lg bg-slate-800 text-slate-200 px-3 py-1.5 text-xs font-semibold"
                            title={current ? `Now: ${current.status}` : undefined}
                          >
                            Restore R{r.seq}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      {confirm?.snapId === snap.id && confirm.roundId === null ? (
                        <button
                          onClick={() => doRestore(snap, null)}
                          disabled={busy !== null}
                          className="rounded-lg bg-rose-600 text-white px-3 py-1.5 text-xs font-semibold"
                        >
                          Yes, restore everything from this snapshot
                        </button>
                      ) : (
                        <button
                          onClick={() => setConfirm({ snapId: snap.id, roundId: null })}
                          disabled={busy !== null}
                          className="text-xs font-medium text-rose-300/90 underline underline-offset-4 py-1"
                        >
                          Restore everything…
                        </button>
                      )}
                      <button
                        onClick={() => share(snap)}
                        className="ml-auto btn-ghost px-3 py-1.5 text-xs shrink-0"
                      >
                        Save file
                      </button>
                    </div>
                    {confirm?.snapId === snap.id && (
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        The current state is snapshotted first, so this can be undone from the list.
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
