/**
 * Normalises arbitrary text into something the typing engine can present.
 *
 * Rules (updated 2026-09-13):
 *  - Bring the text into ASCII. This is English typing practice, and a
 *    letter the keyboard cannot produce is a mistake the typist is made to
 *    commit. NFKD first: accents split off their letters and are removed,
 *    an ellipsis becomes three dots, a trademark sign becomes TM, a
 *    non-breaking space becomes a space. Then `ASCII_FOLD_TABLE` for what
 *    decomposition leaves whole: typographic quotes and dashes, letters such
 *    as sharp s and oe, and a few common symbols. Anything still outside
 *    ASCII (Chinese, Cyrillic, Greek, emoji, lone surrogate halves) is
 *    dropped and counted, once per character of the input. A removed accent is a conversion, not a drop, and
 *    is not counted.
 *  - Drop ASCII control characters (codepoints 0..31 except whitespace,
 *    and 127). Whitespace (\t \n \v \f \r \space) is kept here and
 *    normalised by the pass below.
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

/**
 * What decomposition cannot reach, by hand. NFKD leaves these whole because
 * Unicode gives them no compatibility decomposition.
 *
 * Mirrored line for line in the app's `asciiFoldTable` (Sanitize.swift). The
 * app's corpus vector carries this table and its CorpusVectorTests require the
 * Swift table to equal it entry for entry, so regenerate that vector after
 * changing a line here: until then the app compares itself with the old table.
 */
export const ASCII_FOLD_TABLE: readonly (readonly [number, string])[] = [
  // Quotation marks and apostrophes, including guillemets and primes.
  [0x2018, "'"], // LEFT SINGLE QUOTATION MARK
  [0x2019, "'"], // RIGHT SINGLE QUOTATION MARK
  [0x201a, "'"], // SINGLE LOW-9 QUOTATION MARK
  [0x201b, "'"], // SINGLE HIGH-REVERSED-9 QUOTATION MARK
  [0x2032, "'"], // PRIME
  [0x2035, "'"], // REVERSED PRIME
  [0x2039, "'"], // SINGLE LEFT-POINTING ANGLE QUOTATION MARK
  [0x203a, "'"], // SINGLE RIGHT-POINTING ANGLE QUOTATION MARK
  [0x201c, '"'], // LEFT DOUBLE QUOTATION MARK
  [0x201d, '"'], // RIGHT DOUBLE QUOTATION MARK
  [0x201e, '"'], // DOUBLE LOW-9 QUOTATION MARK
  [0x201f, '"'], // DOUBLE HIGH-REVERSED-9 QUOTATION MARK
  [0x00ab, '"'], // LEFT-POINTING DOUBLE ANGLE QUOTATION MARK
  [0x00bb, '"'], // RIGHT-POINTING DOUBLE ANGLE QUOTATION MARK
  // Dashes, minus and bullets. One hyphen each, so a passage keeps its length.
  [0x2010, "-"], // HYPHEN
  [0x2012, "-"], // FIGURE DASH
  [0x2013, "-"], // EN DASH
  [0x2014, "-"], // EM DASH
  [0x2015, "-"], // HORIZONTAL BAR
  [0x2212, "-"], // MINUS SIGN
  [0x2043, "-"], // HYPHEN BULLET
  [0x2022, "-"], // BULLET
  [0x2023, "-"], // TRIANGULAR BULLET
  [0x25e6, "-"], // WHITE BULLET
  [0x00b7, "-"], // MIDDLE DOT
  // Slashes, including the one NFKD puts inside a vulgar fraction.
  [0x2044, "/"], // FRACTION SLASH
  [0x2215, "/"], // DIVISION SLASH
  // Line and paragraph separators, as a word processor pastes them.
  [0x2028, "\n"], // LINE SEPARATOR
  [0x2029, "\n\n"], // PARAGRAPH SEPARATOR
  // Letters that are not an ASCII letter with an accent, so NFKD leaves them whole.
  [0x00df, "ss"], // LATIN SMALL LETTER SHARP S
  [0x00e6, "ae"], // LATIN SMALL LETTER AE
  [0x00c6, "AE"], // LATIN CAPITAL LETTER AE
  [0x0153, "oe"], // LATIN SMALL LIGATURE OE
  [0x0152, "OE"], // LATIN CAPITAL LIGATURE OE
  [0x00f8, "o"], // LATIN SMALL LETTER O WITH STROKE
  [0x00d8, "O"], // LATIN CAPITAL LETTER O WITH STROKE
  [0x0142, "l"], // LATIN SMALL LETTER L WITH STROKE
  [0x0141, "L"], // LATIN CAPITAL LETTER L WITH STROKE
  [0x0111, "d"], // LATIN SMALL LETTER D WITH STROKE
  [0x0110, "D"], // LATIN CAPITAL LETTER D WITH STROKE
  [0x00f0, "d"], // LATIN SMALL LETTER ETH
  [0x00d0, "D"], // LATIN CAPITAL LETTER ETH
  [0x00fe, "th"], // LATIN SMALL LETTER THORN
  [0x00de, "Th"], // LATIN CAPITAL LETTER THORN
  [0x0131, "i"], // LATIN SMALL LETTER DOTLESS I
  // Symbols common enough in prose to be worth spelling out.
  [0x00a9, "(c)"], // COPYRIGHT SIGN
  [0x00ae, "(R)"], // REGISTERED SIGN
  [0x20ac, "EUR"], // EURO SIGN
  [0x00a3, "GBP"], // POUND SIGN
  [0x00a5, "JPY"], // YEN SIGN
  [0x00a2, "c"], // CENT SIGN
  [0x00b0, "deg"], // DEGREE SIGN
  [0x00d7, "x"], // MULTIPLICATION SIGN
  [0x00f7, "/"], // DIVISION SIGN
  [0x00b1, "+/-"], // PLUS-MINUS SIGN
];

