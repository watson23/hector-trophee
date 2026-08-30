/**
 * PIN hashing.
 *
 * These are gates, not security: the event PIN keeps a stray link from being used to
 * enter scores, and the admin PIN keeps the pairings from being reshuffled by accident.
 * A determined player with the browser devtools can get past both — which is fine for
 * twenty friends on a golf trip, but worth being clear about.
 */
export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`hector-trophee-2026:${pin.trim().toUpperCase()}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function checkPin(pin: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  return (await hashPin(pin)) === hash;
}
