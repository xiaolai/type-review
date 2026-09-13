import { describe, expect, it } from "vitest";
import { inferFileKind, parseFile } from "./parse-text";
import { sanitize } from "./sanitize";

describe("inferFileKind", () => {
  it("reads the extension, in any case", () => {
    expect(inferFileKind("notes.MD")).toBe("md");
    expect(inferFileKind("notes.markdown")).toBe("md");
    expect(inferFileKind("notes.txt")).toBe("txt");
    expect(inferFileKind("md")).toBe("txt");
  });
});

describe("parseFile", () => {
  // The Library cleans what this returns, once, and reports what that pass
  // removed. So this must not clean: cleaned text has nothing left to remove,
  // and the note would say nothing was lost from a file full of emoji.
  const raw = "# Title \u{1F600}\n\n**bold** text 中文";

  it("strips Markdown and leaves cleaning, and its count, to the caller", async () => {
    const text = await parseFile(new File([raw], "notes.md"));
    expect(text).not.toContain("*");
    expect(sanitize(text).droppedChars).toBe(3);
  });

  it("returns a text file exactly as written", async () => {
    const text = await parseFile(new File([raw], "notes.txt"));
    expect(text).toBe(raw);
    expect(sanitize(text).droppedChars).toBe(3);
  });
});
