import { describe, expect, it } from "vitest";
import { EmaFilter } from "./ema";

describe("EmaFilter", () => {
  it("rejects an out-of-range alpha", () => {
    expect(() => new EmaFilter(0)).toThrow();
    expect(() => new EmaFilter(1.5)).toThrow();
    expect(() => new EmaFilter(-1)).toThrow();
  });

  it("rejects a non-finite alpha (NaN, Infinity)", () => {
    expect(() => new EmaFilter(Number.NaN)).toThrow();
    expect(() => new EmaFilter(Number.POSITIVE_INFINITY)).toThrow();
  });

  it("starts at null and emits the first sample as-is", () => {
    const f = new EmaFilter(0.1);
    expect(f.value).toBeNull();
    expect(f.add(100)).toBe(100);
    expect(f.value).toBe(100);
  });

  it("converges toward later samples with the given weight", () => {
    const f = new EmaFilter(0.1);
    f.add(100);
    expect(f.add(200)).toBeCloseTo(110, 5); // 100 + 0.1 * (200 - 100)
    expect(f.add(200)).toBeCloseTo(119, 5);
  });

  it("alpha=1 fully replaces with each sample (no smoothing)", () => {
    const f = new EmaFilter(1);
    f.add(100);
    expect(f.add(200)).toBe(200);
    expect(f.add(50)).toBe(50);
  });

  it("reaches a stable value when fed a constant", () => {
    const f = new EmaFilter(0.1);
    for (let i = 0; i < 100; i++) {
      f.add(42);
    }
    expect(f.value).toBeCloseTo(42, 5);
  });

  it("accepts alpha exactly at the boundary 1", () => {
    expect(() => new EmaFilter(1)).not.toThrow();
  });
});
