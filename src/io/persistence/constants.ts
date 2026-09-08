/**
 * Defensive caps on persisted shape — tampered storage cannot exhaust
 * resources. `MAX_RESULTS` mirrors `Session.MAX_HISTORY` (intentionally
 * duplicated rather than imported: storage's DoS-protection ceiling and
 * the engine's perf-cap-on-replay are different invariants that happen
 * to share a value today).
 */
export const MAX_RESULTS = 500;
/**
 * Ceiling on stored bigram entries per run.
 *
 * A histogram holds one entry per *distinct adjacent character pair* in the
 * run's text, so it grows with passage length: a 5,000-char library upload
 * (the `MAX_PASSAGE_CHARS` ceiling) yields ~490 distinct bigrams, and a
 * punctuated 1,000-word generator run yields ~430. This ceiling has to sit
 * above anything the app itself can produce, or its own writes come back
 * unreadable. It was 256, which real prose passes at ~900 characters — see
 * `histogram-capacity.test.ts`, which pins the writer-fits-reader invariant
 * this number exists to satisfy.
 */
export const MAX_HISTOGRAM_ENTRIES = 5_000;
export const MAX_KEY_COUNT = 1_000_000;
export const MAX_TIME_TO_TYPE_MS = 60_000;
export const MAX_DURATION_MS = 24 * 60 * 60 * 1000;
export const MAX_TEXT_LENGTH = 100_000;
export const MAX_PASSAGE_ID_LENGTH = 256;

/** Whitelists used by the strict-object validator — extra keys fail loud. */
export const ALLOWED_PROFILE_KEYS: ReadonlySet<string> = new Set([
  "version",
  "settings",
  "results",
]);
export const ALLOWED_RESULT_KEYS: ReadonlySet<string> = new Set([
  "index",
  "mode",
  "timestamp",
  "passageId",
  "text",
  "metrics",
  "histogram",
]);
export const ALLOWED_METRICS_KEYS: ReadonlySet<string> = new Set([
  "netWpm",
  "wpmStdDev",
  "wpmSeries",
  "rawWpm",
  "accuracy",
  "consistency",
  "correctChars",
  "incorrectChars",
  "durationMs",
]);
