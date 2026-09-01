import { useEffect, useState } from "react";
import { usePersistentState } from "../hooks/usePersistentState";
import type { Announcement, EventDoc, FieldPlayer, Round } from "../types";
import { courseGuideUrl, courses, holeMetres, teeDotClass, teeLabel } from "../data/courses";
import { courseHandicap } from "../lib/handicap";
import { effectiveTee, hiFor } from "../lib/engine";
import { levelParTotal, weightLabel } from "../lib/hector";
import { checkPin } from "../lib/pin";
import { Header } from "../components/Chrome";
import CourseHero, { EstablishingShot } from "../components/CourseHero";
import FlightList from "../components/FlightList";
import { PREVIOUS } from "../data/history";

interface Props {
  event: EventDoc;
  rounds: Round[];
  me: FieldPlayer | null;
  admin: boolean;
  backend: "firestore" | "local" | null;
  /** Hector TV: hide News, organiser access and the player identity. */
  spectator?: boolean;
  /** Newest announcement timestamp this device has seen. */
  newsSeen: number;
  onSeenNews: (at: number) => void;
  saveEvent: (patch: Partial<EventDoc>) => Promise<void>;
  onAdmin: () => void;
  onOpenAdmin: () => void;
  onSwitchPlayer: () => void;
  /** Player mode: peek at Hector TV on this device without losing the session. */
  onWatchTV?: () => void;
}

export default function InfoScreen({
  event,
  rounds,
  me,
  admin,
  backend,
  spectator = false,
  newsSeen,
  onSeenNews,
  saveEvent,
  onAdmin,
  onOpenAdmin,
  onSwitchPlayer,
  onWatchTV,
}: Props) {
  const [section, setSection] = usePersistentState<
    "news" | "schedule" | "field" | "courses" | "formats"
  >("hectro_ui.info", "schedule");
  const announcements = event.announcements ?? [];
  const unread = announcements.some((a) => a.at > newsSeen);
  // Players only see the News chip once there is news; admins always, to post the
  // first. Spectators never do — announcements are trip logistics, not broadcast.
  const showNews = !spectator && (announcements.length > 0 || admin);

  // Hector TV never shows the news — and the section is persisted per device, so a
  // stored "news" (or the unread auto-land below) must not leak it in through the back
  // door when the chip itself is hidden.
  const activeSection = section === "news" && !showNews ? "schedule" : section;

  // Something new lands this tab straight on it — the dot on the Info icon promised it.
  useEffect(() => {
    if (unread && showNews) setSection("news");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread, showNews]);

  // Reading the news is what clears the dot.
  useEffect(() => {
    if (activeSection === "news" && showNews && announcements.length > 0) {
      const newest = Math.max(...announcements.map((a) => a.at));
      if (newest > newsSeen) onSeenNews(newest);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, announcements.length]);

  return (
    <div className="pb-4">
      <Header
        masthead
        title={event.name}
        /* Just the dates — the place lives on the postcard right below, where
           its caption says it better than a text line ever did. */
        subtitle={<span className="text-xs whitespace-nowrap">{event.dates}</span>}
        right={
          me && (
            /* Quiet on purpose: switching player is a rare correction, not a feature —
               a plain block whose small "switch" hint is enough for the one time it's
               needed. */
            <button
              onClick={onSwitchPlayer}
              className="shrink-0 text-right"
              aria-label="Change player"
            >
              <div className="text-sm font-semibold leading-tight">{me.name}</div>
              <div className="text-[11px] text-slate-500 num leading-tight">
                HCP {me.hi.toFixed(1)} · <span className="font-sans">switch</span>
              </div>
            </button>
          )
        }
      />

      {/* The postcard opens the view for everyone — it earned its keep on TV. */}
      <div className="card overflow-hidden mx-4 mb-4">
        <EstablishingShot
          src="/courses/vista.webp"
          caption="Konopiště · Czechia"
          height="h-36"
          insetClass=""
        />
      </div>

      {/* Section idents, not pills: tracked caps on a hairline, the active one
          underlined — the same voice as the chyron and the TV bar. */}
      <div className="px-4 flex gap-4 overflow-x-auto border-b border-slate-800">
        {(["news", "schedule", "field", "courses", "formats"] as const)
          .filter((sec) => sec !== "news" || showNews)
          .map((sec) => (
            <button
              key={sec}
              onClick={() => setSection(sec)}
              className={`relative shrink-0 pt-1 pb-2.5 num text-[11px] tracking-[0.14em] uppercase transition-colors ${
                activeSection === sec ? "text-violet-300 font-semibold" : "text-slate-500"
              }`}
            >
              {sec}
              {activeSection === sec && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-violet-500" />
              )}
              {sec === "news" && unread && (
                <span className="absolute top-0 -right-1.5 w-2 h-2 rounded-full bg-amber-400" />
              )}
            </button>
          ))}
      </div>

      <div className="px-4 mt-4 space-y-3">
        {activeSection === "news" && showNews && (
          <News announcements={announcements} admin={admin} saveEvent={saveEvent} />
        )}
        {activeSection === "schedule" &&
          rounds.map((r) => <RoundCard key={r.id} round={r} event={event} me={me} />)}
        {activeSection === "field" && <Field event={event} me={me} />}
        {activeSection === "courses" &&
          Object.values(courses).map((c) => <CourseCard key={c.id} courseId={c.id} />)}
        {activeSection === "formats" && <Formats rounds={rounds} />}
      </div>

      <div className="px-4 mt-6">
        {/* Hector TV and organiser access are for the rare moment, not the round —
            one quiet footer line, not a stack of buttons on every section. */}
        {!spectator && (
          <div className="flex items-center justify-center flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
            <ShareTV />
            {onWatchTV && (
              <button onClick={onWatchTV} className="hover:text-slate-400 py-2">
                Watch TV here
              </button>
            )}
            {admin ? (
              <button onClick={onOpenAdmin} className="hover:text-slate-400 py-2">
                Admin
              </button>
            ) : (
              <AdminUnlock hash={event.adminPinHash} onUnlock={onAdmin} />
            )}
          </div>
        )}
        <p className="text-[11px] text-slate-600 mt-3 text-center leading-relaxed">
          {backend === "local"
            ? "Demo mode — no cloud project connected, so scores stay on this device."
            : "Synced live via Firestore. Scores entered offline upload when signal returns."}
        </p>
        {/* Which version this device runs — support question #1, and the way to watch
            the auto-update do its thing. */}
        <p className="text-[10px] text-slate-500 mt-1 text-center num">{__BUILD__}</p>
      </div>
    </div>
  );
}

