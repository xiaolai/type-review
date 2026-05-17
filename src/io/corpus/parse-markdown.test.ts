import { describe, expect, it } from "vitest";
import { parseMarkdown } from "./parse-markdown";

describe("parseMarkdown", () => {
  it("passes plain prose through after sanitisation", () => {
    expect(parseMarkdown("Hello, world.")).toBe("Hello, world.");
  });

  it("strips ATX heading markers, keeps heading text", () => {
    expect(parseMarkdown("# Title\n## Subhead\nbody")).toBe("Title Subhead body");
  });

  it("strips blockquote markers", () => {
    expect(parseMarkdown("> first\n> second\nthird")).toBe("first second third");
  });

  it("strips unordered list markers", () => {
    expect(parseMarkdown("- alpha\n* beta\n+ gamma")).toBe("alpha beta gamma");
  });

  it("converts links to their text", () => {
    expect(parseMarkdown("See [the docs](https://example.com) for details.")).toBe(
      "See the docs for details.",
    );
  });

  it("drops images entirely (alt text + url)", () => {
    expect(parseMarkdown("Before ![alt](img.png) after")).toBe("Before after");
  });

  it("drops emphasis markers, keeps text", () => {
    expect(parseMarkdown("**bold** and *italic* and ~~strike~~ and __also__ and _too_")).toBe(
      "bold and italic and strike and also and too",
    );
  });

  it("drops inline code backticks, keeps contents", () => {
    expect(parseMarkdown("call `foo()` then")).toBe("call foo() then");
  });

  it("drops fenced code blocks entirely (paragraph break preserved)", () => {
    // marked renders the surrounding text as separate block-level
    // paragraphs once the fenced code is dropped — sanitize preserves
    // the blank line between them as `\n\n`.
    expect(parseMarkdown("Before\n```js\nconst x = 1;\n```\nAfter")).toBe("Before\n\nAfter");
  });

  it("drops horizontal rule lines (paragraph break preserved)", () => {
    expect(parseMarkdown("Before\n---\nAfter")).toBe("Before\n\nAfter");
  });

  it("drops leftover HTML tags", () => {
    expect(parseMarkdown('Inline <span class="x">marked</span> text')).toBe("Inline marked text");
  });

  it("applies sanitize: trim, collapse inline whitespace, keep blank lines", () => {
    expect(parseMarkdown("  a   b\n\nc  ")).toBe("a b\n\nc");
  });
});
