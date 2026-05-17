/**
 * Production wiring for the bundled corpus sources.
 *
 * `import.meta.glob` is a Vite feature — it inlines matching files at build
 * time. With `eager: true`, the modules are loaded synchronously and the
 * resulting record has the parsed JSON. This file is the ONLY place that
 * touches the Vite-specific API; everything else operates on plain
 * `RawQuote[]` / `RawCode[]` arrays so unit tests can inject their own.
 */

import type { CorpusSource } from "../../engine/corpus";
import { createCodeSource, type RawCode } from "./code";
import { createQuotesSource, type RawQuote } from "./quotes";

interface QuotesFile {
  entries: RawQuote[];
}

// Top-level static import — Vite inlines the JSON into the bundle.
import quotesJson from "./data/quotes.json";

const quotesData = quotesJson as QuotesFile;

const codeModules = import.meta.glob<{ default: RawCode }>("./data/code/*.json", {
  eager: true,
});
const codeData: RawCode[] = Object.values(codeModules).map((m) => m.default);

export const bundledQuotes: CorpusSource = createQuotesSource(quotesData.entries);
export const bundledCode: CorpusSource = createCodeSource(codeData);
