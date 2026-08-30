import { useState } from "react";
import type { EventDoc, FieldPlayer, Round } from "../types";
import { courses, holeMetres, teeDotClass, teeLabel } from "../data/courses";
import { courseHandicap } from "../lib/handicap";
import { effectiveTee, hiFor } from "../lib/engine";
import { checkPin } from "../lib/pin";
import { Header } from "../components/Chrome";

interface Props {
  event: EventDoc;
  rounds: Round[];
  me: FieldPlayer | null;
  admin: boolean;
  backend: "firestore" | "local" | null;
  onAdmin: () => void;
  onOpenAdmin: () => void;
  onSwitchPlayer: () => void;
}

export default function MoreScreen({
  event,
  rounds,
  me,
  admin,
  backend,
  onAdmin,
  onOpenAdmin,
  onSwitchPlayer,
}: Props) {
  const [section, setSection] = useState<"schedule" | "courses" | "formats">("schedule");

  return (
    <div className="pb-4">
      <Header
        title={event.name}
        subtitle={`${event.venue} · ${event.dates}`}
        right={
          me && (
            <button
              onClick={onSwitchPlayer}
              className="shrink-0 text-right group"
              aria-label="Change player"
            >
              <div className="text-sm font-semibold group-hover:text-violet-400">{me.name}</div>
              <div className="text-[11px] text-slate-500 num">HCP {me.hi.toFixed(1)}</div>
            </button>
          )
        }
      />

      {admin && (
        <div className="px-4 mb-3">
          <button onClick={onOpenAdmin} className="btn-primary w-full text-sm py-2.5">
            ⚙ Open Admin
          </button>
        </div>
      )}

      <div className="px-4 flex gap-1.5">
        {(["schedule", "courses", "formats"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
              section === s
                ? "bg-violet-600 text-white"
                : "bg-slate-900 text-slate-400 border border-slate-800"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="px-4 mt-4 space-y-3">
        {section === "schedule" && rounds.map((r) => <RoundCard key={r.id} round={r} me={me} />)}
        {section === "courses" &&
          Object.values(courses).map((c) => <CourseCard key={c.id} courseId={c.id} />)}
        {section === "formats" && <Formats />}
      </div>

      <div className="px-4 mt-6">
        {!admin && <AdminUnlock hash={event.adminPinHash} onUnlock={onAdmin} />}
        <p className="text-[11px] text-slate-600 mt-3 text-center leading-relaxed">
          {backend === "local"
            ? "Demo mode — no cloud project connected, so scores stay on this device."
            : "Synced live via Firestore. Scores entered offline upload when signal returns."}
        </p>
      </div>
    </div>
  );
}

function RoundCard({ round, me }: { round: Round; me: FieldPlayer | null }) {
  const course = courses[round.courseId];
  const tee = effectiveTee(round, course);
  const group = round.groups.find((g) => g.playerIds.includes(me?.id ?? ""));
  const ch = me ? courseHandicap(hiFor(round, me), tee) : null;

  return (
    <div
      className={`card p-3.5 ${round.status === "open" ? "ring-1 ring-emerald-700 border-emerald-800" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-violet-400 num">R{round.seq}</span>
            <span className="text-sm font-semibold truncate">{round.day}</span>
            {round.status === "open" && (
              <span className="pill bg-emerald-950 text-emerald-400">Live</span>
            )}
            {round.status === "final" && (
              <span className="pill bg-slate-800 text-slate-400">Final</span>
            )}
          </div>
          <div className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
            {course.shortName}
            <span className={`inline-block w-2 h-2 rounded-full ${teeDotClass[round.tee]}`} />
            {teeLabel[round.tee]}
            <span className="text-slate-600 num">
              {tee.cr}/{tee.slope}
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm num font-semibold text-slate-300">
            {group?.teeTime ?? round.teeTimeWindow}
          </div>
          {ch !== null && <div className="text-[11px] text-slate-500 num">your CH {ch}</div>}
        </div>
      </div>
      <ul className="mt-2.5 space-y-1">
        {round.formats.map((f) => (
          <li key={f.id} className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <span className="text-slate-600">•</span>
            <span className="truncate">{f.label}</span>
            {f.net && <span className="text-slate-600 num">{Math.round(f.allowance * 100)}%</span>}
            {f.hector && (
              <span className="pill bg-violet-950/70 text-violet-300 text-[10px]">
                H {Math.round(f.hector.pct * 100)}%
              </span>
            )}
            {f.victor && (
              <span className="pill bg-amber-950/70 text-amber-300 text-[10px]">V</span>
            )}
          </li>
        ))}
      </ul>
      {tee.suspect && (
        <p className="mt-2 text-[10px] text-amber-500/80 leading-relaxed">
          The published rating for this tee looks like a ladies' rating. Check it against the club
          scorecard and override it in Admin if needed.
        </p>
      )}
    </div>
  );
}

function CourseCard({ courseId }: { courseId: string }) {
  const [open, setOpen] = useState(false);
  const course = courses[courseId];
  const teeKeys = Object.keys(course.tees);
  const [tee, setTee] = useState(teeKeys.includes("yellow") ? "yellow" : teeKeys[0]);
  const metres = holeMetres[courseId]?.[tee];

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-3.5 text-left"
      >
        <div>
          <div className="font-semibold text-sm">{course.name}</div>
          <div className="text-[11px] text-slate-500 num">
            Par {course.par.reduce((a, b) => a + b, 0)} ·{" "}
            {course.tees[tee].cr}/{course.tees[tee].slope} · {course.tees[tee].metres} m
          </div>
        </div>
        <span className="text-slate-500 text-xs">{open ? "Hide" : "Card"}</span>
      </button>

      {open && (
        <div className="border-t border-slate-800 p-3">
          <div className="flex gap-1.5 mb-3 flex-wrap">
            {teeKeys.map((t) => (
              <button
                key={t}
                onClick={() => setTee(t)}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  tee === t
                    ? "bg-violet-600 text-white"
                    : "bg-slate-800 text-slate-400"
                }`}
              >
                <span className={`inline-block w-2 h-2 rounded-full ${teeDotClass[t]}`} />
                {teeLabel[t]}
              </button>
            ))}
          </div>
          {[0, 9].map((from) => (
            <table key={from} className="w-full text-[10px] num mb-2">
              <tbody>
                <tr className="text-slate-500">
                  <td className="text-left font-sans pr-1">Hole</td>
                  {Array.from({ length: 9 }, (_, i) => (
                    <td key={i} className="text-center font-semibold text-slate-300">
                      {from + i + 1}
                    </td>
                  ))}
                </tr>
                <tr className="text-slate-400">
                  <td className="text-left font-sans pr-1">Par</td>
                  {Array.from({ length: 9 }, (_, i) => (
                    <td key={i} className="text-center">
                      {course.par[from + i]}
                    </td>
                  ))}
                </tr>
                <tr className="text-slate-500">
                  <td className="text-left font-sans pr-1">SI</td>
                  {Array.from({ length: 9 }, (_, i) => (
                    <td key={i} className="text-center">
                      {course.si[from + i]}
                    </td>
                  ))}
                </tr>
                {metres && (
                  <tr className="text-slate-600">
                    <td className="text-left font-sans pr-1">m</td>
                    {Array.from({ length: 9 }, (_, i) => (
                      <td key={i} className="text-center">
                        {metres[from + i]}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          ))}
        </div>
      )}
    </div>
  );
}

function Formats() {
  const items = [
    {
      title: "Stableford NET",
      body: "Points per hole against your net score: 2 for a net par, 3 for a birdie, 1 for a bogey, 0 for anything worse. This is what the Victor trophy is scored on, and it decides the draft order after round 1.",
    },
    {
      title: "Stroke Play",
      body: "Total strokes. SCR means gross, no handicap. NET subtracts your handicap strokes hole by hole.",
    },
    {
      title: "Better Ball Stroke Play NET",
      body: "Both of you play your own ball; on each hole the pair takes the lower net score.",
    },
    {
      title: "Scramble Stroke Play NET",
      body: "One ball for the pair — everyone plays from the best shot. One card, one team handicap at 20% allowance.",
    },
    {
      title: "Hector points",
      body: "The pair competition. Each round contributes a weighted share of the pair's result, as listed on the round card.",
    },
    {
      title: "Victor points",
      body: "The individual competition: your Stableford NET points from the four Stableford rounds, added up.",
    },
  ];
  return (
    <div className="space-y-2.5">
      {items.map((i) => (
        <div key={i.title} className="card p-3.5">
          <h3 className="font-semibold text-sm text-violet-300">{i.title}</h3>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">{i.body}</p>
        </div>
      ))}
    </div>
  );
}

function AdminUnlock({ hash, onUnlock }: { hash: string; onUnlock: () => void }) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full text-center text-xs text-slate-600 hover:text-slate-400 py-2"
      >
        Organiser access
      </button>
    );
  }

  return (
    <form
      className="card p-3.5 flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await checkPin(pin, hash)) onUnlock();
        else setError(true);
      }}
    >
      <input
        autoFocus
        type="password"
        inputMode="numeric"
        className={`input flex-1 num text-center ${error ? "ring-2 ring-rose-500" : ""}`}
        placeholder="Admin PIN"
        value={pin}
        onChange={(e) => {
          setPin(e.target.value);
          setError(false);
        }}
      />
      <button className="btn-primary px-4" type="submit">
        Unlock
      </button>
    </form>
  );
}
