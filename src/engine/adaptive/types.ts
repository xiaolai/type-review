/**
 * Per-bigram aggregate from a single run. Keyed by a 2-character string
 * (the *transition*): the time the user took to type the SECOND character
 * given the first. So for the passage "the", the steps `t → h → e` produce
 * bigrams `"th"` (timing of `h`) and `"he"` (timing of `e`).
 *
 * Bigrams capture finger-transition cost, which is where typing speed
 * actually bottlenecks — `qu` is fast for everyone; `pl` and `mn` are
 * personal weak points that pure per-letter timings can't distinguish.
 */
export interface BigramHit {
  hitCount: number;
  missCount: number;
  /** Mean ms to type the second character, given the first. 0 = no timed hits. */
  timeToType: number;
}

/**
 * A run's per-bigram breakdown. Keyed by the bigram (two consecutive
 * expected characters, no surrogate pairs).
 */
export type Histogram = ReadonlyMap<string, BigramHit>;

/** One bigram's contribution from one run. */
export interface BigramSample {
  runIndex: number;
  hitCount: number;
  missCount: number;
  timeToType: number;
}

/** A bigram's accumulated stats across every run so far. */
export interface BigramStats {
  bigram: string;
  samples: readonly BigramSample[];
  hitCount: number;
  missCount: number;
  /** EMA of per-run timeToType. null until the bigram has a timed sample. */
  timeToType: number | null;
  /** Lowest EMA value ever observed — the bigram's personal best. */
  bestTimeToType: number | null;
}

/**
 * Per-letter aggregate **derived** from bigram stats. Computed by averaging
 * the timings of every bigram ending in the letter, weighted by hit count.
 * Lives here (instead of being computed at every UI render) so the planner
 * and heatmap share one source of truth.
 *
 * The shape and field names match the pre-bigram `KeyStats` so the lesson
 * planner and UI can continue to consume per-letter data unchanged. The
 * primary tracking is per-bigram; this is the projection for letter-level
 * surfaces (the keyboard heatmap, alphabet unlocking).
 */
export interface KeyStats {
  letter: string;
  hitCount: number;
  missCount: number;
  /** Weighted average of bigram EMAs ending in this letter. null when none. */
  timeToType: number | null;
  /** Weighted average of bigram best-EMAs ending in this letter. */
  bestTimeToType: number | null;
}

export interface AdaptiveSettings {
  /** Smallest alphabet the guided lesson ever uses. */
  minAlphabetSize: number;
  /**
   * How far past the minimum the alphabet may expand, 0..1. At 0, letters
   * unlock strictly one at a time as the user masters the current set; at 1,
   * the whole alphabet is available immediately.
   */
  alphabetExpansion: number;
}

/** Per-letter detail in a lesson plan. */
export interface LessonKey {
  letter: string;
  included: boolean;
  /** Freshly unlocked to fill the alphabet — generators must surface it. */
  forced: boolean;
  /** The single weakest included letter — generators over-represent it. */
  focused: boolean;
  /** Current confidence: targetTime / currentEMA. >= 1 means at/above target. */
  confidence: number | null;
  /** Best-ever confidence: targetTime / bestEMA. Drives unlock decisions. */
  bestConfidence: number | null;
}

/** The top-3 weakest bigrams shown alongside weak letters on Results. */
export interface WeakBigram {
  bigram: string;
  /** Confidence: targetTime / EMA. < 1 means below target. */
  confidence: number;
}

/** The output of the adaptive engine: what the next lesson should cover. */
export interface LessonPlan {
  /** Letters available this lesson, in alphabet order. Becomes the corpus filter's allowed set. */
  included: readonly string[];
  /** The weakest included letter, over-represented by text generators. null when all are at target. */
  focus: string | null;
  /** Full per-letter detail, in alphabet order, for UI (heatmap, progress). */
  keys: readonly LessonKey[];
  /** Top-3 weakest bigrams whose both characters are included — for Results display. */
  weakBigrams: readonly WeakBigram[];
}
