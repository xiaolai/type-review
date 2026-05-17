import type { CorpusSource } from "../../engine/corpus";
import { createStaticSource, type RawStaticEntry } from "./static-source";

export type RawQuote = RawStaticEntry;

/**
 * Build a quotes `CorpusSource` from raw data. Thin wrapper over the
 * shared {@link createStaticSource} that fixes `SourceKind` to `"quote"`.
 */
export function createQuotesSource(raw: readonly RawQuote[]): CorpusSource {
  return createStaticSource(raw, "quote");
}
