import { makePassage } from "./analyze";
import type { Filter, Passage } from "./types";

export interface PseudoWordOptions {
  /** Number of words to generate. Default 30. */
  wordCount?: number;
  /** Shortest generated word. Default 2. */
  minWordLength?: number;
  /** Longest generated word. Default 7. */
  maxWordLength?: number;
  /** Probability that a generated word is seeded with the focus letter. Default 0.7. */
  focusBias?: number;
  /** Deterministic RNG in [0, 1). Defaults to Math.random. */
  rng?: () => number;
}

/**
 * Generates a passage of pseudo-random words drawn from `filter.allowed`,
 * over-representing `filter.focus`. Works for any alphabet size, including the
 * 6-letter early lessons where no real sentence could exist.
 */
export function generatePseudoWords(filter: Filter, options: PseudoWordOptions = {}): Passage {
  const letters = filter.allowed;
  if (letters.length === 0) {
    throw new Error("cannot generate words from an empty alphabet");
  }
  const wordCount = Math.max(1, options.wordCount ?? 30);
  const minLen = Math.max(1, options.minWordLength ?? 2);
  const maxLen = Math.max(minLen, options.maxWordLength ?? 7);
  const focusBias = options.focusBias ?? 0.7;
  const rng = options.rng ?? Math.random;

  const pick = (xs: readonly string[]): string => {
    const value = xs[Math.floor(rng() * xs.length)];
    if (value === undefined) {
      throw new Error("rng produced an out-of-range index");
    }
    return value;
  };

  const seedFocus =
    filter.focus !== null && filter.allowed.includes(filter.focus) ? filter.focus : null;

  const words: string[] = [];
  for (let w = 0; w < wordCount; w++) {
    const length = minLen + Math.floor(rng() * (maxLen - minLen + 1));
    const chars: string[] = [];
    for (let i = 0; i < length; i++) {
      chars.push(pick(letters));
    }
    // Seed the focus letter into most words so the lesson actually drills it.
    if (seedFocus !== null && rng() < focusBias) {
      chars[Math.floor(rng() * chars.length)] = seedFocus;
    }
    words.push(chars.join(""));
  }

  const text = words.join(" ");
  return makePassage(`pseudo:${text}`.slice(0, 64), text);
}
