/**
 * Short forms of names for tight spaces, made unambiguous within the set they appear
 * in. Two Ollis in one pair are "OA" and "OV" in a tee-shot cell, "Olli A" and
 * "Olli V" in a caption; a lone Olli is just "O" and "Olli".
 */

/** One or two letters per name: the first-name initial, plus the surname's when two share it. */
export function initials(names: string[]): string[] {
  const first = names.map((n) => n.trim().charAt(0).toUpperCase());
  return names.map((n, i) => {
    const clash = first.some((f, j) => j !== i && f === first[i]);
    if (!clash) return first[i];
    const parts = n.trim().split(/\s+/);
    return first[i] + (parts[1]?.charAt(0).toUpperCase() ?? "");
  });
}

/** First names, with the surname initial added where two are the same. */
export function shortNames(names: string[]): string[] {
  const firsts = names.map((n) => n.trim().split(/\s+/)[0]);
  return names.map((n, i) => {
    const clash = firsts.some((f, j) => j !== i && f === firsts[i]);
    if (!clash) return firsts[i];
    const parts = n.trim().split(/\s+/);
    return parts[1] ? `${firsts[i]} ${parts[1].charAt(0).toUpperCase()}` : firsts[i];
  });
}
