import { describe, expect, it } from "vitest";
import {
  alphabetOf,
  type CorpusEntry,
  fitsAlphabet,
  lengthScore,
  makeEntry,
  pickWeightedByLength,
} from "./sources";

describe("alphabetOf", () => {
  it("returns lowercase letters, deduplicated", () => {
    const s = alphabetOf("The Quick Brown Fox");
    expect(Array.from(s).sort()).toEqual(
      ["b", "c", "e", "f", "h", "i", "k", "n", "o", "q", "r", "t", "u", "w", "x"].sort(),
    );
  });
  it("includes digits and punctuation but excludes whitespace", () => {
    const s = alphabetOf("abc 123, def!");
    expect(Array.from(s).sort()).toEqual(["!", ",", "1", "2", "3", "a", "b", "c", "d", "e", "f"]);
  });
  it("returns digits and punctuation for letterless input", () => {
    expect(alphabetOf("123 !? .")).toEqual(new Set(["1", "2", "3", "!", "?", "."]));
  });
});

describe("fitsAlphabet", () => {
  function entry(text: string): CorpusEntry {
    return makeEntry("test", "quote", text);
  }

  it("true when every letter in the entry is in the filter", () => {
    const filter = new Set(["a", "b", "c", "d", "e"]);
    expect(fitsAlphabet(entry("abc"), filter)).toBe(true);
    expect(fitsAlphabet(entry("a b c d e"), filter)).toBe(true);
  });
  it("false when the entry uses a letter outside the filter", () => {
    const filter = new Set(["a", "b", "c"]);
    expect(fitsAlphabet(entry("abcd"), filter)).toBe(false);
  });
  it("true when entries contain digits/punctuation absent from the filter (split semantics)", () => {
    // Split semantics: the filter only gates LETTERS. Digits and punctuation
    // in curated content always pass — the user's `includeNumbers` /
    // `includePunctuation` toggles only control drill GENERATION and
    // curriculum tracking, not whether a quote with commas is shown.
    const filter = new Set(["a", "b", "c"]);
    expect(fitsAlphabet(entry("abc,"), filter)).toBe(true);
    expect(fitsAlphabet(entry("abc1"), filter)).toBe(true);
    expect(fitsAlphabet(entry("a, b. c 1789!"), filter)).toBe(true);
  });
  it("true for entries containing only non-letter characters", () => {
    // No letters in the entry, so the filter has nothing to reject.
    const filter = new Set(["a"]);
    expect(fitsAlphabet(entry("123 !? ."), filter)).toBe(true);
  });
});

describe("lengthScore", () => {
  it("scores ratio 1.0 highest", () => {
    expect(lengthScore(100, 100)).toBeCloseTo(1, 5);
  });
  it("scores ratios below 0.5 or above 3 as zero", () => {
    expect(lengthScore(10, 100)).toBe(0);
    expect(lengthScore(400, 100)).toBe(0);
  });
  it("scores within-range ratios between 0 and 1", () => {
    const s = lengthScore(60, 100);
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1);
  });
});

describe("pickWeightedByLength", () => {
  function ent(id: string, length: number): CorpusEntry {
    return { id, kind: "quote", text: "x".repeat(length), alphabet: new Set(["x"]), length };
  }

  it("returns null on empty input", () => {
    expect(pickWeightedByLength([], 100, () => 0.5)).toBeNull();
  });
  it("returns the only candidate when there's one", () => {
    const e = ent("only", 50);
    expect(pickWeightedByLength([e], 100, () => 0.5)?.id).toBe("only");
  });
  it("biases toward length-matching candidates (rng=0 picks first weighted bucket)", () => {
    const close = ent("close", 100); // wanted=100, score≈1
    const far = ent("far", 10); // way short, score≈0 → tiny floor 0.01
    // Picked with rng=0 means we pick the first bucket; the close one has
    // a much heavier weight so it wins for almost any rng < 1.
    const picked = pickWeightedByLength([far, close], 100, () => 0.999);
    // Even the rightmost rng tail should land on `close` because its weight
    // dominates the distribution.
    expect(picked?.id).toBe("close");
  });
});

describe("makeEntry", () => {
  it("populates alphabet, length, and optional attribution", () => {
    const e = makeEntry("q-1", "quote", "Hello, World", {
      author: "Anon",
      license: "PD",
    });
    expect(e.id).toBe("q-1");
    expect(e.kind).toBe("quote");
    expect(e.text).toBe("Hello, World");
    expect(e.length).toBe(12);
    expect(Array.from(e.alphabet).sort()).toEqual([",", "d", "e", "h", "l", "o", "r", "w"]);
    expect(e.attribution?.author).toBe("Anon");
  });
  it("omits attribution when none is provided", () => {
    const e = makeEntry("p-1", "drills", "foo bar");
    expect(e.attribution).toBeUndefined();
  });
});
