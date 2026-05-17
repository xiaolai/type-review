import type { CorpusEntry, CorpusSource, Filter } from "../../engine/corpus";
import {
  DIFFICULT_WORDS,
  fitsAlphabet,
  generatePlainWords,
  generatePseudoWords,
  makeEntry,
  pickWeightedByLength,
} from "../../engine/corpus";
import type { UserPassage } from "./user-corpus-store";

/**
 * Wraps the pseudo-word generator as a `CorpusSource`. Used as the final
 * fallback in the smart-fallback composite — the generator can produce
 * text from any non-empty allowed-letter set, so the channel always
 * succeeds when an alphabet filter is provided.
 */
export function createDrillsSource(rng: () => number): CorpusSource {
  return {
    pick(ctx) {
      const wordCount = Math.max(1, Math.round(ctx.wantedChars / 5.5));
      const filter: Filter = ctx.filter
        ? { allowed: [...ctx.filter], focus: null }
        : { allowed: ["e", "t", "a", "o", "i"], focus: null };
      const passage = generatePseudoWords(filter, { wordCount, rng });
      return makeEntry(passage.id, "drills", passage.text);
    },
  };
}

/**
 * Wraps the difficult-words list as a `CorpusSource`. The list is a
 * curated set of typing-difficult words (awkward bigrams, rare letters,
 * commonly-mistyped, long polysyllabic) — replaces the older
 * `common-words` channel, which drew from the ~120 most-frequent words
 * and was largely a finger-memory exercise.
 *
 * The vocabulary is fixed, so if the produced passage doesn't fit the
 * requested alphabet (early adaptive stage with only a few unlocked
 * letters), this source returns null so the composite can fall back
 * to drills.
 */
export function createDifficultSource(rng: () => number): CorpusSource {
  return {
    pick(ctx) {
      const wordCount = Math.max(1, Math.round(ctx.wantedChars / 5.5));
      const passage = generatePlainWords({ wordCount, rng, wordList: DIFFICULT_WORDS });
      // Re-id with a `difficult:` prefix. `generatePlainWords` tags every
      // passage with `plain:` regardless of the wordlist, and the same
      // generator is reused as the Session's generic benchmark fallback
      // — so an unprefixed id would collide on the Stats source classifier
      // (channelOf in ui/stats/aggregations.ts).
      const id = `difficult:${passage.text}`.slice(0, 64);
      const entry = makeEntry(id, "difficult", passage.text);
      if (ctx.filter && !fitsAlphabet(entry, ctx.filter)) {
        return null;
      }
      return entry;
    },
  };
}

/**
 * Wraps the live user-passage list as a `CorpusSource`. The list is read
 * fresh on every `pick` via `getPassages()`, so additions / deletions made
 * through the Library screen take effect immediately on the next run.
 */
export function createUserSource(getPassages: () => readonly UserPassage[]): CorpusSource {
  return {
    pick(ctx) {
      const passages = getPassages();
      if (passages.length === 0) return null;
      const entries: CorpusEntry[] = passages.map((p) =>
        makeEntry(p.id, "user", p.text, {
          license: "user-uploaded",
          ...(p.title ? { title: p.title } : {}),
        }),
      );
      const candidates = ctx.filter
        ? entries.filter((e) => fitsAlphabet(e, ctx.filter as ReadonlySet<string>))
        : entries;
      return pickWeightedByLength(candidates, ctx.wantedChars, ctx.rng);
    },
  };
}
