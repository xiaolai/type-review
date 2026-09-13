import { describe, expect, it } from "vitest";
import { cleaningNote } from "./cleaning-note";
import { MAX_PASSAGE_CHARS } from "./sanitize";

describe("cleaningNote", () => {
  it("says nothing when cleaning changed nothing worth saying", () => {
    expect(cleaningNote({ truncated: false, droppedChars: 0 })).toBeNull();
  });

  it("names the cap cleaning applied and how many characters it removed", () => {
    expect(cleaningNote({ truncated: true, droppedChars: 3 })).toBe(
      `truncated to ${MAX_PASSAGE_CHARS.toLocaleString()} chars, 3 unusable characters removed`,
    );
    expect(cleaningNote({ truncated: false, droppedChars: 1 })).toBe(
      "1 unusable characters removed",
    );
  });
});
