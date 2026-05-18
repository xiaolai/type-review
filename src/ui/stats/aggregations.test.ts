import { describe, expect, it } from "vitest";
import type { RunResult } from "../../engine/session";
import {
  aggregatePerKey,
  byChannel,
  channelOf,
  dailyCounts,
  slowestBigrams,
  streak,
  topRuns,
  wpmDistribution,
} from "./aggregations";

function makeResult(opts: {
  index: number;
  timestamp: number;
  netWpm: number;
  passageId?: string;
  histogram?: Array<[string, { hitCount: number; missCount: number; timeToType: number }]>;
}): RunResult {
  return {
    index: opts.index,
    mode: "benchmark",
    timestamp: opts.timestamp,
    passageId: opts.passageId ?? "q-test",
    text: "test text",
    metrics: {
      netWpm: opts.netWpm,
      rawWpm: opts.netWpm + 2,
      accuracy: 95,
      consistency: 80,
      wpmStdDev: 0,
      wpmSeries: [],
      correctChars: 100,
      incorrectChars: 5,
      durationMs: 30_000,
    },
    histogram: new Map(opts.histogram ?? []),
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

describe("aggregatePerKey", () => {
  it("aggregates by the SECOND character of each bigram, weighted by hits", () => {
    const results = [
      makeResult({
        index: 0,
        timestamp: 0,
        netWpm: 50,
        histogram: [
          ["th", { hitCount: 10, missCount: 0, timeToType: 100 }],
          ["sh", { hitCount: 5, missCount: 1, timeToType: 200 }],
        ],
      }),
      makeResult({
        index: 1,
        timestamp: 0,
        netWpm: 50,
        histogram: [["th", { hitCount: 5, missCount: 0, timeToType: 140 }]],
      }),
    ];
    const stats = aggregatePerKey(results);
    // 'h' is second char in both 'th' (×10 ×100 + ×5 ×140) and 'sh' (×5 ×200)
    const h = stats.get("h");
    expect(h).toBeDefined();
    expect(h?.hits).toBe(20);
    expect(h?.misses).toBe(1);
    // Weighted mean ms: (10*100 + 5*140 + 5*200) / 20 = (1000+700+1000)/20 = 135
    expect(h?.avgMs).toBeCloseTo(135, 1);
    // error rate: misses / hits where hitCount is total attempts (typos
    // included) — 1 / 20 = 0.05. Not 1 / (hits + misses) — that double-counts
    // the miss because the histogram already counted it in hitCount.
    expect(h?.errorRate).toBeCloseTo(1 / 20, 3);
  });

  it("returns an empty map for empty input", () => {
    expect(aggregatePerKey([]).size).toBe(0);
  });
});

describe("slowestBigrams", () => {
  it("returns top N bigrams by avgMs, dropping rare ones", () => {
    const results = [
      makeResult({
        index: 0,
        timestamp: 0,
        netWpm: 50,
        histogram: [
          ["aa", { hitCount: 100, missCount: 0, timeToType: 80 }], // fast, plenty of hits
          ["bb", { hitCount: 100, missCount: 0, timeToType: 240 }], // slow, plenty
          ["cc", { hitCount: 100, missCount: 0, timeToType: 160 }],
          ["xx", { hitCount: 2, missCount: 0, timeToType: 999 }], // outlier — should be dropped
        ],
      }),
    ];
    const top = slowestBigrams(results, 3);
    expect(top.map((b) => b.bigram)).toEqual(["bb", "cc", "aa"]);
    expect(top.every((b) => b.hits >= 5)).toBe(true);
  });
});

describe("streak", () => {
  // Use a fixed local-midnight anchor so the test is timezone-stable.
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const now = today.getTime();

  it("returns 0/0 for an empty profile", () => {
    expect(streak([], now)).toEqual({ current: 0, longest: 0 });
  });

  it("counts today + the run of consecutive days ending at today", () => {
    const results = [0, 1, 2, 3].map((d) =>
      makeResult({ index: d, timestamp: now - d * DAY_MS, netWpm: 50 }),
    );
    expect(streak(results, now)).toEqual({ current: 4, longest: 4 });
  });

  it("tolerates the user not having typed yet today (uses yesterday as the end)", () => {
    const results = [1, 2, 3].map((d) =>
      makeResult({ index: d, timestamp: now - d * DAY_MS, netWpm: 50 }),
    );
    expect(streak(results, now)).toEqual({ current: 3, longest: 3 });
  });

  it("resets the current streak when there's a multi-day gap", () => {
    // Sessions: 5 days ago, 4 days ago, then 0 days ago (today).
    const results = [
      makeResult({ index: 0, timestamp: now - 5 * DAY_MS, netWpm: 50 }),
      makeResult({ index: 1, timestamp: now - 4 * DAY_MS, netWpm: 50 }),
      makeResult({ index: 2, timestamp: now, netWpm: 50 }),
    ];
    // current = 1 (just today); longest = 2 (5-and-4-days-ago)
    expect(streak(results, now)).toEqual({ current: 1, longest: 2 });
  });
});

describe("topRuns", () => {
  it("returns the top N by netWpm, breaking ties by recency", () => {
    const results = [
      makeResult({ index: 0, timestamp: 1000, netWpm: 50 }),
      makeResult({ index: 1, timestamp: 2000, netWpm: 80 }),
      makeResult({ index: 2, timestamp: 3000, netWpm: 70 }),
      makeResult({ index: 3, timestamp: 4000, netWpm: 80 }), // newer tie with 80
    ];
    const top = topRuns(results, 3);
    expect(top.map((r) => r.index)).toEqual([3, 1, 2]); // 3 (newest 80) > 1 (older 80) > 2 (70)
  });

  it("returns the full list if N exceeds it", () => {
    const results = [makeResult({ index: 0, timestamp: 0, netWpm: 50 })];
    expect(topRuns(results, 10)).toHaveLength(1);
  });
});

describe("channelOf", () => {
  it("classifies by id prefix", () => {
    expect(channelOf("q-twain-1")).toBe("quote");
    expect(channelOf("code-fizzbuzz-py")).toBe("code");
    expect(channelOf("pseudo:foo")).toBe("drills");
    expect(channelOf("difficult:bar")).toBe("difficult");
    expect(channelOf("u-12345")).toBe("user");
    expect(channelOf("mystery-id")).toBe("unknown");
    // `plain:` is the generic-benchmark-fallback prefix — emitted by
    // Session's default benchmarkSource and the session-adapter's
    // null-pick fallback. Not a curated channel, so → unknown.
    expect(channelOf("plain:bar")).toBe("unknown");
  });
});

describe("byChannel", () => {
  it("buckets results and computes avg + best per channel", () => {
    const results = [
      makeResult({ index: 0, timestamp: 0, netWpm: 60, passageId: "q-a" }),
      makeResult({ index: 1, timestamp: 0, netWpm: 70, passageId: "q-b" }),
      makeResult({ index: 2, timestamp: 0, netWpm: 80, passageId: "q-c" }),
      makeResult({ index: 3, timestamp: 0, netWpm: 40, passageId: "code-x" }),
    ];
    const out = byChannel(results);
    // Sorted by count desc — quote first (3), then code (1).
    expect(out[0]?.channel).toBe("quote");
    expect(out[0]?.count).toBe(3);
    expect(out[0]?.avgWpm).toBeCloseTo(70, 1);
    expect(out[0]?.bestWpm).toBe(80);
    expect(out[1]?.channel).toBe("code");
    expect(out[1]?.bestWpm).toBe(40);
  });
});

describe("wpmDistribution", () => {
  it("builds inclusive bins flat-bottomed between min/max", () => {
    const results = [40, 41, 47, 52, 58, 60].map((w, i) =>
      makeResult({ index: i, timestamp: 0, netWpm: w }),
    );
    const bins = wpmDistribution(results, 5);
    // lo = floor(40/5)*5 = 40; hi = ceil(60.001/5)*5 = 65; bins floors: 40,45,50,55,60
    expect(bins.map((b) => b.floor)).toEqual([40, 45, 50, 55, 60]);
    // counts: [40,41]=2; [47]=1; [52]=1; [58]=1; [60]=1
    expect(bins.map((b) => b.count)).toEqual([2, 1, 1, 1, 1]);
  });

  it("returns [] for empty input", () => {
    expect(wpmDistribution([], 5)).toEqual([]);
  });
});

describe("dailyCounts", () => {
  it("counts sessions per local-day", () => {
    const today = new Date();
    today.setHours(12);
    const now = today.getTime();
    const results = [
      makeResult({ index: 0, timestamp: now, netWpm: 50 }),
      makeResult({ index: 1, timestamp: now + 60_000, netWpm: 50 }),
      makeResult({ index: 2, timestamp: now - DAY_MS, netWpm: 50 }),
    ];
    const counts = dailyCounts(results);
    expect(counts.size).toBe(2);
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(3);
  });
});
