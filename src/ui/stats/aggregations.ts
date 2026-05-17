/**
 * Pure data transforms for the Stats page. All in one place so the
 * page stays declarative — each panel just reads what it needs from
 * the result of one of these functions.
 *
 * Every function is total (handles empty input), deterministic, and
 * side-effect-free. All inputs are `readonly RunResult[]`; we never
 * mutate the caller's array.
 */

import type { BigramHit, Histogram } from "../../engine/adaptive";
import type { RunResult } from "../../engine/session";
import type { ChannelName } from "../../io";
import { classifyPassageId } from "../../io";

/** Aggregated per-character stats across many runs. */
export interface PerKeyStat {
  /** Total times this character was the *second* key of a bigram (i.e. typed
   * with a measurable inter-key interval). */
  hits: number;
  /** Total misses producing this character as the second key. */
  misses: number;
  /** Hit-weighted mean inter-key time (ms) — 0 means no timing data. */
  avgMs: number;
  /** Error rate as a fraction of total attempts (0..1). */
  errorRate: number;
}

/**
 * Aggregate per-character stats by reducing the per-bigram histograms.
 * Each bigram contributes to the SECOND character's stats — that's the
 * keystroke whose timing the engine actually measures.
 */
export function aggregatePerKey(results: readonly RunResult[]): Map<string, PerKeyStat> {
  const acc = new Map<string, { hits: number; misses: number; weightedMs: number }>();
  for (const r of results) {
    for (const [bg, hit] of r.histogram as Histogram) {
      if (bg.length < 2) continue;
      const second = bg[1] ?? "";
      if (!second) continue;
      const cur = acc.get(second) ?? { hits: 0, misses: 0, weightedMs: 0 };
      cur.hits += hit.hitCount;
      cur.misses += hit.missCount;
      cur.weightedMs += hit.hitCount * hit.timeToType;
      acc.set(second, cur);
    }
  }
  const out = new Map<string, PerKeyStat>();
  for (const [k, v] of acc) {
    const attempts = v.hits + v.misses;
    out.set(k, {
      hits: v.hits,
      misses: v.misses,
      avgMs: v.hits > 0 ? v.weightedMs / v.hits : 0,
      errorRate: attempts > 0 ? v.misses / attempts : 0,
    });
  }
  return out;
}

/** One row of the slowest-bigrams panel. */
export interface BigramStat {
  bigram: string;
  hits: number;
  misses: number;
  avgMs: number;
}

/**
 * Aggregate per-bigram stats across runs and return the top N by
 * avg ms (slowest first). Bigrams with fewer than `minHits` total
 * are dropped — a single slow attempt on a rare bigram is noise,
 * not signal.
 */
export function slowestBigrams(
  results: readonly RunResult[],
  n: number,
  minHits = 5,
): BigramStat[] {
  const acc = new Map<string, { hits: number; misses: number; weightedMs: number }>();
  for (const r of results) {
    for (const [bg, hit] of r.histogram as Histogram) {
      const cur = acc.get(bg) ?? { hits: 0, misses: 0, weightedMs: 0 };
      cur.hits += hit.hitCount;
      cur.misses += hit.missCount;
      cur.weightedMs += hit.hitCount * hit.timeToType;
      acc.set(bg, cur);
    }
  }
  const list: BigramStat[] = [];
  for (const [bg, v] of acc) {
    if (v.hits < minHits) continue;
    list.push({
      bigram: bg,
      hits: v.hits,
      misses: v.misses,
      avgMs: v.weightedMs / v.hits,
    });
  }
  list.sort((a, b) => b.avgMs - a.avgMs);
  return list.slice(0, n);
}

/**
 * Format an epoch ms timestamp to a YYYY-MM-DD string in *local* time.
 * Used as the key for daily aggregation — "session on Monday" is a
 * local concept, not UTC.
 */
