/** Status of a single character position in the expected text. */
export type CharStatus = "untyped" | "correct" | "incorrect";

/**
 * One committed keystroke. The steps array is an append-only log of every
 * `appendChar` call — backspace never removes a step. Per-key adaptive stats
 * are derived from this log, so a position that was mistyped, corrected, and
 * retyped contributes every attempt.
 */
export interface Step {
  /** Index into the expected text this keystroke targeted. */
  position: number;
  /** Timestamp (performance.now() domain) when the keystroke was committed. */
  timeStamp: number;
  /** The character the user actually typed. */
  typed: string;
  /** The character expected at `position`. */
  expected: string;
  /** Milliseconds since the previous keystroke. 0 for the first keystroke of a run. */
  timeToType: number;
  /** True when `typed` did not match `expected`. */
  typo: boolean;
}

/** Result signal returned by `TextInput.appendChar`. */
export type Feedback = "running" | "completed";

/** Immutable view of TextInput state, for rendering. */
export interface TypingSnapshot {
  expected: string;
  statuses: readonly CharStatus[];
  /** Cursor position — the next character to be typed. Equals `expected.length` when completed. */
  pos: number;
  completed: boolean;
}
