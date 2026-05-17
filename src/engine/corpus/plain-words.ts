import { makePassage } from "./analyze";
import type { Passage } from "./types";

/** The ~120 most common English words — the built-in benchmark word list. */
export const COMMON_WORDS: readonly string[] = [
  "the",
  "be",
  "to",
  "of",
  "and",
  "a",
  "in",
  "that",
  "have",
  "it",
  "for",
  "not",
  "on",
  "with",
  "he",
  "as",
  "you",
  "do",
  "at",
  "this",
  "but",
  "his",
  "by",
  "from",
  "they",
  "we",
  "say",
  "her",
  "she",
  "or",
  "an",
  "will",
  "my",
  "one",
  "all",
  "would",
  "there",
  "their",
  "what",
  "so",
  "up",
  "out",
  "if",
  "about",
  "who",
  "get",
  "which",
  "go",
  "me",
  "when",
  "make",
  "can",
  "like",
  "time",
  "no",
  "just",
  "him",
  "know",
  "take",
  "people",
  "into",
  "year",
  "your",
  "good",
  "some",
  "could",
  "them",
  "see",
  "other",
  "than",
  "then",
  "now",
  "look",
  "only",
  "come",
  "its",
  "over",
  "think",
  "also",
  "back",
  "after",
  "use",
  "two",
  "how",
  "our",
  "work",
  "first",
  "well",
  "way",
  "even",
  "new",
  "want",
  "because",
  "any",
  "these",
  "give",
  "day",
  "most",
  "us",
  "find",
  "thing",
  "many",
  "great",
  "little",
  "world",
  "still",
  "between",
  "life",
  "down",
  "should",
  "home",
  "around",
  "small",
  "place",
  "another",
  "again",
  "turn",
  "here",
  "move",
  "where",
];

export interface PlainWordsOptions {
  /** Number of words to include. Default 30. */
  wordCount?: number;
  /** Word list to draw from. Defaults to COMMON_WORDS. */
  wordList?: readonly string[];
  /** Deterministic RNG in [0, 1). Defaults to Math.random. */
  rng?: () => number;
  /**
   * When true, ~15% of generated tokens are replaced with a 1-4 digit
   * integer so the benchmark also drills the number row. Off by
   * default — set by the global "include numbers" toggle.
   */
  includeNumbers?: boolean;
  /**
   * When true, ~20% of words get a trailing punctuation mark (one of
   * `.,;:!?`) and the first word of each sentence-ish chunk gets a
   * capital. Off by default — set by the global "include punctuation"
   * toggle.
   */
  includePunctuation?: boolean;
}

const PUNCT_TRAILING = [".", ",", ";", ":", "!", "?"] as const;

function randomDigits(rng: () => number): string {
  // 1-4 digits, leading digit non-zero so "0123" can't happen.
  const len = 1 + Math.floor(rng() * 4);
  let s = String(1 + Math.floor(rng() * 9));
  for (let i = 1; i < len; i++) s += String(Math.floor(rng() * 10));
  return s;
}

/**
 * Builds a benchmark passage of randomly chosen words — no adaptive filtering.
 * Feeds the timed / word-count test mode.
 */
export function generatePlainWords(options: PlainWordsOptions = {}): Passage {
  const list = options.wordList ?? COMMON_WORDS;
  if (list.length === 0) {
    throw new Error("word list is empty");
  }
  const wordCount = Math.max(1, options.wordCount ?? 30);
  const rng = options.rng ?? Math.random;
  const includeNumbers = options.includeNumbers === true;
  const includePunctuation = options.includePunctuation === true;

  const tokens: string[] = [];
  let capitaliseNext = includePunctuation;
  for (let i = 0; i < wordCount; i++) {
    // Number-row drill: replace ~15% of tokens with a random digit
    // string. Numbers don't take trailing punctuation or capitals.
    if (includeNumbers && rng() < 0.15) {
      tokens.push(randomDigits(rng));
      continue;
    }
    const word = list[Math.floor(rng() * list.length)];
    if (word === undefined) {
      throw new Error("rng produced an out-of-range index");
    }
    let token: string = word;
    if (includePunctuation) {
      if (capitaliseNext) {
        token = token.charAt(0).toUpperCase() + token.slice(1);
        capitaliseNext = false;
      }
      // ~20% of words get a trailing punctuation mark. Sentence-ending
      // marks (. ! ?) trigger a capital on the next word.
      if (rng() < 0.2) {
        const mark = PUNCT_TRAILING[Math.floor(rng() * PUNCT_TRAILING.length)] ?? ".";
        token += mark;
        if (mark === "." || mark === "!" || mark === "?") capitaliseNext = true;
      }
    }
    tokens.push(token);
  }

  const text = tokens.join(" ");
  return makePassage(`plain:${text}`.slice(0, 64), text);
}