export function dayKey(timestamp: number): string {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Sessions per local-day across the result set. */
export function dailyCounts(results: readonly RunResult[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of results) {
    const k = dayKey(r.timestamp);
    out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

/** Returns the local-day key for a date offset from `anchor` by `daysBack`. */
export function dayKeyBack(anchor: number, daysBack: number): string {
  // Use calendar-day subtraction (setDate handles month/year rollover)
  // rather than fixed 24-hour milliseconds: across a daylight-saving
  // boundary one calendar day is 23 or 25 hours, so `anchor - N*86400e3`
  // can land on the wrong calendar day.
  const d = new Date(anchor);
  d.setDate(d.getDate() - daysBack);
  return dayKey(d.getTime());
}

export interface StreakStat {
  /**
   * Days in a row ending at the most recent qualifying day (today if
   * the user typed today, otherwise the most recent practice day —
   * but only if it was yesterday, to not give credit for old streaks).
   */
  current: number;
  /** Longest run of consecutive days with at least one session. */
  longest: number;
}

/**
 * Compute current and longest streaks of consecutive practice days.
 * "Day" = local calendar day (see `dayKey`). The current streak
 * tolerates the user not having typed yet *today* — so checking the
 * page at 9am after a 12-day streak that ran through yesterday still
 * shows 12, not 0. But the streak resets if there's a gap of one full
 * day or more.
 */
export function streak(results: readonly RunResult[], now: number = Date.now()): StreakStat {
  if (results.length === 0) return { current: 0, longest: 0 };
  const days = new Set<string>();
  for (const r of results) days.add(dayKey(r.timestamp));

  // Longest streak — sweep all unique days in order.
  const sorted = [...days].sort();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (!prev || !cur) continue;
    // Compare dates by adding one day to `prev` and checking equality.
    if (addOneDay(prev) === cur) {
      run++;
      if (run > longest) longest = run;
    } else {
      run = 1;
    }
  }

  // Current streak — walk backwards from today; tolerate skipping today.
  const today = dayKey(now);
  const yesterday = dayKeyBack(now, 1);
  let cursor = days.has(today) ? today : days.has(yesterday) ? yesterday : null;
  let current = 0;
  while (cursor !== null && days.has(cursor)) {
    current++;
    cursor = subOneDay(cursor);
  }

  return { current, longest };
}

function addOneDay(dayKeyStr: string): string {
  const parts = dayKeyStr.split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + 1);
  return dayKey(date.getTime());
}

function subOneDay(dayKeyStr: string): string {
  const parts = dayKeyStr.split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 1);
  return dayKey(date.getTime());
}

/** Top N runs by net WPM (ties broken by recency). */
export function topRuns(results: readonly RunResult[], n: number): RunResult[] {
  return [...results]
    .sort((a, b) => {
      if (b.metrics.netWpm !== a.metrics.netWpm) return b.metrics.netWpm - a.metrics.netWpm;
      return b.timestamp - a.timestamp;
    })
    .slice(0, n);
}

/**
 * Source channel classification from a passage id. Re-exported from
 * channel-meta to keep all channel knowledge in one file. `"auto"` is
 * not reachable here (no passage is ever tagged `auto:`); the only
 * extra bucket beyond `ChannelName` is `"unknown"` for generic
 * benchmark-fallback passages (`plain:...`) and pre-rename history.
 */
export type ChannelTag = ChannelName | "unknown";

export function channelOf(passageId: string): ChannelTag {
  return classifyPassageId(passageId);
}

export interface ChannelAggregate {
  channel: ChannelTag;
  count: number;
  avgWpm: number;
  bestWpm: number;
}

/**
 * Standard touch-typing finger assignment for a US QWERTY layout. Maps
 * each letter to its responsible finger. Numbers and rarely-used keys
 * are intentionally omitted — the panel below filters to known letters.
 */
export type Finger =
  | "left-pinky"
  | "left-ring"
  | "left-middle"
  | "left-index"
  | "right-index"
  | "right-middle"
  | "right-ring"
  | "right-pinky"
  | "thumb";

