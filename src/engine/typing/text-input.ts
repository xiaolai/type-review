import type { CharStatus, Feedback, Step, TypingSnapshot } from "./types";

/**
 * Pause cap (ms): a gap larger than this between two keystrokes is treated as
 * an "away from the keyboard" pause and excluded from elapsed-time aggregates.
 * Without this, a tab freeze (lid closed, mobile background) or a quick
 * coffee break would inflate `elapsedMs` to hours and produce nonsensical WPM
 * numbers in the saved RunResult. The same value bounds the per-key timing
 * outlier filter in `histogramFromSteps`.
 */
export const PAUSE_CAP_MS = 12_000;

export interface TextInputOptions {
  /**
   * When true, a mistyped character does not advance the cursor — the user must
   * type the correct character to proceed. When false (default), the cursor
   * advances on every keystroke and mistakes are corrected with backspace.
   */
  stopOnError?: boolean;
  /**
   * When true, `backspace()` is a no-op. Trains commit-and-move
   * precision — mistakes can't be corrected mid-run (the
   * "confidence mode" preference on the Settings page).
   */
  noBackspace?: boolean;
}

/**
 * The typing hot loop. Pure, DOM-free, framework-free: it consumes keystroke
 * events and tracks per-character state plus an append-only keystroke log.
 *
 * Characters are modeled as single-character strings, which is sufficient for
 * the Latin-script corpus this app targets.
 */
export class TextInput {
  readonly expected: string;
  private readonly stopOnError: boolean;
  private readonly noBackspace: boolean;
  private readonly _statuses: CharStatus[];
  private readonly _steps: Step[] = [];
  private _pos = 0;
  private _lastTimeStamp: number | null = null;
  /** Sum of capped inter-keystroke intervals — the "actively typing" duration. */
  private _activeMs = 0;

  constructor(expected: string, options: TextInputOptions = {}) {
    if (expected.length === 0) {
      throw new Error("TextInput requires non-empty expected text");
    }
    // The engine indexes by UTF-16 code unit. Surrogate-pair (non-BMP)
    // characters take two code units and would desync cursor position from
    // visible characters. Reject them at the boundary rather than let the
    // mismatch silently break alignment.
    if (/[\uD800-\uDFFF]/.test(expected)) {
      throw new Error("TextInput supports only Basic Multilingual Plane text (no surrogate pairs)");
    }
    this.expected = expected;
    this.stopOnError = options.stopOnError ?? false;
    this.noBackspace = options.noBackspace ?? false;
    this._statuses = new Array<CharStatus>(expected.length).fill("untyped");
    // Sanitize emits `\n\n` between paragraphs. They're not typeable from
    // a real keyboard via our input handler (Enter is reserved for "go
    // next run"), so we auto-advance the cursor past any `\n` runs the
    // expected text contains. Skip from the initial position too in
    // case the expected starts with one.
    this._skipNonTypeable();
  }

  /**
   * Advance the cursor past any non-typeable separator chars (currently
   * just `\n`). Called after every successful keystroke and at start.
   * Auto-skipped positions stay `"untyped"` — they generate no Step
   * entries, so per-key histograms and metrics aren't polluted by
   * paragraph-break "keystrokes" that never happened.
   */
  private _skipNonTypeable(): void {
    while (this._pos < this.expected.length && this.expected[this._pos] === "\n") {
      this._pos++;
    }
  }

  get pos(): number {
    return this._pos;
  }

  /** Append-only log of every committed keystroke. */
  get steps(): readonly Step[] {
    return this._steps;
  }

  get completed(): boolean {
    return this._pos >= this.expected.length;
  }

  /**
   * Milliseconds of *active* typing — the sum of inter-keystroke intervals,
   * each capped at `PAUSE_CAP_MS`. A tab freeze or coffee break of arbitrary
   * length contributes at most `PAUSE_CAP_MS` to this total; a saved
   * RunResult's `durationMs` cannot exceed the actual typing time by more
   * than ~12 s × number-of-pauses.
   */
  get elapsedMs(): number {
    return this._activeMs;
  }

  /** Count of positions currently in the given status. */
  count(status: CharStatus): number {
    let n = 0;
    for (const s of this._statuses) {
      if (s === status) {
        n++;
      }
    }
    return n;
  }

  snapshot(): TypingSnapshot {
    return {
      expected: this.expected,
      statuses: this._statuses.slice(),
      pos: this._pos,
      completed: this.completed,
    };
  }

  /** Commit one typed character. Returns whether the run is still running or completed. */
  appendChar(typed: string, timeStamp: number): Feedback {
    if (this.completed) {
      return "completed";
    }
    const expectedChar = this.expected[this._pos];
    if (expectedChar === undefined) {
      // Unreachable: guarded by `completed` above. Fail loud if the invariant breaks.
      throw new Error(`TextInput position ${this._pos} out of range`);
    }
    const typo = typed !== expectedChar;
    const rawInterval = this._lastTimeStamp === null ? 0 : timeStamp - this._lastTimeStamp;
    // Negative intervals (clock skew, monotonicity break) are floored to 0.
    // Long pauses (tab freeze) are capped so a single gap can't drag the
    // active-typing aggregate into hours.
    const interval = Math.max(0, Math.min(rawInterval, PAUSE_CAP_MS));
    this._activeMs += interval;

    // `timeToType` in the Step log keeps the raw value so the per-key
    // outlier filter in `histogramFromSteps` can recognise and drop both
    // pause-induced and paste-induced timings independently.
    this._steps.push({
      position: this._pos,
      timeStamp,
      typed,
      expected: expectedChar,
      timeToType: rawInterval,
      typo,
    });
    this._lastTimeStamp = timeStamp;

    if (typo && this.stopOnError) {
      this._statuses[this._pos] = "incorrect";
      return "running";
    }

    this._statuses[this._pos] = typo ? "incorrect" : "correct";
    this._pos++;
    this._skipNonTypeable();
    return this.completed ? "completed" : "running";
  }

  /**
   * Move the cursor back one position, clearing that position's status.
   * Skips back past any non-typeable separator chars (`\n`) too, so a
   * backspace at the start of a paragraph lands on the last typeable
   * char of the previous paragraph rather than on an invisible newline.
   * No-op at the start of the passage.
   */
  backspace(): void {
    if (this.noBackspace) {
      // Confidence mode — silently ignore.
      return;
    }
    if (this._pos === 0) {
      return;
    }
    this._pos--;
    while (this._pos > 0 && this.expected[this._pos] === "\n") {
      this._pos--;
    }
    this._statuses[this._pos] = "untyped";
  }

  /** Restore the instance to its initial, untyped state. */
  reset(): void {
    this._statuses.fill("untyped");
    this._steps.length = 0;
    this._pos = 0;
    this._lastTimeStamp = null;
    this._activeMs = 0;
    this._skipNonTypeable();
  }
}
