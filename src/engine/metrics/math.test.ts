import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { kogasa, mean, roundTo2, stdDev } from "./math";

const finiteNumber = fc.double({
  min: -1e6,
  max: 1e6,
  noNaN: true,
  noDefaultInfinity: true,
});

describe("math helpers", () => {
  it("mean of empty / known sequences", () => {
    expect(mean([])).toBe(0);
    expect(mean([2, 4, 6])).toBe(4);
  });

  it("stdDev of empty / constant / known sequences", () => {
    expect(stdDev([])).toBe(0);
    expect(stdDev([5, 5, 5])).toBe(0);
    expect(stdDev([2, 4, 6])).toBeCloseTo(1.632993, 5);
  });

  it("roundTo2 truncates as expected (FP-stable inputs)", () => {
    expect(roundTo2(1.2345)).toBe(1.23);
    expect(roundTo2(1.236)).toBe(1.24);
    expect(roundTo2(150)).toBe(150);
  });
});

describe("kogasa", () => {
  it("is 100 at zero variation", () => {
    expect(kogasa(0)).toBe(100);
  });

  it("decreases monotonically and approaches 0 for large variation", () => {
    expect(kogasa(0.1)).toBeGreaterThan(kogasa(0.5));
    expect(kogasa(0.5)).toBeGreaterThan(kogasa(2));
    expect(kogasa(10)).toBeLessThan(1);
  });
});

describe("math properties", () => {
  describe("mean", () => {
    it("of a constant is that constant", () => {
      fc.assert(
        fc.property(finiteNumber, fc.integer({ min: 1, max: 100 }), (c, n) => {
          const xs = Array.from({ length: n }, () => c);
          expect(mean(xs)).toBeCloseTo(c, 5);
        }),
      );
    });

    it("is shift-equivariant: mean(xs + k) === mean(xs) + k", () => {
      fc.assert(
        fc.property(
          fc.array(finiteNumber, { minLength: 1, maxLength: 50 }),
          finiteNumber,
          (xs, k) => {
            const shifted = xs.map((x) => x + k);
            expect(mean(shifted)).toBeCloseTo(mean(xs) + k, 4);
          },
        ),
      );
    });

    it("lies in [min, max] for any non-empty input", () => {
      fc.assert(
        fc.property(fc.array(finiteNumber, { minLength: 1, maxLength: 50 }), (xs) => {
          const m = mean(xs);
          const lo = Math.min(...xs);
          const hi = Math.max(...xs);
          expect(m).toBeGreaterThanOrEqual(lo - 1e-6);
          expect(m).toBeLessThanOrEqual(hi + 1e-6);
        }),
      );
    });
  });

  describe("stdDev", () => {
    it("is non-negative", () => {
      fc.assert(
        fc.property(fc.array(finiteNumber, { maxLength: 50 }), (xs) => {
          expect(stdDev(xs)).toBeGreaterThanOrEqual(0);
        }),
      );
    });

    it("is zero for a constant array", () => {
      fc.assert(
        fc.property(finiteNumber, fc.integer({ min: 1, max: 50 }), (c, n) => {
          const xs = Array.from({ length: n }, () => c);
          expect(stdDev(xs)).toBeCloseTo(0, 5);
        }),
      );
    });

    it("is shift-invariant: stdDev(xs + k) === stdDev(xs)", () => {
      fc.assert(
        fc.property(
          fc.array(finiteNumber, { minLength: 2, maxLength: 50 }),
          finiteNumber,
          (xs, k) => {
            expect(stdDev(xs.map((x) => x + k))).toBeCloseTo(stdDev(xs), 4);
          },
        ),
      );
    });

    it("scales linearly with |k|: stdDev(xs * k) === |k| * stdDev(xs)", () => {
      fc.assert(
        fc.property(
          fc.array(finiteNumber, { minLength: 2, maxLength: 50 }),
          fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true }),
          (xs, k) => {
            expect(stdDev(xs.map((x) => x * k))).toBeCloseTo(Math.abs(k) * stdDev(xs), 3);
          },
        ),
      );
    });
  });

  describe("kogasa", () => {
    it("returns 100 at cov 0", () => {
      expect(kogasa(0)).toBe(100);
    });

    it("is monotonically decreasing on [0, infinity)", () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
          (a, b) => {
            if (a < b) {
              expect(kogasa(a)).toBeGreaterThanOrEqual(kogasa(b) - 1e-9);
            } else if (a > b) {
              expect(kogasa(a)).toBeLessThanOrEqual(kogasa(b) + 1e-9);
            }
          },
        ),
      );
    });

    it("stays within [0, 100] for any non-negative input", () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
          (cov) => {
            const v = kogasa(cov);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(100);
          },
        ),
      );
    });
  });

  describe("roundTo2", () => {
    it("is idempotent", () => {
      fc.assert(
        fc.property(finiteNumber, (x) => {
          expect(roundTo2(roundTo2(x))).toBeCloseTo(roundTo2(x), 5);
        }),
      );
    });
  });
});
