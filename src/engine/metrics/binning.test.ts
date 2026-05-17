import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { TextInput } from "../typing/text-input";
import type { Step } from "../typing/types";
import { binBySecond } from "./binning";

describe("binBySecond", () => {
  it("returns nothing for an empty run", () => {
    expect(binBySecond([])).toEqual([]);
  });

  it("buckets keystrokes into 1-second windows including empty middle seconds", () => {
    // 3 chars in second 0, none in second 1, 1 char in second 2.
    const ti = new TextInput("abcd");
    ti.appendChar("a", 1000);
    ti.appendChar("b", 1300);
    ti.appendChar("c", 1600);
    ti.appendChar("d", 3200);
    const bins = binBySecond(ti.steps);
    expect(bins.map((b) => b.chars)).toEqual([3, 0, 1]);
    expect(bins.map((b) => b.second)).toEqual([1, 2, 3]);
  });
});

describe("binBySecond properties", () => {
  const stepsGen = fc
    .array(
      fc.record({
        gap: fc.integer({ min: 0, max: 200 }),
        typo: fc.boolean(),
      }),
      { minLength: 1, maxLength: 40 },
    )
    .map((events): Step[] => {
      let t = 1000;
      return events.map((e, position) => {
        t += e.gap;
        return {
          position,
          timeStamp: t,
          typed: "a",
          expected: "a",
          timeToType: e.gap,
          typo: e.typo,
        };
      });
    });

  it("preserves total chars: sum(bin.chars) === steps.length", () => {
    fc.assert(
      fc.property(stepsGen, (steps) => {
        const bins = binBySecond(steps);
        const total = bins.reduce((sum, b) => sum + b.chars, 0);
        expect(total).toBe(steps.length);
      }),
    );
  });

  it("preserves total errors: sum(bin.errors) === typo count", () => {
    fc.assert(
      fc.property(stepsGen, (steps) => {
        const bins = binBySecond(steps);
        const totalErrors = bins.reduce((sum, b) => sum + b.errors, 0);
        const expectedErrors = steps.filter((s) => s.typo).length;
        expect(totalErrors).toBe(expectedErrors);
      }),
    );
  });

  it("each bin has 0 <= errors <= chars", () => {
    fc.assert(
      fc.property(stepsGen, (steps) => {
        for (const bin of binBySecond(steps)) {
          expect(bin.errors).toBeGreaterThanOrEqual(0);
          expect(bin.errors).toBeLessThanOrEqual(bin.chars);
        }
      }),
    );
  });
});
