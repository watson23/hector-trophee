import { useState, type ReactNode } from "react";

/**
 * A card on Admin › Tools: closed, it is a title and one sentence saying what the tool
 * does and how it is undone; open, it is the tool. Everything on that tab is used on
 * need, not daily, so nothing there should be a button at rest.
 */
export default function ToolCard({
  title,
  description,
  tone = "default",
  defaultOpen = false,
  children,
}: {
  title: string;
  description: string;
  /** Danger for tools that delete or overwrite; test for sandbox-only tools. */
  tone?: "default" | "danger" | "test";
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const frame =
    tone === "danger"
      ? "border-rose-900/60 bg-rose-950/20"
      : tone === "test"
        ? "border-amber-900/60 bg-amber-950/20"
        : "border-slate-800 bg-slate-900";
  const heading = tone === "danger" ? "text-rose-300" : tone === "test" ? "text-amber-400" : "text-slate-200";
  return (
    <section className={`mx-4 rounded-2xl border ${frame}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full text-left px-3.5 py-3 flex items-start justify-between gap-3"
      >
        <span className="min-w-0">
          <span className={`block text-[13px] font-semibold ${heading}`}>{title}</span>
          <span className="block text-[12px] text-slate-500 leading-relaxed mt-0.5">{description}</span>
        </span>
        <span className="text-[12px] text-slate-500 shrink-0 pt-0.5">{open ? "Close" : "Open"}</span>
      </button>
      {open && <div className="border-t border-slate-800/70 pt-3 pb-3.5">{children}</div>}
    </section>
  );
}