function RoundCard({
  round,
  event,
  me,
}: {
  round: Round;
  event: EventDoc;
  me: FieldPlayer | null;
}) {
  const course = courses[round.courseId];
  const tee = effectiveTee(round, course);
  const group = round.groups.find((g) => g.playerIds.includes(me?.id ?? ""));
  const ch = me ? courseHandicap(hiFor(round, me), tee) : null;
  const [showFlights, setShowFlights] = useState(false);
  const hasFlights = round.groups.some((g) => g.playerIds.length > 0);

  return (
    <div
      className={`card p-3.5 ${round.status === "open" ? "shadow-[inset_3px_0_0_theme(colors.emerald.400)]" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-violet-400 num">R{round.seq}</span>
            <span className="text-sm font-semibold truncate">{round.day}</span>
            {round.status === "open" && (
              <span className="pill bg-emerald-950 text-emerald-400">
                <span className="live-dot" />
                Live
              </span>
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
          <div className="text-[10px] text-slate-500">{group ? "your tee" : "tee times"}</div>
          <div className="score text-base text-slate-200">
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
                H {weightLabel(f.hector.pct)}
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
      {/* The full tee sheet — what gets relayed across the course ("when do the others
          go out?"), so it belongs to everyone, not just the admin who set it. */}
      {hasFlights && (
        <div className="mt-2.5 border-t border-slate-800 pt-2.5">
          <button
            onClick={() => setShowFlights((v) => !v)}
            className="text-xs text-violet-400 font-medium"
          >
            {showFlights ? "Hide flights" : `All flights (${round.groups.filter((g) => g.playerIds.length > 0).length})`}
          </button>
          {showFlights && (
            <div className="mt-2">
              <FlightList round={round} event={event} meId={me?.id ?? null} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The field, bucket by bucket. Pre-draft this is the page that gets studied: who's
 * coming this year, how strong the field is, and who sits near the line — the buckets
 * keep moving with the nightly handicap updates right up to Thursday's draft.
 */
function Field({ event, me }: { event: EventDoc; me: FieldPlayer | null }) {
  const buckets = ([1, 2] as const).map((b) =>
    event.players.filter((p) => p.bucket === b).sort((a, x) => a.hi - x.hi),
  );
  const avg = (ps: FieldPlayer[]) =>
    ps.length ? ps.reduce((a, p) => a + p.hi, 0) / ps.length : 0;
  const drafted = event.pairs.length > 0;

  return (
    <div className="space-y-5">
      {/* The field's two numbers, in the scoreboard face — no box needed. */}
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <span className="score text-3xl">{event.players.length}</span>
          <span className="text-[11px] uppercase tracking-wider text-slate-500">players</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="score text-3xl text-violet-300">{avg(event.players).toFixed(1)}</span>
          <span className="text-[11px] uppercase tracking-wider text-slate-500">avg HCP</span>
        </div>
      </div>

      {buckets.map((players, i) => (
        <section key={i}>
          <div className="flex items-baseline justify-between border-b border-slate-700/70 pb-1.5">
            <h3 className="num text-[11px] tracking-[0.18em] uppercase font-semibold text-slate-500">
              Bucket {i + 1}
            </h3>
            <span className="text-[11px] text-slate-500 num">avg {avg(players).toFixed(1)}</span>
          </div>
          <ul>
            {players.map((p) => (
              <li
                key={p.id}
                className="flex items-baseline justify-between text-sm py-2 border-b border-slate-800 last:border-0"
              >
                <span className={p.id === me?.id ? "font-semibold" : "text-slate-300"}>
                  {p.name}
                  {p.id === me?.id && (
                    <span className="ml-1.5 text-[10px] font-semibold text-violet-400">you</span>
                  )}
                </span>
                <span className="text-[11px] text-slate-500 num">{p.hi.toFixed(1)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="text-[11px] text-slate-500 leading-relaxed">
        {drafted
          ? "The draft pairs one player from each bucket."
          : "Handicaps refresh nightly from hector.golf until the draft — a moving handicap can still carry someone across the bucket line. The draft pairs one player from each bucket."}
      </p>
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
      <CourseHero courseId={courseId} height="h-32" inset={false} />
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
          {courseGuideUrl(courseId) && (
            <a
              href={courseGuideUrl(courseId)!}
              target="_blank"
              rel="noreferrer"
              className="block mb-3 text-xs text-violet-400 font-medium"
            >
              Full course guide on hector.golf — photos, layout and hole maps ↗
            </a>
          )}
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

/**
 * The rules reference — the page that settles the terrace argument. Everything here is
 * derived from the live round configs rather than hardcoded, so an admin edit to a
 * format or weight shows up in the rules too.
 */
function Formats({ rounds }: { rounds: Round[] }) {
  const par = 72;
  const level = levelParTotal(
    rounds.flatMap((r) =>
      r.formats
        .filter((f) => f.hector)
        .map((f) => ({
          pct: f.hector!.pct,
          countsBothPlayers: f.hector!.source === "bothIndividuals",
        })),
    ),
    par,
  );
  const hectorRounds = rounds.flatMap((r) =>
    r.formats.filter((f) => f.hector).map((f) => ({ round: r, f })),
  );
  const bonusRounds = hectorRounds.filter(
    ({ f }) => f.bonuses && (f.bonuses.birdie || f.bonuses.eagle),
  );
  const victorRounds = rounds.filter((r) => r.formats.some((f) => f.victor));

  const sourceLabel: Record<string, string> = {
    betterIndividual: "the better player's round",
    team: "the pair's score",
    bothIndividuals: "each player's round, both counted",
  };

  const formats = [
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
  ];

  return (
    <div>
      {/* The pair competition first: it is the main event, and the one nobody can
          rescore in their head without the rules in front of them. De-boxed into a
          rules sheet: hairline sections, tracked-caps headings. */}
      <div className="py-4 pt-1">
        <h3 className="num text-[11px] tracking-[0.18em] uppercase font-semibold text-violet-300">
          The Hector · pairs
        </h3>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
          A <strong className="text-slate-300 font-semibold">stroke total — lower wins</strong>.
          Each round adds a weighted share of the pair's result:
        </p>
        <ul className="mt-2 space-y-1">
          {hectorRounds.map(({ round, f }) => (
            <li key={`${round.id}-${f.id}`} className="text-[11px] text-slate-400 flex gap-1.5">
              <span className="num font-bold text-violet-400 shrink-0 w-5">R{round.seq}</span>
              <span>
                <span className="num font-semibold text-slate-300">{weightLabel(f.hector!.pct)}</span>{" "}
                of {sourceLabel[f.hector!.source] ?? "the score"} —{" "}
                {f.label.replace(/ Stroke Play/, "")}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-400 mt-2 leading-relaxed">
          Standings show <strong className="text-slate-300 font-semibold">to par</strong>, so
          pairs mid-round compare fairly — each hole lands with its round's weight, and a
          bogey in a 50% round costs +0.5. The stroke total sits behind each pair's
          breakdown.
        </p>
        <p className="text-xs text-slate-400 mt-2.5 leading-relaxed">
          Stableford rounds convert to strokes first:{" "}
          <span className="num text-slate-300">strokes = 2 × par − (points + 36)</span> — so 39
          points on a par-72 course counts as 69 strokes.
        </p>
        {bonusRounds.map(({ round, f }) => (
          <p key={round.id} className="text-xs text-amber-400/90 mt-2 leading-relaxed">
            Round {round.seq} pays bonuses on <em>gross</em> scores:
            {f.bonuses!.birdie ? ` every birdie takes ${f.bonuses!.birdie.toFixed(1)} off the total` : ""}
            {f.bonuses!.eagle ? `, an eagle ${f.bonuses!.eagle.toFixed(1)}` : ""}.
          </p>
        ))}
        <p className="text-xs text-slate-500 mt-2.5 leading-relaxed">
          For scale: a pair at level par all week finishes on{" "}
          <span className="num text-slate-400">{level.toFixed(1)}</span>. The {PREVIOUS.year}{" "}
          title was won on{" "}
          <span className="num text-slate-400">{PREVIOUS.hector.points.toFixed(1)}</span> by{" "}
          {PREVIOUS.hector.label}.
        </p>
      </div>

      <div className="py-4 border-t border-slate-800">
        <h3 className="num text-[11px] tracking-[0.18em] uppercase font-semibold text-violet-300">
          The draft
        </h3>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
          Round 1 is played individually; its Stableford order is the pick order on Thursday
          night. Best round picks first, from the opposite bucket, and so on until ten pairs
          stand. One exception: last year's winners defend their title together by right, so
          they are paired before the draft starts and sit it out.
        </p>
      </div>

      <div className="py-4 border-t border-slate-800">
        <h3 className="num text-[11px] tracking-[0.18em] uppercase font-semibold text-amber-300">
          The Victor · individual
        </h3>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
          Your Stableford NET points from the {victorRounds.length} Stableford rounds
          {victorRounds.length > 0 && (
            <> ({victorRounds.map((r) => `R${r.seq}`).join(" + ")})</>
          )}
          , added up. Highest wins.
        </p>
      </div>

      {formats.map((i) => (
        <div key={i.title} className="py-4 border-t border-slate-800">
          <h3 className="num text-[11px] tracking-[0.18em] uppercase font-semibold text-slate-300">
            {i.title}
          </h3>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">{i.body}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * Announcements. WhatsApp remains the channel for chatter; this is the pinboard for the
 * absolute essentials — a tee change, lunch moved — the things that must be findable in
 * the app and worth an unread dot on the Info tab.
 */
function News({
  announcements,
  admin,
  saveEvent,
}: {
  announcements: Announcement[];
  admin: boolean;
  saveEvent: (patch: Partial<EventDoc>) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const sorted = [...announcements].sort((a, b) => b.at - a.at);

  async function post() {
    const text = draft.trim();
    if (!text) return;
    await saveEvent({
      announcements: [{ id: `a${Date.now()}`, text, at: Date.now() }, ...announcements],
    });
    setDraft("");
  }

  const stamp = (at: number) =>
    new Date(at).toLocaleString("en-GB", {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="space-y-3">
      {admin && (
        <form
          className="card p-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void post();
          }}
        >
          <textarea
            className="input w-full text-sm min-h-[4.5rem] resize-y"
            placeholder="Announcement — everyone gets a dot on the Info tab"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" className="btn-primary w-full py-2 text-sm" disabled={!draft.trim()}>
            Post
          </button>
          <p className="text-[11px] text-slate-500 text-center">
            Only organisers can post — players just see the announcements.
          </p>
        </form>
      )}

      {sorted.length === 0 && (
        <p className="text-sm text-slate-500 text-center py-6">Nothing announced yet.</p>
      )}

      {sorted.map((a) => (
        <div key={a.id} className="card p-3.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] text-slate-500 num">{stamp(a.at)}</span>
            {admin &&
              (confirmDelete === a.id ? (
                <span className="flex gap-2 shrink-0">
                  <button
                    onClick={() =>
                      void saveEvent({
                        announcements: announcements.filter((x) => x.id !== a.id),
                      }).then(() => setConfirmDelete(null))
                    }
                    className="text-[11px] font-semibold text-white bg-rose-600 rounded px-1.5 py-0.5"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setConfirmDelete(null)}
                    className="text-[11px] text-slate-400"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmDelete(a.id)}
                  className="text-[11px] text-slate-600 hover:text-rose-400 shrink-0"
                >
                  remove
                </button>
              ))}
          </div>
          <p className="text-sm text-slate-200 mt-1 leading-relaxed whitespace-pre-wrap">{a.text}</p>
        </div>
      ))}
    </div>
  );
}

/** Copies the spectator link — pasted to family and the Hectorians staying home. */
function ShareTV() {
  const [copied, setCopied] = useState(false);
  const url = `${location.origin}/tv`;
  return (
    <button
      onClick={() => {
        void navigator.clipboard?.writeText(url).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className={`py-2 ${copied ? "text-emerald-400" : "hover:text-slate-400"}`}
    >
      {copied ? "Link copied ✓" : "Share Hector TV"}
    </button>
  );
}

function AdminUnlock({ hash, onUnlock }: { hash: string; onUnlock: () => void }) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="hover:text-slate-400 py-2">
        Organiser access
      </button>
    );
  }

  return (
    <form
      className="card p-3.5 flex gap-2 basis-full"
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
