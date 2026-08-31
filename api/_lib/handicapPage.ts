/**
 * The hector.golf event-page parser — THE parser, one implementation for both
 * consumers: the app's Admin refresh (via src/lib/handicapSource.ts, which re-exports
 * it) and the 07:00 cron next to it. It lives here rather than in src/ because
 * Vercel's function runtime only compiles modules inside api/; Vite is happy to
 * import across the boundary in the other direction, so this is the one spot both
 * sides can reach. Underscore directories are not exposed as endpoints.
 *
 * Regex rather than DOM, so it needs no browser. The live page is Astro-generated —
 * elements carry data-astro-cid-* attributes with whitespace between everything — so
 * every gap tolerates attributes and space. The one hard rule: when the page changes
 * shape, return nothing rather than guess. The fixture test in
 * src/lib/handicapSource.test.ts pins the structure for everyone.
 */

export interface FetchedHandicap {
  id: string;
  name: string;
  hi: number;
  bucket: 1 | 2;
}

/** Served from GitHub Pages with `access-control-allow-origin: *`, so browsers can read it too. */
export function eventUrl(eventId: string): string {
  return `https://hector.golf/events/hector/${eventId}/`;
}

export function parseHandicaps(html: string): FetchedHandicap[] {
  const out: FetchedHandicap[] = [];
  // `bucket\b` so "buckets", the wrapper div, doesn't start a chunk.
  for (const chunk of html.split(/<div class="bucket\b/).slice(1)) {
    const bucket = /^[^">]*bucket2/.test(chunk) ? 2 : 1;
    const rows = chunk.matchAll(
      /<td class="name"[^>]*>\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/td>\s*<td class="handicap"[^>]*>\s*\(([-\d.,]+)\)\s*<\/td>/g,
    );
    for (const m of rows) {
      const id = m[1].split("/").filter(Boolean).pop();
      const name = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      const hi = Number(m[3].replace(",", "."));
      if (id && name && !Number.isNaN(hi)) out.push({ id, name, hi, bucket });
    }
  }
  return out;
}
