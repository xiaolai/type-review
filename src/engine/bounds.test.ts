import { describe, expect, it } from "vitest";
import { inBound, SETTINGS_BOUNDS, UI_BOUNDS } from "./bounds";

describe("inBound", () => {
  it("accepts a value in range", () => {
    expect(inBound(50, SETTINGS_BOUNDS.targetWpm)).toBe(true);
  });

  it("rejects values outside the range", () => {
    expect(inBound(0, SETTINGS_BOUNDS.targetWpm)).toBe(false);
    expect(inBound(1000, SETTINGS_BOUNDS.targetWpm)).toBe(false);
  });

  it("rejects NaN, Infinity, and non-numbers", () => {
    expect(inBound(Number.NaN, SETTINGS_BOUNDS.targetWpm)).toBe(false);
    expect(inBound(Number.POSITIVE_INFINITY, SETTINGS_BOUNDS.targetWpm)).toBe(false);
    expect(inBound("50", SETTINGS_BOUNDS.targetWpm)).toBe(false);
    expect(inBound(null, SETTINGS_BOUNDS.targetWpm)).toBe(false);
  });

  it("rejects non-integers for an integer bound", () => {
    expect(inBound(1.5, SETTINGS_BOUNDS.wordCount)).toBe(false);
    expect(inBound(30, SETTINGS_BOUNDS.wordCount)).toBe(true);
  });

  it("accepts non-integers for a non-integer bound", () => {
    expect(inBound(0.5, SETTINGS_BOUNDS.alphabetExpansion)).toBe(true);
  });
});

describe("UI_BOUNDS ⊆ SETTINGS_BOUNDS", () => {
  // This is the invariant the audit (H15) flagged. The Settings UI clamps user
  // input to UI_BOUNDS; persistence validates against SETTINGS_BOUNDS. If UI
  // ranges ever drift outside the storage ranges, a value the user just saved
  // would be silently rewritten on the next load.
  const keys = ["targetWpm", "wordCount", "minAlphabetSize", "alphabetExpansion"] as const;

  for (const key of keys) {
    it(`${key}: UI low (${UI_BOUNDS[key].lo}) >= SETTINGS low (${SETTINGS_BOUNDS[key].lo})`, () => {
      expect(UI_BOUNDS[key].lo).toBeGreaterThanOrEqual(SETTINGS_BOUNDS[key].lo);
    });
    it(`${key}: UI high (${UI_BOUNDS[key].hi}) <= SETTINGS high (${SETTINGS_BOUNDS[key].hi})`, () => {
      expect(UI_BOUNDS[key].hi).toBeLessThanOrEqual(SETTINGS_BOUNDS[key].hi);
    });
    it(`${key}: UI integer flag must not be stricter than SETTINGS`, () => {
      // If SETTINGS allows non-integers (integer: false) the UI may pick either;
      // if SETTINGS requires integers (integer: true) the UI MUST too.
      if (SETTINGS_BOUNDS[key].integer) {
        expect(UI_BOUNDS[key].integer).toBe(true);
      }
    });
  }
});
