import { describe, expect, it } from "vitest";
import { MAX_PASSAGE_CHARS, sanitize } from "./sanitize";

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

  it("handles all-whitespace input by returning empty string", () => {
    expect(sanitize("   \t\n\r   ").text).toBe("");
  });

  it("preserves typeable punctuation, digits, and quotes", () => {
    expect(sanitize('Don\'t! 1+2=3. "yes"').text).toBe('Don\'t! 1+2=3. "yes"');
  });
});
