import { describe, expect, it } from "vitest";
import { buildBigramStatsMap } from "./key-stats";
import { DEFAULT_ADAPTIVE_SETTINGS, DEFAULT_ALPHABET, planLesson } from "./lesson";
import { Target } from "./target";
import type { BigramHit, Histogram } from "./types";

const TARGET = new Target(50); // 240 ms/char; mastery requires timeToType <= 240

function hit(timeToType: number): BigramHit {
  return { hitCount: 5, missCount: 0, timeToType };
}

/**
 * Build a Histogram where each named letter is the SECOND char of one
 * bigram with the given timing. The first char is `_` (not in the alphabet)
 * so the bigram never qualifies for the planner's `weakBigrams` output —
 * keeps these tests focused on per-letter unlocking behaviour.
 */
function histogramFor(timings: Record<string, number>): Histogram {
  return new Map(Object.entries(timings).map(([letter, ms]) => [`_${letter}`, hit(ms)]));
}

/** Convenience: build the bigram-stats map from a single run's letter timings. */
function statsWith(timings: Record<string, number>) {
  return buildBigramStatsMap([histogramFor(timings)]);
}

describe("planLesson", () => {
  it("starts a fresh user with exactly the minimum alphabet", () => {
    const plan = planLesson(DEFAULT_ALPHABET, new Map(), TARGET);
    expect(plan.included).toEqual(["e", "t", "a", "o", "i", "n"]);
    // Nothing is forced at the default expansion of 0.
    expect(plan.keys.every((k) => !k.forced)).toBe(true);
  });

  it("focuses the first unpractised letter for a fresh user", () => {
    const plan = planLesson(DEFAULT_ALPHABET, new Map(), TARGET);
    expect(plan.focus).toBe("e");
  });

  it("unlocks exactly one new letter once every included letter is mastered", () => {
    // All six starter letters typed comfortably above target.
    const stats = statsWith({
      e: 150,
      t: 150,
      a: 150,
      o: 150,
      i: 150,
      n: 150,
    });
    const plan = planLesson(DEFAULT_ALPHABET, stats, TARGET);
    expect(plan.included).toEqual(["e", "t", "a", "o", "i", "n", "s"]);
    // The freshly unlocked letter is forced and becomes the focus.
    expect(plan.focus).toBe("s");
    expect(plan.keys.find((k) => k.letter === "s")?.forced).toBe(true);
  });

  it("does not unlock while any included letter is below target", () => {
    const stats = statsWith({
      e: 150,
      t: 150,
      a: 150,
      o: 150,
      i: 150,
      n: 600, // 'n' is slow
    });
    const plan = planLesson(DEFAULT_ALPHABET, stats, TARGET);
    expect(plan.included).toHaveLength(6);
    // The weakest included letter is drilled.
    expect(plan.focus).toBe("n");
  });

  it("picks the single weakest included letter as focus", () => {
    const stats = statsWith({
      e: 150,
      t: 300,
      a: 150,
      o: 500,
      i: 150,
      n: 400,
    });
    const plan = planLesson(DEFAULT_ALPHABET, stats, TARGET);
    expect(plan.focus).toBe("o"); // 500 ms is slowest
  });

  it("expands the whole alphabet at expansion 1", () => {
    const plan = planLesson(DEFAULT_ALPHABET, new Map(), TARGET, {
      ...DEFAULT_ADAPTIVE_SETTINGS,
      alphabetExpansion: 1,
    });
    expect(plan.included).toEqual([...DEFAULT_ALPHABET]);
  });

  it("keeps a mastered letter included even after it later slows down", () => {
    // 'e' was once fast (best stays high-confidence) but two later runs are slow.
    const runs: Histogram[] = [
      new Map([["_e", hit(150)]]),
      new Map([["_e", hit(900)]]),
      new Map([["_e", hit(900)]]),
    ];
    const stats = buildBigramStatsMap(runs);
    const plan = planLesson(DEFAULT_ALPHABET, stats, TARGET);
    const e = plan.keys.find((k) => k.letter === "e");
    expect(e?.included).toBe(true);
    // Unlock uses best-ever confidence (still mastered)...
    expect(e?.bestConfidence).toBeGreaterThanOrEqual(1);
    // ...but current confidence has dropped, so 'e' is eligible to be focused again.
    expect(e?.confidence).toBeLessThan(1);
  });

  it("surfaces weak bigrams whose both characters are included", () => {
    // Default settings → included set is {e, t, a, o, i, n}. We use bigrams
    // both inside and outside that set to verify the filter.
    const histogram: Histogram = new Map([
      ["te", hit(800)], // t + e both in → eligible
      ["an", hit(700)], // a + n both in → eligible
      ["qz", hit(900)], // q + z NOT in default alphabet → excluded
      ["hr", hit(1000)], // h + r NOT in → excluded
    ]);
    const stats = buildBigramStatsMap([histogram]);
    const plan = planLesson(DEFAULT_ALPHABET, stats, TARGET);
    const weak = plan.weakBigrams.map((w) => w.bigram);
    expect(weak).toContain("te");
    expect(weak).toContain("an");
    expect(weak).not.toContain("qz");
    expect(weak).not.toContain("hr");
    // Sorted ascending by confidence. confidence = targetTime / EMA, so a
    // SLOWER bigram has LOWER confidence. "te" (800 ms) is slower than
    // "an" (700 ms) → "te" has the worse confidence → comes first.
    expect(plan.weakBigrams[0]?.bigram).toBe("te");
  });
});
