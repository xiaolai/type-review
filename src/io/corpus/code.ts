import type { CorpusSource } from "../../engine/corpus";
import { createStaticSource, type RawStaticEntry } from "./static-source";

export type RawCode = RawStaticEntry;

/**
 * Build a code-snippets `CorpusSource`. `author` on each raw entry is
 * repurposed as the language label ("Python", "Rust", ...).
 *
 * Code passes `preserveLayout: true` so `sanitize()` keeps newlines
 * between statements and leading-space indentation intact — three
 * `const` declarations stay as three lines instead of being crushed
 * onto one. Each `\n` in the resulting passage becomes its own char
 * span with `white-space: pre`, which the browser renders as a line
 * break; `TextInput._skipNonTypeable` auto-advances the cursor past
 * the `\n`, so the typist doesn't have to "type" line breaks.
 */
export function createCodeSource(raw: readonly RawCode[]): CorpusSource {
  return createStaticSource(raw, "code", { preserveLayout: true });
}
