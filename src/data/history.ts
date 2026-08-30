/**
 * Last year's result, for lineage: the champions card names who the title was taken
 * from, and the Hector footnote gets a real number to anchor "what's a good total".
 * From the organiser's 2025 spreadsheet — the same one the scoring engine's regression
 * fixture reproduces. (The 2025 Victor winner isn't in that spreadsheet, so no line
 * is shown for Victor rather than guessing.)
 */
export const PREVIOUS = {
  year: 2025,
  hector: { label: "Lasse K + Jari K", points: 222.0 },
} as const;
