import type { FieldPlayer } from "../types";

/**
 * The 2026 field and projected buckets, as published on
 * https://hector.golf/events/hector/HECTOR2026/
 *
 * Handicap indexes are the projected ones; they can be corrected in Admin.
 */
export const field: FieldPlayer[] = [
  { id: "jari-k", name: "Jari K", hi: 1.5, bucket: 1 },
  { id: "sami-h", name: "Sami H", hi: 5.0, bucket: 1 },
  { id: "ofri-p", name: "Ofri P", hi: 5.7, bucket: 1 },
  { id: "simo-l", name: "Simo L", hi: 6.1, bucket: 1 },
  { id: "ossi-l", name: "Ossi L", hi: 7.0, bucket: 1 },
  { id: "toni-k", name: "Toni K", hi: 7.5, bucket: 1 },
  { id: "olli-v", name: "Olli V", hi: 8.2, bucket: 1 },
  { id: "juuso-p", name: "Juuso P", hi: 8.3, bucket: 1 },
  { id: "marcus-m", name: "Marcus M", hi: 9.0, bucket: 1 },
  { id: "olli-a", name: "Olli A", hi: 9.8, bucket: 1 },
  { id: "jussi-a", name: "Jussi A", hi: 10.3, bucket: 2 },
  { id: "martin-s", name: "Martin S", hi: 10.4, bucket: 2 },
  { id: "timo-l", name: "Timo L", hi: 11.1, bucket: 2 },
  { id: "lassi-k", name: "Lassi K", hi: 11.7, bucket: 2 },
  { id: "harri-v", name: "Harri V", hi: 11.9, bucket: 2 },
  { id: "lauri-p", name: "Lauri P", hi: 12.5, bucket: 2 },
  { id: "toni-m", name: "Toni M", hi: 13.3, bucket: 2 },
  { id: "jarkko-k", name: "Jarkko K", hi: 13.3, bucket: 2 },
  { id: "kristian-h", name: "Kristian H", hi: 13.9, bucket: 2 },
  { id: "lasse-k", name: "Lasse K", hi: 14.8, bucket: 2 },
];

export const EVENT_ID = "HECTOR2026";
