import type { Course } from "../../src/types.js";

/**
 * Golf & Spa Resort Konopiště, Czechia — the two courses used at Hector Trophée 2026.
 * Par, stroke index and per-tee CR/slope taken from the published scorecards on hector.golf.
 *
 * Blue and red are rated for men from mscorecard.com (2.9.2026) — the resort's own
 * combined chart prints only the women's ratings for those tees, which is why every
 * public source looked wrong. The `suspect` flag mechanism stays for future tees.
 */
export const courses: Record<string, Course> = {
  radecky: {
    id: "radecky",
    name: "Konopiště – Radecký",
    shortName: "Radecký",
    par: [5, 4, 4, 5, 4, 3, 4, 3, 4, 3, 4, 5, 4, 5, 4, 3, 4, 4],
    si: [10, 18, 4, 14, 6, 16, 2, 8, 12, 11, 7, 5, 17, 1, 13, 3, 15, 9],
    tees: {
      black: { colour: "black", cr: 75.6, slope: 147, par: 72, metres: 6484 },
      white: { colour: "white", cr: 73.7, slope: 146, par: 72, metres: 6168 },
      yellow: { colour: "yellow", cr: 72.2, slope: 142, par: 72, metres: 5859 },
      // Men's ratings from mscorecard.com (found by Lasse, 2.9.2026) — the published
      // chart's 76.1/145 and 74.2/140 are the women's ratings for these tees.
      blue: { colour: "blue", cr: 70.2, slope: 137, par: 72, metres: 5522 },
      red: { colour: "red", cr: 68.6, slope: 132, par: 72, metres: 5221 },
    },
  },
  deste: {
    id: "deste",
    name: "Konopiště – d'Este",
    shortName: "d'Este",
    par: [4, 4, 5, 3, 4, 4, 5, 3, 4, 4, 3, 5, 4, 4, 4, 5, 3, 4],
    si: [11, 7, 1, 17, 15, 5, 13, 3, 9, 12, 6, 16, 2, 18, 4, 8, 14, 10],
    tees: {
      white: { colour: "white", cr: 73.5, slope: 145, par: 72, metres: 6086 },
      yellow: { colour: "yellow", cr: 71.7, slope: 140, par: 72, metres: 5730 },
      // Men's ratings from mscorecard.com (found by Lasse, 2.9.2026) — the published
      // chart's 75.8/145 and 73.9/139 are the women's ratings for these tees.
      blue: { colour: "blue", cr: 69.6, slope: 136, par: 72, metres: 5372 },
      red: { colour: "red", cr: 67.6, slope: 131, par: 72, metres: 5011 },
    },
  },
  hirsala: {
    id: "hirsala",
    name: "Hirsala Golf",
    shortName: "Hirsala",
    /* Field-test course (Kirkkonummi). Par + SI from the user's own hector-scores
       app (field-validated on the current par-73 card); yellow CR/slope from the
       club's "Miehet slope 2026" PDF; metres from mscorecard's par-73 card. */
    par: [4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 4, 5, 4, 3, 5, 3, 4, 5],
    si: [2, 18, 12, 16, 10, 8, 6, 14, 4, 13, 5, 15, 3, 17, 9, 11, 1, 7],
    tees: {
      yellow: { colour: "yellow", cr: 70.8, slope: 127, par: 73, metres: 5596 },
    },
  },
};

/** Hole lengths in metres per tee, for the scorecard view. */
export const holeMetres: Record<string, Record<string, number[]>> = {
  radecky: {
    black: [471, 360, 358, 436, 352, 166, 376, 189, 379, 128, 370, 545, 384, 542, 422, 192, 421, 393],
    white: [453, 330, 337, 419, 332, 155, 357, 178, 353, 128, 354, 528, 368, 519, 399, 182, 398, 378],
    yellow: [421, 308, 319, 403, 313, 147, 337, 163, 335, 128, 339, 503, 344, 499, 383, 168, 387, 362],
    blue: [412, 277, 301, 383, 296, 124, 305, 153, 324, 112, 323, 482, 336, 478, 375, 147, 370, 324],
    red: [391, 257, 288, 363, 296, 105, 278, 138, 303, 112, 306, 459, 308, 454, 355, 138, 370, 300],
  },
  deste: {
    white: [334, 369, 483, 135, 336, 359, 460, 218, 328, 301, 177, 478, 408, 364, 351, 458, 150, 377],
    yellow: [321, 355, 453, 127, 319, 346, 436, 193, 306, 288, 154, 454, 384, 333, 340, 429, 140, 352],
    blue: [299, 333, 423, 120, 297, 332, 416, 172, 285, 264, 140, 428, 365, 313, 322, 409, 131, 323],
    red: [283, 305, 391, 113, 273, 320, 395, 149, 262, 252, 120, 395, 338, 290, 311, 390, 121, 303],
  },
  hirsala: {
    yellow: [330, 109, 324, 438, 328, 312, 315, 142, 476, 274, 330, 415, 347, 135, 447, 124, 360, 390],
  },
};

export const teeLabel: Record<string, string> = {
  black: "Black",
  white: "White",
  yellow: "Yellow",
  blue: "Blue",
  red: "Red",
};

/** "Yellow tee" — the indicator wording wherever a round names its tee. */
export function teeText(tee: string): string {
  return `${teeLabel[tee] ?? tee} tee`;
}

/** The tee colours as hex, for SVG — the same hues as teeDotClass. */
export const teeHex: Record<string, string> = {
  black: "#0f172a",
  white: "#f1f5f9",
  yellow: "#fbbf24",
  blue: "#0ea5e9",
  red: "#f43f5e",
};

/** Tailwind classes for the tee dot shown next to a round. */
export const teeDotClass: Record<string, string> = {
  black: "bg-slate-900 ring-1 ring-slate-600",
  white: "bg-slate-100",
  yellow: "bg-amber-400",
  blue: "bg-sky-500",
  red: "bg-rose-500",
};

/**
 * hector.golf's course pages — hero photos, full scorecards, and a layout diagram for
 * every hole. The app links to the pages and embeds the per-hole diagrams in the
 * score entry, rather than duplicating any of it.
 */
const hectorSlug: Record<string, string> = {
  radecky: "konopiste-radecky",
  deste: "konopiste-deste",
};

export function courseGuideUrl(courseId: string): string | null {
  const slug = hectorSlug[courseId];
  return slug ? `https://hector.golf/courses/${slug}/` : null;
}

/** The course's establishing shot — borrowed from its hector.golf page, but bundled
    (public/courses/, resized + webp) so it's precached and works offline from install.
    Chosen for light that sits in the app's dark world: dawn at the 18th (Radecký),
    golden hour over the bunkers (d'Este). */
const heroImage: Record<string, string> = {
  radecky: "/courses/radecky.webp",
  deste: "/courses/deste.webp",
  hirsala: "/courses/hirsala.webp",
};

/** The chyron caption under each hero — place · course, in the course's own terms. */
const heroCaption: Record<string, string> = {
  radecky: "Konopiště · Radecký",
  deste: "Konopiště · d'Este",
  hirsala: "Hirsala · Kirkkonummi",
};

export function courseHeroCaption(courseId: string): string | null {
  return heroCaption[courseId] ?? null;
}

export function courseHeroUrl(courseId: string): string | null {
  return heroImage[courseId] ?? null;
}

export function holeMapUrl(courseId: string, hole: number): string | null {
  const slug = hectorSlug[courseId];
  return slug ? `https://hector.golf/images/courses/${slug}/holes/${hole}.png` : null;
}
