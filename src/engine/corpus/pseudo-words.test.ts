import { describe, expect, it } from "vitest";
import { mulberry32 } from "../rng";
import { generatePseudoWords } from "./pseudo-words";
import type { Filter } from "./types";

const ALPHABET: Filter = { allowed: ["e", "t", "a", "o", "i", "n"], focus: "n" };

describe("generatePseudoWords", () => {
  it("only uses letters from the allowed set", () => {
    const passage = generatePseudoWords(ALPHABET, {
      wordCount: 40,
      rng: mulberry32(1),
    });
    for (const ch of passage.text) {
      if (ch === " ") {
        continue;
      }
      expect(ALPHABET.allowed).toContain(ch);
    }
  });

  it("over-represents the focus letter", () => {
    const passage = generatePseudoWords(ALPHABET, {
      wordCount: 60,
      focusBias: 1,
      rng: mulberry32(7),
    });
    const words = passage.text.split(" ");
    const withFocus = words.filter((w) => w.includes("n")).length;
    // With focusBias 1 every word is seeded with the focus letter.
    expect(withFocus).toBe(words.length);
  });

  it("is deterministic for a given seed", () => {
    const a = generatePseudoWords(ALPHABET, { rng: mulberry32(99) });
    const b = generatePseudoWords(ALPHABET, { rng: mulberry32(99) });
    expect(a.text).toBe(b.text);
  });

  it("works for a minimal one-letter alphabet", () => {
    const passage = generatePseudoWords(
      { allowed: ["a"], focus: "a" },
      { wordCount: 5, rng: mulberry32(3) },
    );
    expect(passage.text).toMatch(/^[a ]+$/);
  });

  it("throws on an empty alphabet", () => {
    expect(() => generatePseudoWords({ allowed: [], focus: null })).toThrow();
  });
});
