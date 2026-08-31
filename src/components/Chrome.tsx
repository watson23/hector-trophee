import { useEffect, useState, type ReactNode } from "react";
import HectorMark from "./HectorMark";
import { switchSpace, type Space } from "../lib/space";

export type Tab = "play" | "round" | "tournament" | "info";

const TABS: { id: Tab; label: string; icon: ReactNode | null }[] = [
  {
    id: "play",
    label: "Play",
    icon: (
      <path d="M12 3v13m0 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM12 4l7 3-7 3" strokeLinejoin="round" />
    ),
  },
  {
    id: "round",
    label: "Round",
    icon: <path d="M4 19V9m5 10V5m5 14v-7m5 7V8" strokeLinecap="round" />,
  },
  { id: "tournament", label: "Trophy", icon: null },
  {
    // "Info", not "More": the tab holds the schedule, tee sheet, courses and rules —
    // things people actively look for. "More" said "miscellaneous", so nobody looked.
    id: "info",
    label: "Info",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5m0-8.5v.5" strokeLinecap="round" strokeWidth={2.2} />
      </>
    ),
  },
];

export function TabBar({
  tab,
  onChange,
  badges,
  visible,
  labels,
}: {
  tab: Tab;
  onChange: (t: Tab) => void;
  /** Tabs with something unseen behind them get a dot. */
  badges?: Partial<Record<Tab, boolean>>;
  /** Hector TV shows a subset of the tabs, with the Round tab relabelled "Live". */
  visible?: Tab[];
  labels?: Partial<Record<Tab, string>>;
}) {
  const shown = visible ? TABS.filter((t) => visible.includes(t.id)) : TABS;
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-30 bg-slate-950/95 backdrop-blur border-t border-slate-800"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className={`max-w-lg mx-auto grid ${shown.length === 3 ? "grid-cols-3" : "grid-cols-4"}`}>
        {shown.map((t) => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={`relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
              tab === t.id ? "text-violet-400" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {badges?.[t.id] && (
              <span className="absolute top-1.5 right-[calc(50%-16px)] w-2 h-2 rounded-full bg-amber-400" />
            )}
            {t.icon ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                className="w-6 h-6"
                aria-hidden="true"
              >
                {t.icon}
              </svg>
            ) : (
              <HectorMark className="w-6 h-6" />
            )}
            {labels?.[t.id] ?? t.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

/**
 * Impossible to mistake for the real thing: whenever a device is in the test space,
 * this stays at the top. The way back is right in the banner, so a device can always
 * return to the tournament without hunting for the admin toggle.
 */
export function SpaceBanner({ space }: { space: Space }) {
  if (space !== "test") return null;
  return (
    <div className="bg-sky-950/80 border-b border-sky-900 text-sky-300 text-xs px-4 py-1.5 text-center">
      Test space — a sandbox, not the real tournament.{" "}
      <button
        onClick={() => switchSpace("live")}
        className="underline underline-offset-2 font-semibold"
      >
        Back to tournament
      </button>
    </div>
  );
}

/**
 * Writes have been in flight for a while. Every score entry briefly has a pending
 * write, and a banner that pops in and out of the layout for 200ms per tap made the
 * whole screen jump — so nothing is shown until syncing has actually been slow for a
 * couple of seconds, which is when it carries information (one bar of signal on the
 * 14th fairway) rather than noise.
 */
function useSlowSync(pending: number, delayMs = 2000): boolean {
  const [slow, setSlow] = useState(false);
  const hasPending = pending > 0;
  useEffect(() => {
    if (!hasPending) return;
    const t = setTimeout(() => setSlow(true), delayMs);
    // Cleanup both cancels the timer and resets the flag, so the next pending spell
    // starts its two seconds from zero instead of showing instantly.
    return () => {
      clearTimeout(t);
      setSlow(false);
    };
  }, [hasPending, delayMs]);
  return slow && hasPending;
}

/**
 * Connection state. Firestore keeps accepting writes offline, so the message is about
 * whether other groups can see them yet — not whether scoring still works.
 */
export function SyncBanner({
  online,
  pending,
  backend,
}: {
  online: boolean;
  pending: number;
  backend: "firestore" | "local" | null;
}) {
  const slowSync = useSlowSync(pending);
  if (backend === "local") {
    // On localhost this is the intended fallback. On a real domain it means the deploy is
    // missing its Firebase env vars, and every player would silently get their own private
    // database — worth shouting about rather than a quiet grey note.
    const deployed =
      typeof location !== "undefined" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
    if (deployed) {
      return (
        <div className="bg-rose-950 border-b border-rose-800 text-rose-200 text-xs px-4 py-2 text-center leading-relaxed">
          <strong className="font-semibold">Not connected.</strong> This deployment is missing its
          Firebase settings, so scores are saved only on this phone and nobody else can see them.
          Don't score a round on it yet.
        </div>
      );
    }
    return (
      <div className="bg-amber-950/60 border-b border-amber-900 text-amber-300 text-xs px-4 py-1.5 text-center">
        Demo mode — scores stay on this device and sync between tabs only
      </div>
    );
  }
  if (!online) {
    return (
      <div className="bg-slate-800 border-b border-slate-700 text-slate-300 text-xs px-4 py-1.5 text-center">
        Offline — keep scoring{pending > 0 ? `, ${pending} card${pending > 1 ? "s" : ""} waiting to sync` : ", it'll sync when you get signal"}
      </div>
    );
  }
  if (slowSync) {
    // Floating, not in flow: an in-flow banner here pushed the whole screen down and
    // back up on every score entered, making each tap look shaky.
    return (
      <div
        style={{ top: "calc(env(safe-area-inset-top) + 8px)" }}
        className="fixed left-1/2 -translate-x-1/2 z-40 rounded-full bg-violet-950/90 border
                   border-violet-800 text-violet-300 text-xs px-3 py-1 shadow-lg backdrop-blur
                   pointer-events-none"
      >
        Syncing {pending} card{pending > 1 ? "s" : ""}…
      </div>
    );
  }
  return null;
}

export function Header({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight truncate">{title}</h1>
        {subtitle && <div className="text-sm text-slate-400 truncate">{subtitle}</div>}
      </div>
      {right}
    </header>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="card mx-4 p-6 text-center">
      <p className="font-semibold text-slate-200">{title}</p>
      <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">{body}</p>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-full p-1 mx-4">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors truncate ${
            value === o.id ? "bg-violet-600 text-white" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
