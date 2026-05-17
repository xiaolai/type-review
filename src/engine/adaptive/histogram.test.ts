import { describe, expect, it } from "vitest";
import { TextInput } from "../typing/text-input";
import { histogramFromSteps } from "./histogram";

describe("histogramFromSteps (per-bigram)", () => {
  it("counts hits per bigram (transition between consecutive expected chars)", () => {
    const ti = new TextInput("aba");
    ti.appendChar("a", 1000);
    ti.appendChar("b", 1100);
    ti.appendChar("a", 1200);
    const h = histogramFromSteps(ti.steps);
    // Bigrams from "aba" are "ab" and "ba".
    expect(h.get("ab")?.hitCount).toBe(1);
    expect(h.get("ba")?.hitCount).toBe(1);
    expect(h.size).toBe(2);
  });

  it("returns an empty histogram when there are fewer than 2 steps", () => {
    const ti = new TextInput("a");
    ti.appendChar("a", 1000);
    expect(histogramFromSteps(ti.steps).size).toBe(0);
  });

  it("attributes a typo to the bigram of expected characters, not the typed one", () => {
    const ti = new TextInput("ab");
    ti.appendChar("a", 1000);
    ti.appendChar("x", 1200); // expected 'b', typed 'x'
    const h = histogramFromSteps(ti.steps);
    // Bigram is "ab" (the EXPECTED transition), not "ax".
    expect(h.get("ab")).toEqual({ hitCount: 1, missCount: 1, timeToType: 0 });
    expect(h.has("ax")).toBe(false);
  });

  it("averages plausible timings of the second character and excludes outliers", () => {
    const ti = new TextInput("aaaa");
    ti.appendChar("a", 1000); // first step: no preceding bigram
    ti.appendChar("a", 1200); // "aa" #1: 200ms timing — counted
    ti.appendChar("a", 1400); // "aa" #2: 200ms — counted
    ti.appendChar("a", 1405); // "aa" #3: 5ms — outlier, hit but not timed
    const h = histogramFromSteps(ti.steps);
    expect(h.get("aa")?.hitCount).toBe(3);
    expect(h.get("aa")?.timeToType).toBe(200);
  });

  it("returns timeToType 0 when no plausible bigram timings exist", () => {
    const ti = new TextInput("ab");
    ti.appendChar("a", 1000);
    ti.appendChar("b", 1005); // 5 ms — outlier, untimed
    const h = histogramFromSteps(ti.steps);
    expect(h.get("ab")?.timeToType).toBe(0);
  });

  it("accumulates multiple instances of the same bigram", () => {
    const ti = new TextInput("ababab");
    ti.appendChar("a", 1000);
    ti.appendChar("b", 1200);
    ti.appendChar("a", 1400);
    ti.appendChar("b", 1600);
    ti.appendChar("a", 1800);
    ti.appendChar("b", 2000);
    const h = histogramFromSteps(ti.steps);
    // "ab" appears 3 times, "ba" appears 2 times.
    expect(h.get("ab")?.hitCount).toBe(3);
    expect(h.get("ba")?.hitCount).toBe(2);
  });
});
