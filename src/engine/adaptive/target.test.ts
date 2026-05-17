import { describe, expect, it } from "vitest";
import { Target } from "./target";

describe("Target", () => {
  it("rejects a non-positive target speed", () => {
    expect(() => new Target(0)).toThrow();
    expect(() => new Target(-10)).toThrow();
  });

  it("converts WPM to milliseconds per character", () => {
    // 50 WPM = 250 chars/min = 240 ms/char.
    expect(new Target(50).timePerChar).toBe(240);
  });

  it("reports confidence as targetTime / actualTime", () => {
    const target = new Target(50); // 240 ms/char
    expect(target.confidence(240)).toBe(1);
    expect(target.confidence(480)).toBe(0.5);
    expect(target.confidence(120)).toBe(2);
  });

  it("returns null confidence when timing is unknown or invalid", () => {
    const target = new Target(50);
    expect(target.confidence(null)).toBeNull();
    expect(target.confidence(0)).toBeNull();
  });
});
