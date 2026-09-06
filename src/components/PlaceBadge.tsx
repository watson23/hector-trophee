/**
 * A placing — "1", "2", "T3" — as one badge, the same wherever a placing appears: the
 * position column of every leaderboard, and the round headers of a Trophée breakdown.
 * One look for one meaning, so a player scanning their week can pick out every
 * placing at a glance and see where it was won and where it slipped. Black on light
 * purple: the accent's tint, dark text so it reads as a label rather than a button —
 * and gold for a win (1 or T1), the leader's colour everywhere else in the app.
 * Fixed minimum width, so a column of them lines up whatever the label.
 */
export default function PlaceBadge({ label, className = "" }: { label: string; className?: string }) {
  if (!label) return null;
  const win = label === "1" || label === "T1";
  return (
    <span
      className={`inline-flex min-w-[2.125rem] justify-center rounded-md px-1.5 py-px num text-[13px] font-bold leading-[1.45] text-slate-950 ${
        win ? "bg-gold-400" : "bg-violet-200"
      } ${className}`}
    >
      {label}
    </span>
  );
}
