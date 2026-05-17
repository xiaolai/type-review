import type { Histogram, LessonPlan } from "../adaptive";
import { buildBigramStatsMap, histogramFromSteps, planLesson, Target } from "../adaptive";
import type { Filter, Passage } from "../corpus";
import { generatePlainWords, generatePseudoWords, makePassage } from "../corpus";
import { computeLiveMetrics, computeRunMetrics } from "../metrics";
import type { Feedback } from "../typing";
import { TextInput } from "../typing";
import { buildAlphabet } from "./alphabet";
import type {
  Mode,
  PassageLength,
  Profile,
  ProfileSettings,
  RunResult,
  SessionDeps,
  SessionSnapshot,
  TestMode,
} from "./types";

/**
 * Maximum number of past runs the session keeps in profile history. The cap
 * bounds key-stats rebuild time, save payload size, and adaptive replay cost.
 * Older runs are dropped on completion; new run `index` values stay monotonic.
 */
export const MAX_HISTORY = 500;

/**
 * Upper-bound WPM used when sizing the text for a time-mode benchmark
 * run. A typist who can sustain more than this is rare; the buffer
 * factor below absorbs any short bursts.
 */
const TIME_MODE_MAX_WPM = 250;
/** Safety factor on the time-mode word count — covers variance and bursts. */
const TIME_MODE_BUFFER = 2;
/** Hard cap so a 5-minute test doesn't generate a megabyte of text. */
const TIME_MODE_MAX_WORDS = 10_000;

/**
 * How many words to generate for a time-mode benchmark of `durationSec`
 * seconds. Sized so even a {@link TIME_MODE_MAX_WPM}-WPM typist runs
 * out of clock before they run out of text.
 */
function timeModeWordBudget(durationSec: number): number {
  const needed = Math.ceil((durationSec * TIME_MODE_MAX_WPM) / 60);
  return Math.min(TIME_MODE_MAX_WORDS, needed * TIME_MODE_BUFFER);
}

/**
 * Drop UTF-16 surrogate-pair characters (emoji, non-BMP CJK) from a
 * string. TextInput indexes by code unit and refuses non-BMP input;
 * stripping here lets custom-text paste tolerate stray emoji instead
 * of rejecting the entire passage.
 */
function stripSurrogates(s: string): string {
  return s.replace(/[\uD800-\uDFFF]/g, "");
}

/**
 * Orchestrates one practice run at a time: builds the lesson plan from the
 * profile's history, sources the text, drives a TextInput, and on completion
 * records a RunResult back into the profile.
 *
 * Every run — adaptive or benchmark — produces a per-key histogram and feeds
 * the profile, so even benchmark runs sharpen the adaptive picture.
 */
export class Session {
  private readonly _profile: Profile;
  private readonly now: () => number;
  private readonly adaptiveSource: (
    filter: Filter,
    wordCount: number,
    options: { passageLength: PassageLength },
  ) => Passage;
  private readonly benchmarkSource: (
    wordCount: number,
    options: {
      includeNumbers: boolean;
      includePunctuation: boolean;
      passageLength: PassageLength;
      testMode: TestMode;
    },
  ) => Passage;
  private readonly onResult: ((result: RunResult, profile: Profile) => void) | undefined;

  private textInput: TextInput | null = null;
  private passage: Passage | null = null;
  private plan: LessonPlan | null = null;
  private lastResult: RunResult | null = null;
  /**
   * Mode of the active run, captured at `start()`. May lag
   * `settings.mode` until the next `start()` — `updateSettings` does
   * call `start()` immediately, so in practice this only diverges
   * across the brief window between a profile being mutated and the
   * next run beginning.
   */
  private activeMode: Mode = "adaptive";
  /**
   * Latched on the keystroke that ends the run, cleared by `start()`.
   * Without this, time-mode completion would re-fire on every later
   * keystroke (TextInput.completed tracks cursor position, not the
   * timer), each one recording another `RunResult`. See audit H1.
   */
  private runCompleted = false;

  constructor(profile: Profile, deps: SessionDeps = {}) {
    this._profile = profile;
    this.now = deps.now ?? Date.now;
    const rng = deps.rng ?? Math.random;
    // Default adaptive source ignores `passageLength` — pseudo-words
    // honour `wordCount` directly; the bucket only matters for adapters
    // pulling from a corpus.
    this.adaptiveSource =
      deps.adaptiveSource ??
      ((filter, wordCount) => generatePseudoWords(filter, { wordCount, rng }));
    this.benchmarkSource =
      deps.benchmarkSource ??
      ((wordCount, opts) =>
        generatePlainWords({
          wordCount,
          rng,
          includeNumbers: opts.includeNumbers,
          includePunctuation: opts.includePunctuation,
        }));
    this.onResult = deps.onResult;
    this.start();
  }

  get profile(): Profile {
    return this._profile;
  }

  /** Builds the lesson plan, sources fresh text, and resets the typing state. */
  start(): void {
    const {
      mode,
      wordCount,
      stopOnError,
      noBackspace,
      testMode,
      testDurationSec,
      includeNumbers,
      includePunctuation,
      passageLength,
    } = this._profile.settings;
    this.lastResult = null;
    this.runCompleted = false;
    this.activeMode = mode;

    if (mode === "adaptive") {
      this.plan = this.buildPlan();
      const filter: Filter = {
        allowed: this.plan.included,
        focus: this.plan.focus,
      };
      this.passage = this.adaptiveSource(filter, wordCount, { passageLength });
    } else {
      this.plan = null;
      this.passage =
        testMode === "time"
          ? this.benchmarkSource(timeModeWordBudget(testDurationSec), {
              includeNumbers,
              includePunctuation,
              passageLength,
              testMode,
            })
          : this.benchmarkSource(wordCount, {
              includeNumbers,
              includePunctuation,
              passageLength,
              testMode,
            });
    }

    this.textInput = new TextInput(this.passage.text, { stopOnError, noBackspace });
  }

