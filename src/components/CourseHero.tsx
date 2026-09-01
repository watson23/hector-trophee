import { useState } from "react";
import { courseHeroUrl, courses } from "../data/courses";

/**
 * The course's establishing shot — a broadcast opening frame, not a decoration.
 * Sits flush at the top of a `.card` (escaping its padding), scrimmed into the
 * card's own background so the photo emerges from the surface instead of being
 * pasted on it. Toned slightly dark and desaturated to live in the app's world.
 *
 * The photos are bundled and precached (public/courses), so they're on-device from
 * install and work offline. If one somehow can't load, the block vanishes — the
 * layout owes it nothing.
 */
export default function CourseHero({
  courseId,
  height = "h-40",
  inset = true,
}: {
  courseId: string;
  height?: string;
  /** True when the parent is a `p-4` card the photo must escape; false when the
      parent is unpadded with `overflow-hidden` of its own. */
  inset?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const url = courseHeroUrl(courseId);
  const course = courses[courseId];
  if (!url || !course || failed) return null;

  return (
    <div className={`relative overflow-hidden ${inset ? "-mx-4 -mt-4 mb-4 rounded-t-2xl" : ""}`}>
      <img
        src={url}
        alt=""
        onError={() => setFailed(true)}
        className={`w-full ${height} object-cover brightness-[0.88] saturate-[0.9]`}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/20 to-slate-950/25" />
      <div className="absolute bottom-2 left-4 num text-[10px] font-semibold uppercase tracking-[0.22em] text-white/70">
        Konopiště · {course.shortName}
      </div>
    </div>
  );
}
