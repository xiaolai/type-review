/**
 * Normalises arbitrary text into something the typing engine can present.
 *
 * Rules (updated 2026-05-17):
 *  - Drop ASCII control characters (codepoints 0..31 except whitespace,
 *    and 127). Whitespace (\t \n \v \f \r \space) is kept here and
 *    normalised by the pass below.
 *  - Drop UTF-16 surrogate halves (the engine rejects them; we strip
 *    rather than reject so a single bad codepoint doesn't fail an
 *    otherwise-valid paste).
 *  - Normalise CRLF / CR to LF so the rest of the logic only sees `\n`.
 *  - **Prose mode (default)** — for each run of whitespace:
 *      • If it spans a blank line (i.e. contains ≥ 2 newlines), collapse
 *        to exactly one blank line (`\n\n`) — preserves paragraph
 *        structure while dropping excess blank lines.
 *      • Otherwise collapse to a single space — single hard line wraps
 *        in source text become spaces, so prose flows correctly.
 *  - **Layout-preserving mode** (`preserveLayout: true`) — skip the
 *    whitespace-collapse pass entirely. Newlines stay as newlines,
 *    runs of leading spaces stay as indentation. Used by the code
 *    source so a Python `def` keeps its 4-space indents and a JS
 *    file with three statements renders as three lines, not a wall.
 *  - Trim leading and trailing whitespace from the whole input.
 *  - Cap length at `MAX_PASSAGE_CHARS`; truncate at the last word /
 *    paragraph boundary so a pathological paste can't make a passage
 *    that takes hours to type.
 *
 * Downstream:
 *  - TextInput auto-advances past `\n` characters so the typist isn't
 *    forced to "type" a paragraph break.
 *  - TypingArea renders `\n` as a visible line break (each char lives
 *    in its own span with `white-space: pre`, so embedded `\n` chars
 *    behave as forced wraps).
 */

export const MAX_PASSAGE_CHARS = 5000;

export interface SanitizeOptions {
  /**
   * Skip the whitespace-collapse pass. Code passages need it so
   * `\n` between statements survives and leading-space indentation is
   * preserved. Prose doesn't — collapse-to-space gives single-line
   * flow regardless of how the source was wrapped.
   */
  preserveLayout?: boolean;
}

const HIGH_SURROGATE_FIRST = 0xd800;
const LOW_SURROGATE_LAST = 0xdfff;

export interface SanitizeResult {
  text: string;
  /** Number of code units dropped (control chars + surrogate halves). */
  droppedChars: number;
  /** True iff the result was truncated at `MAX_PASSAGE_CHARS`. */
  truncated: boolean;
}

export function sanitize(input: string, options: SanitizeOptions = {}): SanitizeResult {
  let dropped = 0;
  const kept: string[] = [];
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    // Surrogate halves — drop.
    if (code >= HIGH_SURROGATE_FIRST && code <= LOW_SURROGATE_LAST) {
      dropped++;
      continue;
    }
    // Whitespace family — keep; the normalisation pass below handles them.
    if (
      code === 0x09 || // tab
      code === 0x0a || // LF
      code === 0x0b || // VT
      code === 0x0c || // FF
      code === 0x0d || // CR
      code === 0x20 // space
    ) {
      kept.push(input[i] ?? "");
      continue;
    }
    // Other control characters → drop.
    if (code < 0x20 || code === 0x7f) {
      dropped++;
      continue;
    }
    kept.push(input[i] ?? "");
  }
  let text = kept.join("");

  // Normalise line endings to LF.
  text = text.replace(/\r\n?/g, "\n");

  if (!options.preserveLayout) {
    // Normalise every whitespace run: paragraph break (`\n\n`) iff it spans
    // a blank line; otherwise a single space.
    text = text.replace(/[ \t\v\f\n]+/g, (match) => {
      let newlines = 0;
      for (let i = 0; i < match.length; i++) {
        if (match.charCodeAt(i) === 0x0a) newlines++;
      }
      return newlines >= 2 ? "\n\n" : " ";
    });
  }

  text = text.trim();

  const truncated = text.length > MAX_PASSAGE_CHARS;
  if (truncated) {
    text = text.slice(0, MAX_PASSAGE_CHARS);
    // Prefer a paragraph boundary near the cap; fall back to a word
    // boundary. Either keeps the cut from landing mid-word.
    const lastBreak = Math.max(text.lastIndexOf("\n"), text.lastIndexOf(" "));
    if (lastBreak > MAX_PASSAGE_CHARS * 0.8) {
      text = text.slice(0, lastBreak);
    }
  }
  return { text, droppedChars: dropped, truncated };
}
