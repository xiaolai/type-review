import type { Step } from "../typing/types";
import type { BigramHit, Histogram } from "./types";

/** A correct keystroke faster than this (ms) is an outlier for timing. ~300 WPM. */
const MIN_PLAUSIBLE_MS = 40;
/** A correct keystroke slower than this (ms) is an outlier for timing. */
const MAX_PLAUSIBLE_MS = 12_000;

/**
 * Aggregates a run's keystroke log into per-bigram hit/miss counts and a mean
 * time-to-type. A bigram is the transition between two consecutive expected
 * characters; its timing is the time the user took to produce the SECOND
 * character given the first.
 *
 * The very first step has no preceding character, so it does NOT contribute
 * to any bigram — the first character of a passage is unmeasured for
 * adaptive purposes. (We could fold it into a synthetic "_X" bigram but the
 * first-char warm-up effect makes that data noisy.)
 *
 * A mistyped second character increments the bigram's `missCount`; the
 * bigram is keyed by the *expected* pair so a typo against `th` counts
 * against `th` regardless of what was actually pressed.
 *
 * Outlier timings (implausibly fast or slow) still count as hits but are
 * excluded from the timing average — protects the speed estimate from
 * paste events and long pauses without hiding that the bigram was practised.
 */
export function histogramFromSteps(steps: readonly Step[]): Histogram {
  if (steps.length < 2) return new Map<string, BigramHit>();

  const acc = new Map<
    string,
    { hitCount: number; missCount: number; timeSum: number; timeCount: number }
  >();

  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1];
    const curr = steps[i];
    if (prev === undefined || curr === undefined) continue;
    // Bigrams only span *adjacent* text positions. After a backspace or a
    // stop-on-error retry, two consecutive Step entries can refer to the
    // same cursor position (or jump backwards), which would otherwise
    // produce a bogus bigram between non-neighbouring characters.
    if (curr.position !== prev.position + 1) continue;
    const bigram = `${prev.expected}${curr.expected}`;

    const entry = acc.get(bigram) ?? {
      hitCount: 0,
      missCount: 0,
      timeSum: 0,
      timeCount: 0,
    };
    entry.hitCount++;
    if (curr.typo) {
      entry.missCount++;
    } else if (curr.timeToType >= MIN_PLAUSIBLE_MS && curr.timeToType <= MAX_PLAUSIBLE_MS) {
      entry.timeSum += curr.timeToType;
      entry.timeCount++;
    }
    acc.set(bigram, entry);
  }

  const histogram = new Map<string, BigramHit>();
  for (const [bigram, entry] of acc) {
    histogram.set(bigram, {
      hitCount: entry.hitCount,
      missCount: entry.missCount,
      timeToType: entry.timeCount > 0 ? Math.round(entry.timeSum / entry.timeCount) : 0,
    });
  }
  return histogram;
}
