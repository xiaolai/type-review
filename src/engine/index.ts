// Top-level engine barrel. Re-exports are enumerated explicitly (no `export *`)
// so name collisions between sub-modules surface as type-check errors instead
// of silently shadowing. Sub-barrels (e.g. `engine/adaptive`) are still the
// preferred import path for narrow consumers; this barrel is for callers that
// want the whole engine surface in one place (and tests).

export type {
  AdaptiveSettings,
  BigramHit,
  BigramSample,
  BigramStats,
  Histogram,
  KeyStats,
  LessonKey,
  LessonPlan,
  WeakBigram,
} from "./adaptive";
// --- adaptive -------------------------------------------------------------
export {
  buildBigramStatsMap,
  DEFAULT_ADAPTIVE_SETTINGS,
  DEFAULT_ALPHABET,
  DEFAULT_TARGET_WPM,
  deriveKeyStats,
  EMA_ALPHA,
  EmaFilter,
  histogramFromSteps,
  planLesson,
  Target,
} from "./adaptive";
export type { SettingBounds, SettingsBounds } from "./bounds";
// --- bounds (cross-cutting validation policy) -----------------------------
export { inBound, SETTINGS_BOUNDS, UI_BOUNDS } from "./bounds";
export type { Filter, Passage, PlainWordsOptions, PseudoWordOptions } from "./corpus";
// --- corpus ---------------------------------------------------------------
export {
  analyzeText,
  COMMON_WORDS,
  generatePlainWords,
  generatePseudoWords,
  makePassage,
} from "./corpus";
export type { RunMetrics, RunMetricsInput, SecondBin } from "./metrics";
// --- metrics --------------------------------------------------------------
export {
  binBySecond,
  computeConsistency,
  computeLiveMetrics,
  computeRunMetrics,
  kogasa,
  mean,
  roundTo2,
  stdDev,
} from "./metrics";
// --- rng ------------------------------------------------------------------
export { mulberry32 } from "./rng";
export type {
  Mode,
  Profile,
  ProfileSettings,
  RunResult,
  SessionDeps,
  SessionSnapshot,
} from "./session";
// --- session --------------------------------------------------------------
export {
  createDefaultProfile,
  DEFAULT_MODE,
  DEFAULT_STOP_ON_ERROR,
  DEFAULT_WORD_COUNT,
  defaultProfileSettings,
  MAX_HISTORY,
  Session,
} from "./session";
export type {
  CharStatus,
  Feedback,
  Step,
  TextInputOptions,
  TypingSnapshot,
} from "./typing";
// --- typing ---------------------------------------------------------------
export { TextInput } from "./typing";
