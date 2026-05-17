import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { TextInput } from "../typing/text-input";
import type { Step } from "../typing/types";
import { roundTo2 } from "./math";
import { computeConsistency, computeLiveMetrics, computeRunMetrics } from "./run-metrics";

/** Types `text` into a fresh TextInput, one char per `intervalMs`. */
function typeRun(text: string, startMs = 1000, intervalMs = 100): TextInput {
  const ti = new TextInput(text);
  let t = startMs;
  for (const ch of text) {
    ti.appendChar(ch, t);
    t += intervalMs;
  }
  return ti;
}

describe("computeRunMetrics", () => {
  it("computes a clean run", () => {
    const ti = typeRun("abcde");
    const m = computeRunMetrics({
      steps: ti.steps,
      statuses: ti.snapshot().statuses,
      durationMs: ti.elapsedMs,
    });
    expect(m.durationMs).toBe(400);
    expect(m.correctChars).toBe(5);
    expect(m.incorrectChars).toBe(0);
    expect(m.netWpm).toBe(150);
    expect(m.rawWpm).toBe(150);
    expect(m.accuracy).toBe(100);
    expect(m.consistency).toBe(100);
  });

  it("counts corrections against accuracy but not against final chars", () => {
    const ti = new TextInput("ab");
    ti.appendChar("x", 1000);
    ti.backspace();
    ti.appendChar("a", 1100);
    ti.appendChar("b", 1200);
    const m = computeRunMetrics({
      steps: ti.steps,
      statuses: ti.snapshot().statuses,
      durationMs: ti.elapsedMs,
    });
    expect(m.correctChars).toBe(2);
    expect(m.incorrectChars).toBe(0);
    expect(m.accuracy).toBe(roundTo2((2 / 3) * 100));
  });

  it("net WPM ignores uncorrected wrong characters, raw WPM does not", () => {
    const ti = new TextInput("ab");
    ti.appendChar("x", 1000);
    ti.appendChar("b", 1100);
    const m = computeRunMetrics({
      steps: ti.steps,
      statuses: ti.snapshot().statuses,
      durationMs: ti.elapsedMs,
    });
    expect(m.correctChars).toBe(1);
    expect(m.incorrectChars).toBe(1);
    expect(m.netWpm).toBeLessThan(m.rawWpm);
  });

  it("guards against zero duration and zero keystrokes", () => {
    const m = computeRunMetrics({ steps: [], statuses: [], durationMs: 0 });
    expect(m).toMatchObject({
      netWpm: 0,
      rawWpm: 0,
      accuracy: 100,
      consistency: 0,
    });
  });

  it("penalises uneven typing speed in consistency", () => {
    const steady = typeRun("a".repeat(30), 1000, 100);
    const bursty = new TextInput("a".repeat(30));
    let t = 1000;
    for (let i = 0; i < 30; i++) {
      bursty.appendChar("a", t);
      t += i % 2 === 0 ? 20 : 380;
    }
    const steadyM = computeRunMetrics({
      steps: steady.steps,
      statuses: steady.snapshot().statuses,
      durationMs: steady.elapsedMs,
    });
    const burstyM = computeRunMetrics({
      steps: bursty.steps,
      statuses: bursty.snapshot().statuses,
      durationMs: bursty.elapsedMs,
    });
    expect(steadyM.consistency).toBeGreaterThan(burstyM.consistency);
  });
});

describe("computeLiveMetrics", () => {
  it("returns the same WPM/accuracy as computeRunMetrics but skips consistency", () => {
    const ti = typeRun("abcde");
    const live = computeLiveMetrics({
      steps: ti.steps,
      statuses: ti.snapshot().statuses,
      durationMs: ti.elapsedMs,
    });
    const full = computeRunMetrics({
      steps: ti.steps,
      statuses: ti.snapshot().statuses,
      durationMs: ti.elapsedMs,
    });
    expect(live.netWpm).toBe(full.netWpm);
    expect(live.accuracy).toBe(full.accuracy);
    // The whole point of computeLiveMetrics: consistency is always 0.
    expect(live.consistency).toBe(0);
  });
});

describe("computeConsistency", () => {
  it("is 100 for a perfectly steady single-bucket run", () => {
    const ti = typeRun("abcde");
    expect(computeConsistency(ti.steps)).toBe(100);
  });

  it("is 0 for an empty step list", () => {
    expect(computeConsistency([])).toBe(0);
  });
});

describe("computeRunMetrics properties", () => {
  const stepsGen = fc.array(fc.boolean(), { maxLength: 40 }).map((typos): Step[] =>
    typos.map((typo, i) => ({
      position: i,
      timeStamp: 1000 + i * 100,
      typed: "a",
      expected: "a",
      timeToType: 100,
      typo,
    })),
  );

  it("metrics stay in their declared ranges for any input", () => {
    fc.assert(
      fc.property(
        stepsGen,
        fc.array(fc.constantFrom("correct" as const, "incorrect" as const, "untyped" as const), {
          maxLength: 40,
        }),
        fc.integer({ min: 0, max: 60_000 }),
        (steps, statuses, durationMs) => {
          const m = computeRunMetrics({ steps, statuses, durationMs });
          expect(m.accuracy).toBeGreaterThanOrEqual(0);
          expect(m.accuracy).toBeLessThanOrEqual(100);
          expect(m.netWpm).toBeGreaterThanOrEqual(0);
          expect(m.rawWpm).toBeGreaterThanOrEqual(0);
          expect(m.consistency).toBeGreaterThanOrEqual(0);
          expect(m.consistency).toBeLessThanOrEqual(100);
        },
      ),
    );
  });
});