  /** Restarts the current run with freshly sourced text. */
  restart(): void {
    this.start();
  }

  /**
   * Run-once with a caller-supplied passage. Used by the inline
   * "custom text" affordance on Practice — the user pastes a paragraph
   * and runs it without saving anything to the Library. The passage is
   * NOT persisted; next start() goes back to the corpus pipeline.
   */
  startWithText(text: string): void {
    // TextInput indexes by UTF-16 code units and rejects surrogate-pair
    // characters (non-BMP — emoji, supplementary CJK) to avoid cursor /
    // glyph desync. Pasted prose can easily contain emoji, so strip them
    // here instead of letting TextInput throw and crashing the run. The
    // alternative — refusing the whole paste — punishes the user for one
    // emoji at the end of a paragraph.
    const cleaned = stripSurrogates(text).trim();
    if (cleaned.length === 0) return;
    this.lastResult = null;
    this.runCompleted = false;
    this.activeMode = this._profile.settings.mode;
    this.plan = null;
    // Synthetic passage id — `custom:` prefix means the source
    // classifier (channelOf) buckets it as "unknown" which is fine
    // for one-off, untracked text.
    this.passage = makePassage(`custom:${this.now()}`, cleaned);
    this.textInput = new TextInput(cleaned, {
      stopOnError: this._profile.settings.stopOnError,
      noBackspace: this._profile.settings.noBackspace,
    });
  }

  /** Feeds one typed character. Records a RunResult on the transition to completion. */
  input(char: string, timeStamp: number): Feedback {
    const textInput = this.requireRun();
    if (this.runCompleted) {
      // Run is already over (cursor exhausted, timer expired, or earlier
      // call already latched it). Reject further input so we cannot
      // record a duplicate RunResult.
      return "completed";
    }
    let feedback = textInput.appendChar(char, timeStamp);
    // Time-mode benchmark completion: once active typing time crosses
    // the configured duration, treat the run as completed regardless of
    // whether the (intentionally over-long) passage was exhausted.
    if (
      feedback === "running" &&
      this.activeMode === "benchmark" &&
      this._profile.settings.testMode === "time" &&
      textInput.elapsedMs >= this._profile.settings.testDurationSec * 1000
    ) {
      feedback = "completed";
    }
    if (feedback === "completed") {
      this.runCompleted = true;
      this.recordResult();
    }
    return feedback;
  }

  backspace(): void {
    this.requireRun().backspace();
  }

  /**
   * Replaces profile settings and immediately restarts so the active run
   * reflects the change. The caller MUST pass a fully-validated settings
   * object (e.g. via `validateSettings` from `io/persistence`) — this is the
   * single supported write path from the UI into engine state. No `Object.assign`,
   * no extra keys, no partial updates.
   */
  updateSettings(next: ProfileSettings): void {
    this._profile.settings = next;
    this.start();
  }

  snapshot(): SessionSnapshot {
    const textInput = this.requireRun();
    const typing = textInput.snapshot();
    const elapsedMs = textInput.elapsedMs;
    const { testMode, testDurationSec } = this._profile.settings;
    const remainingSec =
      testMode === "time" && this.activeMode === "benchmark"
        ? Math.max(0, testDurationSec - elapsedMs / 1000)
        : null;
    return {
      mode: this.activeMode,
      typing,
      liveMetrics: computeLiveMetrics({
        steps: textInput.steps,
        statuses: typing.statuses,
        durationMs: elapsedMs,
      }),
      elapsedMs,
      remainingSec,
      plan: this.plan,
      lastResult: this.lastResult,
    };
  }

  private requireRun(): TextInput {
    if (this.textInput === null) {
      throw new Error("no active run — call start() first");
    }
    return this.textInput;
  }

  private buildPlan(): LessonPlan {
    const histograms: Histogram[] = this._profile.results.map((result) => result.histogram);
    const bigramStats = buildBigramStatsMap(histograms);
    const target = new Target(this._profile.settings.targetWpm);
    const alphabet = buildAlphabet(this._profile.settings);
    return planLesson(alphabet, bigramStats, target, this._profile.settings.adaptive);
  }

  private recordResult(): void {
    const textInput = this.requireRun();
    if (this.passage === null) {
      throw new Error("run completed without a passage");
    }
    const snapshot = textInput.snapshot();
    const results = this._profile.results;
    // Monotonic index — survives history trimming so result identifiers never reused.
    const lastIndex = results[results.length - 1]?.index ?? -1;
    const result: RunResult = {
      index: lastIndex + 1,
      mode: this.activeMode,
      timestamp: this.now(),
      passageId: this.passage.id,
      text: this.passage.text,
      metrics: computeRunMetrics({
        steps: textInput.steps,
        statuses: snapshot.statuses,
        durationMs: textInput.elapsedMs,
      }),
      histogram: histogramFromSteps(textInput.steps),
    };
    results.push(result);
    if (results.length > MAX_HISTORY) {
      results.splice(0, results.length - MAX_HISTORY);
    }
    this.lastResult = result;
    this.onResult?.(result, this._profile);
  }
}
