import { describe, expect, it } from "vitest";
import { initials, shortNames } from "./initials";

describe("initials", () => {
  it("uses one letter when the pair's first letters differ", () => {
    expect(initials(["Olli A", "Jarkko K"])).toEqual(["O", "J"]);
  });
  it("adds the surname initial when they clash", () => {
    expect(initials(["Olli A", "Olli V"])).toEqual(["OA", "OV"]);
    expect(initials(["Toni K", "Toni M"])).toEqual(["TK", "TM"]);
    expect(initials(["Lasse K", "Lassi K"])).toEqual(["LK", "LK"]);
  });
});

describe("shortNames", () => {
  it("uses first names unless two are the same", () => {
    expect(shortNames(["Olli A", "Jarkko K"])).toEqual(["Olli", "Jarkko"]);
    expect(shortNames(["Olli A", "Olli V"])).toEqual(["Olli A", "Olli V"]);
    expect(shortNames(["Lasse K", "Lassi K"])).toEqual(["Lasse", "Lassi"]);
  });
});
