import { describe, expect, it } from "vitest";
import { ASCII_FOLD_TABLE, foldMapFrom, MAX_PASSAGE_CHARS, sanitize } from "./sanitize";

describe("sanitize", () => {
  it("passes clean text through unchanged", () => {
    expect(sanitize("Hello, world.")).toEqual({
      text: "Hello, world.",
      droppedChars: 0,
      truncated: false,
    });
  });

  it("collapses runs of inline whitespace + single newlines to a single space", () => {
    expect(sanitize("a  b\t\tc\nd\r\ne").text).toBe("a b c d e");
  });

  it("trims leading and trailing whitespace", () => {
    expect(sanitize("   hello   ").text).toBe("hello");
    expect(sanitize("\n\n\thello\r\n").text).toBe("hello");
  });

  describe("paragraph structure", () => {
    it("preserves a blank line as a paragraph break (\\n\\n)", () => {
      expect(sanitize("para one\n\npara two").text).toBe("para one\n\npara two");
    });

    it("collapses 2+ blank lines into exactly one blank line", () => {
      expect(sanitize("a\n\n\n\nb").text).toBe("a\n\nb");
      expect(sanitize("a\n\n\n\n\n\nb").text).toBe("a\n\nb");
    });

    it("treats a line containing only whitespace as a blank line", () => {
      expect(sanitize("a\n   \nb").text).toBe("a\n\nb");
      expect(sanitize("a\n\t\nb").text).toBe("a\n\nb");
    });

    it("collapses single newlines (hard line wraps) to a single space", () => {
      expect(sanitize("hard\nwrap").text).toBe("hard wrap");
    });

    it("normalises CRLF and CR line endings to LF", () => {
      expect(sanitize("a\r\n\r\nb").text).toBe("a\n\nb");
      expect(sanitize("a\r\rb").text).toBe("a\n\nb");
    });

    it("strips leading and trailing blank lines", () => {
      expect(sanitize("\n\n\nhello\n\n\n").text).toBe("hello");
    });
  });

  it("drops ASCII control characters and counts them", () => {
    // Bell (0x07), backspace (0x08), DEL (0x7f), etc.
    const result = sanitize("a\x07b\x08c\x7fd");
    expect(result.text).toBe("abcd");
    expect(result.droppedChars).toBe(3);
  });

  it("drops UTF-16 surrogate halves and counts them", () => {
    // Lone high surrogate, then a clean char.
    const result = sanitize(`a${String.fromCharCode(0xd800)}b`);
    expect(result.text).toBe("ab");
    expect(result.droppedChars).toBe(1);
  });

  it("caps length at MAX_PASSAGE_CHARS, truncating at word boundary when possible", () => {
    const long = "word ".repeat(2000); // 10000 chars
    const result = sanitize(long);
    expect(result.text.length).toBeLessThanOrEqual(MAX_PASSAGE_CHARS);
    expect(result.truncated).toBe(true);
    // Should end on a word boundary, not mid-"word".
    expect(result.text.endsWith("word")).toBe(true);
  });

  it("does not mark truncated when input is within the cap", () => {
    const short = "a".repeat(100);
    expect(sanitize(short).truncated).toBe(false);
  });

  it("counts a removed character once, however many code units it takes", () => {
    // An emoji is two UTF-16 code units, and a Hangul syllable decomposes into
    // three jamo. Each is one character to the person who pasted it.
    const result = sanitize("a\u{1F600}b\uD55Cc");
    expect(result.text).toBe("abc");
    expect(result.droppedChars).toBe(2);
  });

  it("leaves no whitespace at the end of a truncated passage", () => {
    // The last boundary before the cap is the second newline of a paragraph
    // break, and the cut used to keep the first.
    const words = "word ".repeat(900).trim();
    const prose = sanitize(`${words}\n\n${"x".repeat(1000)}`);
    expect(prose.truncated).toBe(true);
    expect(prose.text).toBe(words);
    // With layout kept, the last boundary can sit inside indentation.
    const code = sanitize(`${"x".repeat(4100)}\n    ${"y".repeat(1000)}`, { preserveLayout: true });
    expect(code.truncated).toBe(true);
    expect(code.text).toBe("x".repeat(4100));
  });

  it("changes nothing when it cleans text it has already cleaned", () => {
    const inputs = [
      `${"word ".repeat(900).trim()}\n\n${"x".repeat(1000)}`,
      `${"x".repeat(4100)}\n    ${"y".repeat(1000)}`,
      "word ".repeat(2000),
      "  caf\u00e9 \u201cquoted\u201d \u2014 a\u00a0b\t\n\n\nc  ",
      "a\u{1F600}b\uD55Cc\u0007",
      "  x".repeat(2500),
    ];
    for (const preserveLayout of [false, true]) {
      for (const input of inputs) {
        const once = sanitize(input, { preserveLayout });
        const twice = sanitize(once.text, { preserveLayout });
        const label = `preserveLayout=${preserveLayout}, input starting ${JSON.stringify(input.slice(0, 12))}`;
        expect(twice.text, label).toBe(once.text);
        expect(twice.droppedChars, label).toBe(0);
        expect(twice.truncated, label).toBe(false);
      }
    }
  });

  it("handles all-whitespace input by returning empty string", () => {
    expect(sanitize("   \t\n\r   ").text).toBe("");
  });

  it("preserves typeable punctuation, digits, and quotes", () => {
    expect(sanitize('Don\'t! 1+2=3. "yes"').text).toBe('Don\'t! 1+2=3. "yes"');
  });
});

describe("foldMapFrom", () => {
  it("refuses a table that repeats a code point", () => {
    expect(() =>
      foldMapFrom([
        [0x2018, "'"],
        [0x2018, "`"],
      ]),
    ).toThrow(/repeats a code point/);
  });

  it("keys every entry of the real table", () => {
    expect(foldMapFrom(ASCII_FOLD_TABLE).size).toBe(ASCII_FOLD_TABLE.length);
  });
});