const FINGER_MAP: Readonly<Record<string, Finger>> = {
  q: "left-pinky",
  a: "left-pinky",
  z: "left-pinky",
  w: "left-ring",
  s: "left-ring",
  x: "left-ring",
  e: "left-middle",
  d: "left-middle",
  c: "left-middle",
  r: "left-index",
  f: "left-index",
  v: "left-index",
  t: "left-index",
  g: "left-index",
  b: "left-index",
  y: "right-index",
  h: "right-index",
  n: "right-index",
  u: "right-index",
  j: "right-index",
  m: "right-index",
  i: "right-middle",
  k: "right-middle",
  ",": "right-middle",
  o: "right-ring",
  l: "right-ring",
  ".": "right-ring",
  p: "right-pinky",
  ";": "right-pinky",
  "/": "right-pinky",
  "'": "right-pinky",
  " ": "thumb",
};

export interface FingerStat {
  finger: Finger;
  hits: number;
  avgMs: number;
  errorRate: number;
}

const FINGER_ORDER: readonly Finger[] = [
  "left-pinky",
  "left-ring",
  "left-middle",
  "left-index",
  "thumb",
  "right-index",
  "right-middle",
  "right-ring",
  "right-pinky",
];

const FINGER_LABELS: Readonly<Record<Finger, string>> = {
  "left-pinky": "L pinky",
  "left-ring": "L ring",
  "left-middle": "L middle",
  "left-index": "L index",
  thumb: "thumb",
  "right-index": "R index",
  "right-middle": "R middle",
  "right-ring": "R ring",
  "right-pinky": "R pinky",
};

export function labelForFinger(f: Finger): string {
  return FINGER_LABELS[f];
}

/**
 * Bucket per-key stats into per-finger aggregates. Builds on top of
 * `aggregatePerKey` — same data, regrouped. Surfaces the "your right
 * pinky is the slowest" pattern that per-key heatmap alone makes the
 * reader assemble in their head.
 */
export function aggregatePerFinger(perKey: ReadonlyMap<string, PerKeyStat>): FingerStat[] {
  const acc = new Map<Finger, { hits: number; misses: number; weightedMs: number }>();
  for (const [ch, stat] of perKey) {
    const finger = FINGER_MAP[ch];
    if (finger === undefined) continue;
    const cur = acc.get(finger) ?? { hits: 0, misses: 0, weightedMs: 0 };
    cur.hits += stat.hits;
    cur.misses += stat.misses;
    cur.weightedMs += stat.hits * stat.avgMs;
    acc.set(finger, cur);
  }
  const out: FingerStat[] = [];
  for (const finger of FINGER_ORDER) {
    const v = acc.get(finger);
    if (v === undefined || v.hits === 0) continue;
    out.push({
      finger,
      hits: v.hits,
      avgMs: v.weightedMs / v.hits,
      errorRate: v.misses / (v.hits + v.misses),
    });
  }
  return out;
}

/**
 * Word-frequency report: across all runs, how many times did the typist
 * complete each whole word? Sorted by count desc, capped to `topN`.
 * Built from `RunResult.text` + per-result completion (we don't have
 * per-word timing, so this is a frequency-only view).
 */
