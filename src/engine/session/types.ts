import type { AdaptiveSettings, Histogram, LessonPlan } from "../adaptive";
import type { Filter, Passage } from "../corpus";
import type { RunMetrics } from "../metrics";
import type { TypingSnapshot } from "../typing";

export type Mode = "adaptive" | "benchmark";

/** A completed run — the persisted source of truth; per-key stats are derived from these. */
export interface RunResult {
  /** Monotonic index within the profile's history. */
  index: number;
  mode: Mode;
  /** Epoch milliseconds when the run completed. */
  timestamp: number;
  passageId: string;
  text: string;
  metrics: RunMetrics;
  /** Per-key breakdown — feeds the adaptive engine on the next run. */
  histogram: Histogram;
}

/**
 * What ends a benchmark run.
 *  - `"words"`  — finish when the cursor reaches the end of the
 *                 passage (the original behaviour; `wordCount` controls
 *                 passage length).
 *  - `"time"`   — finish when elapsed active typing time exceeds
 *                 `testDurationSec`. The passage is generated long
 *                 enough that even the fastest typists won't run out.
 */
export type TestMode = "words" | "time";

/**
 * Difficulty / length filter for corpus-backed sources (quotes, user
 * library). Drives the `wantedChars` hint the adapter feeds the corpus
 * pick. `"any"` keeps the historical behaviour (length follows
 * `wordCount`).
 *  - `"short"`  — ~150 chars (≈ a tweet)
 *  - `"medium"` — ~400 chars (≈ a paragraph)
 *  - `"long"`   — ~800 chars (≈ several paragraphs)
 */
export type PassageLength = "any" | "short" | "medium" | "long";

export interface ProfileSettings {
  mode: Mode;
  /** Target speed in WPM — the bar a key must clear to count as mastered. */
  targetWpm: number;
  adaptive: AdaptiveSettings;
  /** Words per run, for both benchmark text and pseudo-word generation. */
  wordCount: number;
  /** Benchmark-mode completion criterion. Default `"words"`. */
  testMode: TestMode;
  /** Duration in seconds when `testMode === "time"`. Default 30. */
  testDurationSec: number;
  /** When true, a mistyped key does not advance the cursor. */
  stopOnError: boolean;
  /**
   * Confidence mode — when true, the backspace key is ignored. Trains
   * commit-and-move precision; mistakes can't be corrected mid-run.
   */
  noBackspace: boolean;
  /** Preferred passage length when pulling from quote / user corpus. */
  passageLength: PassageLength;
  /** Extend the adaptive alphabet with `0-9` so digits are tracked + drilled. */
  includeNumbers: boolean;
  /**
   * Extend the adaptive alphabet with common ASCII punctuation
   * (`. , ! ? ; : ' " -`). Adaptive corpus passages must then contain only
   * those punctuation marks; pseudo-words can interleave them too.
   */
  includePunctuation: boolean;
}

export interface Profile {
  settings: ProfileSettings;
  /** Completed runs, oldest first. */
  results: RunResult[];
}

export interface SessionSnapshot {
  mode: Mode;
  typing: TypingSnapshot;
  /** Metrics computed from the run so far. */
  liveMetrics: RunMetrics;
  /** Active typing time so far in milliseconds (excludes long pauses). */
  elapsedMs: number;
  /**
   * Time mode only: remaining seconds before the run auto-completes.
   * Null in word mode (the cursor reaching the passage end is what
   * finishes the run; no timer to display). The Practice UI shows
   * this as a `30 →` style countdown.
   */
  remainingSec: number | null;
  /** The active lesson plan (adaptive mode) — drives the keyboard heatmap. null in benchmark mode. */
  plan: LessonPlan | null;
  /** The just-completed run, or null while a run is in progress. */
  lastResult: RunResult | null;
}

export interface SessionDeps {
  /**
   * Adaptive text source: given a Filter, the run's word count and the
   * preferred passage length, returns a Passage. `passageLength` lets
   * adapters override the length hint with a fixed bucket (short /
   * medium / long) when the user has asked for one.
   */
  adaptiveSource?: (
    filter: Filter,
    wordCount: number,
    options: { passageLength: PassageLength },
  ) => Passage;
  /**
   * Benchmark text source: given a word count and the toggles for
   * numbers/punctuation, returns a Passage. The toggles are passed
   * through so adapters can either honour them in-place (the default
   * generator) or skip a quote pick that wouldn't match.
   */
  benchmarkSource?: (
    wordCount: number,
    options: {
      includeNumbers: boolean;
      includePunctuation: boolean;
      passageLength: PassageLength;
      /**
       * Time-mode runs need enough text to outlast the timer regardless
       * of whether the requested length matches any curated quote in
       * the corpus. Adapters MUST honour this by either picking a long
       * enough entry or falling back to a generator.
       */
      testMode: TestMode;
    },
  ) => Passage;
  /** Wall clock in epoch milliseconds. Defaults to Date.now. */
  now?: () => number;
  /** RNG in [0, 1) for the default text sources. Defaults to Math.random. */
  rng?: () => number;
  /** Called once each time a run completes, after it is appended to the profile. */
  onResult?: (result: RunResult, profile: Profile) => void;
}