/**
 * The table, keyed for the loop. A Map keeps only the last of a repeated key,
 * silently; refusing to build is the loud version of that, and matches the
 * Swift side, which traps. A function so the refusal can be tested: written
 * inline it only ever met a table with no repeats, and never once ran.
 */
export function foldMapFrom(
  table: readonly (readonly [number, string])[],
): ReadonlyMap<number, string> {
  const map = new Map(table);
  if (map.size !== table.length) {
    throw new Error("the fold table repeats a code point");
  }
  return map;
}

const ASCII_FOLD = foldMapFrom(ASCII_FOLD_TABLE);

export interface SanitizeResult {
  text: string;
  /**
   * Characters dropped for having no ASCII form, or for being control
   * characters, counted in the input's own code points: an emoji is one, and
   * so is a Hangul syllable, not the two and three code units they occupy
   * once decomposed. A removed accent is not counted.
   */
  droppedChars: number;
  /** True iff the result was truncated at `MAX_PASSAGE_CHARS`. */
  truncated: boolean;
}

export function sanitize(input: string, options: SanitizeOptions = {}): SanitizeResult {
  let dropped = 0;
  const kept: string[] = [];
  // One character of the input at a time, each given its compatibility
  // decomposition before anything is judged, so the loop sees a letter and its
  // accent separately, three dots rather than an ellipsis, and a plain space
  // rather than a non-breaking one.
  //
  // Per character rather than the whole string at once, so that what is
  // counted is what was pasted. Counting decomposed code units reported one
  // emoji as two characters removed and one Hangul syllable as three. The text
  // kept is the same either way: decomposing a whole string differs from
  // decomposing its characters only in how adjacent combining marks are
  // ordered, and every combining mark is removed. `for...of` walks code
  // points, and hands over a lone surrogate half on its own.
  for (const character of input) {
    let lost = false;
    const decomposed = character.normalize("NFKD");
    for (let i = 0; i < decomposed.length; i++) {
      const code = decomposed.charCodeAt(i);
      // Whitespace family — keep; the normalisation pass below handles them.
      if (
        code === 0x09 || // tab
        code === 0x0a || // LF
        code === 0x0b || // VT
        code === 0x0c || // FF
        code === 0x0d || // CR
        code === 0x20 // space
      ) {
        kept.push(decomposed[i] ?? "");
        continue;
      }
      // Other control characters → drop.
      if (code < 0x20 || code === 0x7f) {
        lost = true;
        continue;
      }
      if (code < 0x7f) {
        kept.push(decomposed[i] ?? "");
        continue;
      }
      // The accent decomposition split off its letter. Removing it is the
      // conversion to a plain letter, not the loss of a character, so it is not
      // counted.
      if (code >= 0x0300 && code <= 0x036f) continue;
      const replacement = ASCII_FOLD.get(code);
      if (replacement !== undefined) {
        kept.push(replacement);
        continue;
      }
      // No ASCII form: Chinese, Cyrillic, Greek, emoji, lone surrogate halves.
      lost = true;
    }
    if (lost) dropped++;
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
    // The cut can leave whitespace behind it: at the second newline of a
    // paragraph break it keeps the first, and in a layout-preserving passage
    // it can stop inside a line's indentation. Trimmed, because the text is
    // trimmed on the way in; otherwise cleaning the result again took more off.
    text = text.trimEnd();
  }
  return { text, droppedChars: dropped, truncated };
}
