import { useState } from "react";
import { courseHeroUrl, courses } from "../data/courses";

/**
 * An establishing shot — a broadcast opening frame, not a decoration. Sits flush
 * at the top of a card, scrimmed into the card's own background so the photo
 * emerges from the surface instead of being pasted on it, toned slightly dark and
 * desaturated to live in the app's world, optionally captioned in the chyron voice.
 *
 * The photos are bundled and precached (public/courses), so they're on-device from
 * install and work offline. If one somehow can't load, the block vanishes — the
 * layout owes it nothing.
 */
export function EstablishingShot({
  src,
  caption,
  height = "h-40",
  insetClass = "-mx-4 -mt-4 mb-4 rounded-t-2xl",
  scrimClass = "from-slate-900 via-slate-900/20 to-slate-950/25",
}: {
  src: string;
  caption?: string;
  height?: string;
  /** Negative margins matching the parent card's padding, plus the top radius —
      or "" when the parent is unpadded with overflow-hidden of its own. */
  insetClass?: string;
  /** The bottom-to-top scrim; `from-` must be the parent surface's own colour. */
  scrimClass?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  return (
    <div className={`relative overflow-hidden ${insetClass}`}>
      <img
        src={src}
        alt=""
        onError={() => setFailed(true)}
        className={`w-full ${height} object-cover brightness-[0.88] saturate-[0.9]`}
      />
      <div className={`absolute inset-0 bg-gradient-to-t ${scrimClass}`} />
      {caption && (
        <div className="absolute bottom-2 left-4 num text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
          {caption}
        </div>
      )}
    </div>
  );
}

/** The course's own shot: dawn at the 18th (Radecký), golden hour (d'Este). */
export default function CourseHero({
  courseId,
  height = "h-40",
  inset = true,
}: {
  courseId: string;
  height?: string;
  inset?: boolean;
}) {
  const url = courseHeroUrl(courseId);
  const course = courses[courseId];
  if (!url || !course) return null;
  return (
    <EstablishingShot
      src={url}
      caption={`Konopiště · ${course.shortName}`}
      height={height}
      insetClass={inset ? "-mx-4 -mt-4 mb-4 rounded-t-2xl" : ""}
    />
  );
}
