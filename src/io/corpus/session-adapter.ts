import type {
  CorpusEntry,
  CorpusSource,
  CorpusSourceContext,
  Filter,
  Passage,
} from "../../engine/corpus";
import { generatePlainWords, generatePseudoWords, makePassage } from "../../engine/corpus";
import type { PassageLength, TestMode } from "../../engine/session";

/**
 * Map a passage-length bucket to a target `wantedChars` value for the
 * corpus pick. `"any"` falls back to the historical word-count×5.5
 * heuristic so existing behaviour is preserved when the user hasn't
 * opted into a fixed length.
 */
function lengthHint(wordCount: number, passageLength: PassageLength): number {
  switch (passageLength) {
    case "short":
      return 150;
    case "medium":
      return 400;
    case "long":
      return 800;
    case "any":
      return wordCount * 5.5;
  }
}

export interface CorpusSessionAdapter {
  /** Plug into `SessionDeps.adaptiveSource`. */
  adaptiveSource: (
    filter: Filter,
    wordCount: number,
    opts: { passageLength: PassageLength },
  ) => Passage;
  /** Plug into `SessionDeps.benchmarkSource`. */
  benchmarkSource: (
    wordCount: number,
    opts: {
      includeNumbers: boolean;
      includePunctuation: boolean;
      passageLength: PassageLength;
      testMode: TestMode;
    },
  ) => Passage;
}

export interface CorpusSessionAdapterOptions {
  /**
   * Fired every time a passage is selected — both real entries from the
   * composite and the fallback-generator case (called with `null`). Lets the
   * UI track the current entry reactively (a Solid signal in App).
   */
  onEntryPicked?: (entry: CorpusEntry | null) => void;
}

/**
 * Bridges the corpus stack (a `CorpusSource`) to the shape the `Session`
 * expects (`adaptiveSource` + `benchmarkSource` functions returning a
 * `Passage`). If the composite returns null — e.g. no quote / article fits
 * the lesson's alphabet yet — we fall back to the original generators so a
 * practice run can always start.
 *
 * Entry attribution is forwarded via `onEntryPicked`; the adapter itself
 * is stateless beyond closing over `rng` and `corpus`.
 */
export function createCorpusSessionAdapter(
  corpus: CorpusSource,
  rng: () => number,
  options: CorpusSessionAdapterOptions = {},
): CorpusSessionAdapter {
  const setLast = (entry: CorpusEntry | null): void => {
    options.onEntryPicked?.(entry);
  };

  const ctxFor = (
    filter: ReadonlySet<string> | undefined,
    wordCount: number,
    passageLength: PassageLength,
  ): CorpusSourceContext => ({
    ...(filter ? { filter } : {}),
    // ~5.5 chars/word (5 letters + 1 space, English avg). The optional
    // passageLength bucket overrides — short ≈ a tweet, medium ≈ a
    // paragraph, long ≈ several. "any" keeps the historical
    // word-count-driven length.
    wantedChars: lengthHint(wordCount, passageLength),
    rng,
  });

  return {
    adaptiveSource(filter, wordCount, opts): Passage {
      const allowedSet = new Set(filter.allowed);
      const entry = corpus.pick(ctxFor(allowedSet, wordCount, opts.passageLength));
      if (entry !== null) {
        setLast(entry);
        return makePassage(entry.id, entry.text);
      }
      setLast(null);
      return generatePseudoWords(filter, { wordCount, rng });
    },
    benchmarkSource(wordCount, opts): Passage {
      // Skip the corpus pick entirely when:
      //   - numbers/punctuation are on (quotes can't be assumed to
      //     contain the requested symbol density), OR
      //   - time mode is on (a curated quote may be 200 chars when a
      //     30 s test needs ~3000 — the typist would run out of text
      //     before the timer fires).
      // In both cases go straight to the controlled generator.
      const useGenerator =
        opts.includeNumbers || opts.includePunctuation || opts.testMode === "time";
      if (!useGenerator) {
        const entry = corpus.pick(ctxFor(undefined, wordCount, opts.passageLength));
        if (entry !== null) {
          setLast(entry);
          return makePassage(entry.id, entry.text);
        }
      }
      setLast(null);
      // Honour `passageLength` even in the fallback so a user who picks
      // "short" with numbers on doesn't get a 30-word benchmark. Time
      // mode passes its own large word budget — bypass the bucket
      // mapping there so the timer has enough text to outlast it.
      const generatorWords =
        opts.testMode === "time" || opts.passageLength === "any"
          ? wordCount
          : Math.max(1, Math.round(lengthHint(wordCount, opts.passageLength) / 5.5));
      return generatePlainWords({
        wordCount: generatorWords,
        rng,
        includeNumbers: opts.includeNumbers,
        includePunctuation: opts.includePunctuation,
      });
    },
  };
}
