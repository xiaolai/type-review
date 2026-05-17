import { describe, expect, it } from "vitest";
import { analyzeText, makePassage } from "./analyze";

describe("analyzeText", () => {
  it("counts letters and ignores spaces, digits and punctuation", () => {
    const { keyHistogram, letterCount } = analyzeText("ab, c 12 a!");
    expect(keyHistogram).toEqual({ a: 2, b: 1, c: 1 });
    expect(letterCount).toBe(4);
  });

  it("lowercases letters before counting", () => {
    const { keyHistogram, letterCount } = analyzeText("AaA");
    expect(keyHistogram).toEqual({ a: 3 });
    expect(letterCount).toBe(3);
  });

  it("handles text with no letters", () => {
    expect(analyzeText("123 !!!")).toEqual({ keyHistogram: {}, letterCount: 0 });
  });
});

describe("makePassage", () => {
  it("builds a tagged passage and preserves the original text", () => {
    const passage = makePassage("p1", "The cat.");
    expect(passage.id).toBe("p1");
    expect(passage.text).toBe("The cat.");
    expect(passage.letterCount).toBe(6);
    expect(passage.keyHistogram).toEqual({ t: 2, h: 1, e: 1, c: 1, a: 1 });
  });

  it("rejects empty text", () => {
    expect(() => makePassage("p", "")).toThrow();
  });
});
