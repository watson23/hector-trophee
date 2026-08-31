// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { applyHandicaps, diffHandicaps, parseHandicaps } from "./handicapSource";
import type { FieldPlayer } from "../types";

/** The shape hector.golf actually serves, trimmed to three players. */
const HTML = `
<div class="field">
  <div class="buckets">
    <div class="bucket bucket1">
      <h3>Bucket 1</h3>
      <table><tbody>
        <tr><td class="name"><a href="/players/jari-k">Jari K</a></td><td class="handicap">
(1.2)
</td></tr>
        <tr><td class="name"><a href="/players/sami-h">Sami H</a></td><td class="handicap">(5.0)</td></tr>
      </tbody></table>
    </div>
    <div class="bucket bucket2">
      <h3>Bucket 2</h3>
      <table><tbody>
        <tr><td class="name"><a href="/players/lasse-k">Lasse K</a></td><td class="handicap">(15.1)</td></tr>
      </tbody></table>
    </div>
  </div>
</div>`;

const field: FieldPlayer[] = [
  { id: "jari-k", name: "Jari K", hi: 1.5, bucket: 1 },
  { id: "sami-h", name: "Sami H", hi: 5.0, bucket: 1 },
  { id: "lasse-k", name: "Lasse K", hi: 14.8, bucket: 2 },
];

describe("reading handicaps from hector.golf", () => {
  it("pulls id, name, handicap and bucket out of the page", () => {
    expect(parseHandicaps(HTML)).toEqual([
      { id: "jari-k", name: "Jari K", hi: 1.2, bucket: 1 },
      { id: "sami-h", name: "Sami H", hi: 5.0, bucket: 1 },
      { id: "lasse-k", name: "Lasse K", hi: 15.1, bucket: 2 },
    ]);
  });

  it("returns nothing rather than guessing when the page changes shape", () => {
    expect(parseHandicaps("<html><body><p>Coming soon</p></body></html>")).toEqual([]);
  });

  it("reports only what actually moved", () => {
    const { changes } = diffHandicaps(field, parseHandicaps(HTML));
    expect(changes).toEqual([
      { id: "jari-k", name: "Jari K", from: 1.5, to: 1.2 },
      { id: "lasse-k", name: "Lasse K", from: 14.8, to: 15.1 },
    ]);
  });

  it("flags players on the page that this event doesn't know about", () => {
    const { unmatched } = diffHandicaps(field.slice(0, 1), parseHandicaps(HTML));
    expect(unmatched).toEqual(["Sami H", "Lasse K"]);
  });

  it("carries bucket membership along with the handicap", () => {
    // Lasse's page says lasse-k now sits in bucket 2 with 15.1 — but pretend the app
    // still has him in bucket 1: apply must move him, and diff must say so first.
    const stale: FieldPlayer[] = [
      { id: "lasse-k", name: "Lasse K", hi: 14.8, bucket: 1 },
    ];
    const fetched = parseHandicaps(HTML).filter((p) => p.id === "lasse-k");
    expect(diffHandicaps(stale, fetched).bucketMoves).toEqual([
      { id: "lasse-k", name: "Lasse K", from: 1, to: 2 },
    ]);
    expect(applyHandicaps(stale, fetched)[0].bucket).toBe(2);
  });

  it("leaves players the page omits untouched rather than dropping them", () => {
    // Someone withdrawing upstream must not delete them from a tournament in progress.
    const partial = parseHandicaps(HTML).filter((p) => p.id === "jari-k");
    const applied = applyHandicaps(field, partial);
    expect(applied).toHaveLength(3);
    expect(applied.find((p) => p.id === "jari-k")!.hi).toBe(1.2);
    expect(applied.find((p) => p.id === "lasse-k")!.hi).toBe(14.8);
  });
});
