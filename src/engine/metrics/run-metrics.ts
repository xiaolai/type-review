import type { CharStatus, Step } from "../typing/types";
import { binBySecond } from "./binning";
import { CHARS_PER_WORD, MS_PER_MINUTE } from "./constants";
import { kogasa, mean, roundTo2, stdDev } from "./math";

export interface RunMetrics {
  /** WPM counting only correctly-typed final characters. */
  netWpm: number;
  /** WPM counting every keystroke regardless of correctness. */
  rawWpm: number;
  /** Percentage of keystrokes that were correct, 0-100. */
  accuracy: number;
  /** Evenness of typing speed across the run, 0-100. */
  consistency: number;
  /**
   * Standard deviation of per-second net WPM (rounded to 1 decimal place).
   * Drives the `±X` shown next to net WPM on Results. 0 when the run was
   * too short to produce more than one bin.
   */
  wpmStdDev: number;
  /**
   * Per-second raw WPM samples — the same series consistency and
   * wpmStdDev are computed from. Drives the in-run WPM graph on
   * Results. Empty for runs too short to produce a single full bin.
   */
  wpmSeries: number[];
  correctChars: number;
  incorrectChars: number;
  durationMs: number;
}

export interface RunMetricsInput {
  steps: readonly Step[];
  statuses: readonly CharStatus[];
  /** Run duration in milliseconds, typically `TextInput.elapsedMs`. */
  durationMs: number;
}

interface BaseCounts {
  correctChars: number;
  incorrectChars: number;
  correctSteps: number;
}

function countBase(input: RunMetricsInput): BaseCounts {
  let correctChars = 0;
  let incorrectChars = 0;
  for (const status of input.statuses) {
    if (status === "correct") {
      correctChars++;
    } else if (status === "incorrect") {
      incorrectChars++;
    }
  }
  let correctSteps = 0;
  for (const step of input.steps) {
    if (!step.typo) {
      correctSteps++;
    }
  }
  return { correctChars, incorrectChars, correctSteps };
}

/**
 * Computes consistency from the per-second binning. Exported separately for
 * tests and any future visualisation that wants just the consistency number.
 */
export function computeConsistency(steps: readonly Step[]): number {
  const perSecondRaw = binBySecond(steps).map((bin) => bin.rawWpm);
  const m = mean(perSecondRaw);
  if (perSecondRaw.length === 0 || m <= 0) {
    return 0;
  }
  return roundTo2(kogasa(stdDev(perSecondRaw) / m));
}

/**
 * Standard deviation of per-second raw WPM bins. Surfaces as the `±X` on
 * the Results screen — gives the user a sense of how steady their pace
 * was, in WPM units. We use raw WPM (the same series consistency uses)
 * rather than net so the value is a pure variance metric on speed; net
 * would conflate accuracy effects into the spread.
 */
export function computeWpmStdDev(steps: readonly Step[]): number {
  const perSecond = binBySecond(steps).map((bin) => bin.rawWpm);
  if (perSecond.length < 2) return 0;
  return Math.round(stdDev(perSecond) * 10) / 10;
}

function buildMetrics(
  input: RunMetricsInput,
  counts: BaseCounts,
  consistency: number,
  wpmStdDev: number,
  wpmSeries: number[],
): RunMetrics {
  const minutes = input.durationMs / MS_PER_MINUTE;
  const netWpm = minutes > 0 ? roundTo2(counts.correctChars / CHARS_PER_WORD / minutes) : 0;
  const rawWpm = minutes > 0 ? roundTo2(input.steps.length / CHARS_PER_WORD / minutes) : 0;
  const accuracy =
    input.steps.length > 0 ? roundTo2((counts.correctSteps / input.steps.length) * 100) : 100;
  return {
    netWpm,
    rawWpm,
    accuracy,
    consistency,
    wpmStdDev,
    wpmSeries,
    correctChars: counts.correctChars,
    incorrectChars: counts.incorrectChars,
    durationMs: input.durationMs,
  };
}

/**
 * Cheap subset of run metrics for live in-progress display: skips per-second
 * binning and the kogasa consistency calculation, which would otherwise run
 * on every RAF frame. `consistency` is always 0 in the live shape; the full
 * `computeRunMetrics` is what records the completed RunResult.
 */
export function computeLiveMetrics(input: RunMetricsInput): RunMetrics {
  return buildMetrics(input, countBase(input), 0, 0, []);
}

/**
 * Computes the headline metrics for a completed run.
 *
 * Character counts (net WPM, correct/incorrect) come from the final text
 * `statuses`; keystroke-based figures (raw WPM, accuracy, consistency) come
 * from the append-only `steps` log, so corrections and retries are reflected
 * in accuracy rather than silently erased.
 */
export function computeRunMetrics(input: RunMetricsInput): RunMetrics {
  const wpmSeries = binBySecond(input.steps).map((bin) => bin.rawWpm);
  return buildMetrics(
    input,
    countBase(input),
    computeConsistency(input.steps),
    computeWpmStdDev(input.steps),
    wpmSeries,
  );
}
