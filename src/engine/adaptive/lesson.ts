import { deriveKeyStats } from "./key-stats";
import type { Target } from "./target";
import type { AdaptiveSettings, BigramStats, LessonKey, LessonPlan, WeakBigram } from "./types";

/** English letters in rough frequency order — common letters are learned first. */
export const DEFAULT_ALPHABET: readonly string[] = [
  "e",
  "t",
  "a",
  "o",
  "i",
  "n",
  "s",
  "r",
  "h",
  "l",
  "d",
  "c",
  "u",
  "m",
  "f",
  "p",
  "g",
  "w",
  "y",
  "b",
  "v",
  "k",
  "x",
  "j",
  "q",
  "z",
];

export const DEFAULT_ADAPTIVE_SETTINGS: AdaptiveSettings = {
  minAlphabetSize: 6,
  alphabetExpansion: 0,
};

export const DEFAULT_TARGET_WPM = 50;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * The guided-lesson planner: decides which letters this lesson covers and which
 * single letter to drill hardest.
 *
 * Progression rules, applied to letters in alphabet order:
 *   1. Always include at least `minAlphabetSize` letters.
 *   2. Include up to `maxSize` (set by `alphabetExpansion`); these are "forced".
 *   3. Keep any letter already mastered (best-ever confidence >= 1).
 *   4. Unlock exactly one new letter once every included letter is mastered.
 *
 * Unlock decisions use best-ever confidence so the curriculum never backslides.
 * Focus selection uses *current* confidence so each lesson drills present
 * weakness rather than a stale historical low — the two-axis split is
 * deliberate, not an accident.
 */
export function planLesson(
  letters: readonly string[],
  bigramStats: ReadonlyMap<string, BigramStats>,
  target: Target,
  settings: AdaptiveSettings = DEFAULT_ADAPTIVE_SETTINGS,
): LessonPlan {
  const minSize = clamp(
    Math.round(settings.minAlphabetSize),
    Math.min(1, letters.length),
    letters.length,
  );
  const expansion = clamp(settings.alphabetExpansion, 0, 1);
  const maxSize = clamp(
    minSize + Math.round((letters.length - minSize) * expansion),
    minSize,
    letters.length,
  );

  // Derive per-letter view from bigrams. This is the source of truth for
  // alphabet unlocking — letter L's confidence is the weighted average of
  // every bigram ending in L.
  const stats = deriveKeyStats(letters, bigramStats);

  const confidenceOf = (letter: string): number | null =>
    target.confidence(stats.get(letter)?.timeToType ?? null);
  const bestConfidenceOf = (letter: string): number | null =>
    target.confidence(stats.get(letter)?.bestTimeToType ?? null);
  const mastered = (confidence: number | null): boolean => confidence !== null && confidence >= 1;

  const includedLetters: string[] = [];
  const forcedLetters = new Set<string>();

  for (const letter of letters) {
    if (includedLetters.length < minSize) {
      includedLetters.push(letter);
      continue;
    }
    if (includedLetters.length < maxSize) {
      includedLetters.push(letter);
      forcedLetters.add(letter);
      continue;
    }
    if (mastered(bestConfidenceOf(letter))) {
      includedLetters.push(letter);
      continue;
    }
    if (includedLetters.every((l) => mastered(bestConfidenceOf(l)))) {
      includedLetters.push(letter);
      forcedLetters.add(letter);
      continue;
    }
    // Letters are in difficulty order: once one fails to unlock, so will the rest.
    break;
  }

  const includedSet = new Set(includedLetters);

  // Focus = the weakest included letter still below target. Unknown (null)
  // confidence sorts as weakest, so a freshly unlocked letter is drilled first.
  let focus: string | null = null;
  let focusScore = Infinity;
  for (const letter of includedLetters) {
    const confidence = confidenceOf(letter);
    if (confidence !== null && confidence >= 1) {
      continue;
    }
    const score = confidence ?? -Infinity;
    if (score < focusScore) {
      focusScore = score;
      focus = letter;
    }
  }

  const keys: LessonKey[] = letters.map((letter) => ({
    letter,
    included: includedSet.has(letter),
    forced: forcedLetters.has(letter),
    focused: letter === focus,
    confidence: confidenceOf(letter),
    bestConfidence: bestConfidenceOf(letter),
  }));

  // Surface the top-3 weakest bigrams whose both characters are included.
  // "Weakest" here is current-confidence < 1 (below target), sorted ascending.
  // Bigrams that have never been timed (timeToType null) are skipped — we
  // can't claim weakness without measurement.
  const weakBigrams: WeakBigram[] = [];
  for (const stats of bigramStats.values()) {
    if (stats.bigram.length !== 2) continue;
    const first = stats.bigram.charAt(0);
    const second = stats.bigram.charAt(1);
    if (!includedSet.has(first) || !includedSet.has(second)) continue;
    const confidence = target.confidence(stats.timeToType);
    if (confidence === null || confidence >= 1) continue;
    weakBigrams.push({ bigram: stats.bigram, confidence });
  }
  weakBigrams.sort((a, b) => a.confidence - b.confidence);

  return {
    included: includedLetters,
    focus,
    keys,
    weakBigrams: weakBigrams.slice(0, 3),
  };
}
