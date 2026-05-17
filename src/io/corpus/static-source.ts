import type { CorpusEntry, CorpusSource, SourceKind } from "../../engine/corpus";
import { fitsAlphabet, makeEntry, pickWeightedByLength } from "../../engine/corpus";
import { type SanitizeOptions, sanitize } from "./sanitize";

/**
 * Shape that the bundled quote / code raw JSON files satisfy. `author`
 * is repurposed for code as the language label ("Python", "Rust", ...).
 * Anything beyond these fields is dropped on the way through.
 */
export interface RawStaticEntry {
  id: string;
  text: string;
  title?: string;
  author?: string;
  url?: string;
  license: string;
}

/**
 * Builds a static `CorpusSource` from a frozen array of raw entries —
 * the shared engine behind `createQuotesSource` and `createCodeSource`.
 * Each raw entry is sanitised (whitespace collapsed, control chars
 * dropped) so a bad input file cannot inject junk into the typing
 * stream. Entries that sanitise to empty are silently dropped.
 *
 * Picking is alphabet-filtered (if `ctx.filter` is given) then weighted
 * by closeness to `ctx.wantedChars` — short hint biases toward short
 * passages, etc.
 */
export function createStaticSource(
  raw: readonly RawStaticEntry[],
  kind: SourceKind,
  sanitizeOpts: SanitizeOptions = {},
): CorpusSource {
  const entries: CorpusEntry[] = [];
  for (const r of raw) {
    const clean = sanitize(r.text, sanitizeOpts);
    if (clean.text.length === 0) continue;
    entries.push(
      makeEntry(r.id, kind, clean.text, {
        license: r.license,
        ...(r.author ? { author: r.author } : {}),
        ...(r.title ? { title: r.title } : {}),
        ...(r.url ? { url: r.url } : {}),
      }),
    );
  }

  return {
    pick(ctx) {
      const candidates = ctx.filter
        ? entries.filter((e) => fitsAlphabet(e, ctx.filter as ReadonlySet<string>))
        : entries;
      return pickWeightedByLength(candidates, ctx.wantedChars, ctx.rng);
    },
  };
}
