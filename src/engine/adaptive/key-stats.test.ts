import { describe, expect, it } from "vitest";
import { buildBigramStatsMap, deriveKeyStats } from "./key-stats";
import type { BigramHit, Histogram } from "./types";

// EmaFilter has its own dedicated test file (`ema.test.ts`).

function hit(timeToType: number, hitCount = 5, missCount = 0): BigramHit {
  return { hitCount, missCount, timeToType };
}

describe("buildBigramStatsMap", () => {
  it("returns an empty map when no runs have been recorded", () => {
    const map = buildBigramStatsMap([]);
    expect(map.size).toBe(0);
  });

  it("accumulates hit/miss totals for each bigram across runs", () => {
    const runs: Histogram[] = [
      new Map([["ab", hit(200, 5, 1)]]),
      new Map([["ab", hit(180, 3, 0)]]),
    ];
    const map = buildBigramStatsMap(runs);
    expect(map.get("ab")).toMatchObject({ hitCount: 8, missCount: 1 });
    expect(map.get("ab")?.samples).toHaveLength(2);
  });

  it("tracks the EMA and best-ever timing per bigram", () => {
    const runs: Histogram[] = [
      new Map([["ab", hit(200)]]),
      new Map([["ab", hit(100)]]), // improvement
      new Map([["ab", hit(300)]]), // regression
    ];
    const map = buildBigramStatsMap(runs);
    const ab = map.get("ab");
    // EMA: 200 → 190 → 201
    expect(ab?.timeToType).toBeCloseTo(201, 5);
    // Best is the lowest EMA value seen along the way (190), not the lowest raw sample.
    expect(ab?.bestTimeToType).toBeCloseTo(190, 5);
  });

  it("ignores zero-timing hits for the EMA but still counts them as hits", () => {
    const runs: Histogram[] = [new Map([["ab", hit(0, 4, 0)]])];
    const map = buildBigramStatsMap(runs);
    expect(map.get("ab")).toMatchObject({
      hitCount: 4,
      timeToType: null,
      bestTimeToType: null,
    });
  });

  it("emits an entry for every distinct bigram seen in any run", () => {
    const runs: Histogram[] = [
      new Map([
        ["ab", hit(200)],
        ["cd", hit(150)],
      ]),
      new Map([["ef", hit(100)]]),
    ];
    const map = buildBigramStatsMap(runs);
    expect([...map.keys()].sort()).toEqual(["ab", "cd", "ef"]);
  });
});

describe("deriveKeyStats", () => {
  it("returns an entry for every letter, with null timings when unpractised", () => {
    const stats = deriveKeyStats(["a", "b", "c"], new Map());
    expect([...stats.keys()]).toEqual(["a", "b", "c"]);
    for (const key of ["a", "b", "c"] as const) {
      expect(stats.get(key)).toMatchObject({
        hitCount: 0,
        missCount: 0,
        timeToType: null,
        bestTimeToType: null,
      });
    }
  });

  it("aggregates bigrams ending in each letter (second character)", () => {
    // For letter 'b': bigrams "ab" and "cb" end in b; "ba" does not.
    const bigramStats = new Map([
      [
        "ab",
        {
          bigram: "ab",
          samples: [],
          hitCount: 10,
          missCount: 0,
          timeToType: 200,
          bestTimeToType: 200,
        },
      ],
      [
        "cb",
        {
          bigram: "cb",
          samples: [],
          hitCount: 10,
          missCount: 0,
          timeToType: 300,
          bestTimeToType: 300,
        },
      ],
      [
        "ba",
        {
          bigram: "ba",
          samples: [],
          hitCount: 10,
          missCount: 0,
          timeToType: 100,
          bestTimeToType: 100,
        },
      ],
    ]);
    const stats = deriveKeyStats(["a", "b", "c"], bigramStats);
    // b's timeToType is the hit-weighted mean of 200 and 300, both 10 hits → 250.
    expect(stats.get("b")?.timeToType).toBeCloseTo(250, 5);
    // a's timeToType comes only from "ba" → 100.
    expect(stats.get("a")?.timeToType).toBeCloseTo(100, 5);
    // c has no bigrams ending in c → null.
    expect(stats.get("c")?.timeToType).toBeNull();
  });

  it("counts hits/misses across all bigrams ending in the letter", () => {
    const bigramStats = new Map([
      [
        "ab",
        {
          bigram: "ab",
          samples: [],
          hitCount: 5,
          missCount: 1,
          timeToType: null,
          bestTimeToType: null,
        },
      ],
      [
        "cb",
        {
          bigram: "cb",
          samples: [],
          hitCount: 3,
          missCount: 0,
          timeToType: null,
          bestTimeToType: null,
        },
      ],
    ]);
    const stats = deriveKeyStats(["b"], bigramStats);
    expect(stats.get("b")).toMatchObject({ hitCount: 8, missCount: 1 });
  });
});