export function topWords(
  results: readonly RunResult[],
  topN = 10,
): Array<{ word: string; count: number }> {
  const counts = new Map<string, number>();
  for (const r of results) {
    // Count only the typed prefix. Time-mode benchmark runs store a
    // deliberately over-long passage (sized so even a 250-WPM hero
    // doesn't exhaust it); counting the whole `text` would inflate
    // every quote/word with text the user never reached.
    const typedChars = r.metrics.correctChars + r.metrics.incorrectChars;
    const typedText = r.text.slice(0, typedChars);
    const words = typedText.split(/\s+/);
    for (const w of words) {
      const clean = w.toLowerCase().replace(/[^a-z']/g, "");
      if (clean.length === 0) continue;
      counts.set(clean, (counts.get(clean) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
}

/** Achievement-style milestones; each fires once when the condition first holds. */
export interface Milestone {
  id: string;
  label: string;
  /** True iff the milestone has been reached given the current profile. */
  reached: boolean;
}

/**
 * Milestones that became reached as a result of the most recent run.
 * Equivalent to diffing `milestones(results)` against
 * `milestones(results.slice(0, -1))`. Used by the Results banner to
 * congratulate the typist exactly once per achievement.
 */
export function newlyReached(results: readonly RunResult[]): Milestone[] {
  if (results.length === 0) return [];
  const after = milestones(results);
  const before = new Map(milestones(results.slice(0, -1)).map((m) => [m.id, m.reached]));
  return after.filter((m) => m.reached && before.get(m.id) !== true);
}

export function milestones(results: readonly RunResult[]): Milestone[] {
  let bestWpm = 0;
  let totalChars = 0;
  for (const r of results) {
    if (r.metrics.netWpm > bestWpm) bestWpm = r.metrics.netWpm;
    totalChars += r.metrics.correctChars;
  }
  const sessions = results.length;
  return [
    { id: "first", label: "first run", reached: sessions >= 1 },
    { id: "wpm30", label: "30 wpm", reached: bestWpm >= 30 },
    { id: "wpm50", label: "50 wpm", reached: bestWpm >= 50 },
    { id: "wpm70", label: "70 wpm", reached: bestWpm >= 70 },
    { id: "wpm100", label: "100 wpm", reached: bestWpm >= 100 },
    { id: "sessions10", label: "10 sessions", reached: sessions >= 10 },
    { id: "sessions50", label: "50 sessions", reached: sessions >= 50 },
    { id: "sessions100", label: "100 sessions", reached: sessions >= 100 },
    { id: "chars1k", label: "1k characters", reached: totalChars >= 1_000 },
    { id: "chars10k", label: "10k characters", reached: totalChars >= 10_000 },
    { id: "chars100k", label: "100k characters", reached: totalChars >= 100_000 },
  ];
}

/** Avg + best WPM bucketed by source channel. */
export function byChannel(results: readonly RunResult[]): ChannelAggregate[] {
  const buckets = new Map<ChannelTag, { sum: number; best: number; count: number }>();
  for (const r of results) {
    const tag = channelOf(r.passageId);
    const cur = buckets.get(tag) ?? { sum: 0, best: 0, count: 0 };
    cur.sum += r.metrics.netWpm;
    if (r.metrics.netWpm > cur.best) cur.best = r.metrics.netWpm;
    cur.count++;
    buckets.set(tag, cur);
  }
  const out: ChannelAggregate[] = [];
  for (const [channel, v] of buckets) {
    out.push({
      channel,
      count: v.count,
      avgWpm: v.count > 0 ? v.sum / v.count : 0,
      bestWpm: v.best,
    });
  }
  // Display order — most-typed first so the page isn't dictated by
  // alphabetical accidents of the tag names.
  out.sort((a, b) => b.count - a.count);
  return out;
}

export interface WpmBin {
  /** Lower bound of the bin (inclusive). E.g. 40 means "40 ≤ wpm < 45". */
  floor: number;
  count: number;
}

/**
 * Build a WPM distribution histogram. Bins span from `binSize *
 * floor(minWpm / binSize)` to `binSize * ceil(maxWpm / binSize)`,
 * inclusive of every empty bucket in between — flat-bottoming the
 * x-axis makes the shape easier to read than a sparse list.
 */
export function wpmDistribution(results: readonly RunResult[], binSize = 5): WpmBin[] {
  if (results.length === 0) return [];
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const r of results) {
    if (r.metrics.netWpm < min) min = r.metrics.netWpm;
    if (r.metrics.netWpm > max) max = r.metrics.netWpm;
  }
  const lo = Math.floor(min / binSize) * binSize;
  const hi = Math.ceil((max + 0.001) / binSize) * binSize;
  const bins: WpmBin[] = [];
  for (let floor = lo; floor < hi; floor += binSize) {
    bins.push({ floor, count: 0 });
  }
  for (const r of results) {
    const idx = Math.floor((r.metrics.netWpm - lo) / binSize);
    const target = bins[idx];
    if (target) target.count++;
  }
  return bins;
}

export type { BigramHit }; // re-export for callers that don't depend on engine.
