import { describe, expect, it } from "vitest";
import { mulberry32 } from "../rng";
import { COMMON_WORDS, generatePlainWords } from "./plain-words";

describe("generatePlainWords", () => {
  it("produces the requested number of words from the list", () => {
    const passage = generatePlainWords({ wordCount: 12, rng: mulberry32(1) });
    const words = passage.text.split(" ");
    expect(words).toHaveLength(12);
    for (const word of words) {
      expect(COMMON_WORDS).toContain(word);
    }
  });

  it("is deterministic for a given seed", () => {
    const a = generatePlainWords({ wordCount: 20, rng: mulberry32(55) });
    const b = generatePlainWords({ wordCount: 20, rng: mulberry32(55) });
    expect(a.text).toBe(b.text);
  });

  it("accepts a custom word list", () => {
    const passage = generatePlainWords({
      wordCount: 4,
      wordList: ["alpha", "beta"],
      rng: mulberry32(9),
    });
    for (const word of passage.text.split(" ")) {
      expect(["alpha", "beta"]).toContain(word);
    }
  });

  it("rejects an empty word list", () => {
    expect(() => generatePlainWords({ wordList: [] })).toThrow();
  });
});
