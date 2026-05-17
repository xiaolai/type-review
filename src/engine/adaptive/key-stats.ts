import { EmaFilter } from "./ema";
import type { BigramSample, BigramStats, Histogram, KeyStats } from "./types";

/** EMA filter coefficient: each run moves the per-bigram estimate 10%. */
export const EMA_ALPHA = 0.1;

/**
 * Replays an ordered list of run histograms into per-bigram accumulated stats.
 * Runs must be supplied oldest-first; the EMA depends on order. Only bigrams
 * that have appeared in at least one run get an entry — the planner derives
 * per-letter stats from this map, so it doesn't need an entry per possible
 * bigram (~676 for a 26-letter alphabet).
 */
export function buildBigramStatsMap(runs: readonly Histogram[]): Map<string, BigramStats> {
  const samples = new Map<string, BigramSample[]>();
  const filters = new Map<string, EmaFilter>();
  const totals = new Map<string, { hit: number; miss: number }>();
  const best = new Map<string, number>();

  const sampleListOf = (bigram: string): BigramSample[] => {
    let list = samples.get(bigram);
    if (list === undefined) {
      list = [];
      samples.set(bigram, list);
    }
    return list;
  };
  const filterOf = (bigram: string): EmaFilter => {
    let filter = filters.get(bigram);
    if (filter === undefined) {
      filter = new EmaFilter(EMA_ALPHA);
      filters.set(bigram, filter);
    }
    return filter;
  };
  const totalOf = (bigram: string): { hit: number; miss: number } => {
    let total = totals.get(bigram);
    if (total === undefined) {
      total = { hit: 0, miss: 0 };
      totals.set(bigram, total);
    }
    return total;
  };

  runs.forEach((histogram, runIndex) => {
    for (const [bigram, hit] of histogram) {
      sampleListOf(bigram).push({
        runIndex,
        hitCount: hit.hitCount,
        missCount: hit.missCount,
        timeToType: hit.timeToType,
      });
      const total = totalOf(bigram);
      total.hit += hit.hitCount;
      total.miss += hit.missCount;
      if (hit.timeToType > 0) {
        const filtered = filterOf(bigram).add(hit.timeToType);
        const prevBest = best.get(bigram);
        if (prevBest === undefined || filtered < prevBest) {
          best.set(bigram, filtered);
        }
      }
    }
  });

  const result = new Map<string, BigramStats>();
  // Union of every bigram seen across all runs.
  const seen = new Set<string>();
  for (const histogram of runs) {
    for (const bigram of histogram.keys()) seen.add(bigram);
  }
  for (const bigram of seen) {
    const total = totalOf(bigram);
    result.set(bigram, {
      bigram,
      samples: sampleListOf(bigram),
      hitCount: total.hit,
      missCount: total.miss,
      timeToType: filterOf(bigram).value,
      bestTimeToType: best.get(bigram) ?? null,
    });
  }
  return result;
}

/**
 * Projects per-bigram stats onto a per-letter view, weighted by hit count.
 *
 * For each letter L, we collect every bigram whose **second** character is L
 * (because that bigram's timing is the time-to-type-L-given-the-previous-key).
 * The letter's `timeToType` is the hit-weighted average of those bigrams'
 * EMA timings; `bestTimeToType` is the hit-weighted average of their bests.
 *
 * Every letter in `letters` gets an entry — even letters that have never
 * been typed in a measured bigram. Their `timeToType` / `bestTimeToType`
 * are `null` in that case, matching the existing planner contract.
 */
export function deriveKeyStats(
  letters: readonly string[],
  bigramStats: ReadonlyMap<string, BigramStats>,
): Map<string, KeyStats> {
  const result = new Map<string, KeyStats>();
  for (const letter of letters) {
    let hitCount = 0;
    let missCount = 0;
    let timedHits = 0;
    let timedSum = 0;
    let bestHits = 0;
    let bestSum = 0;
    for (const stats of bigramStats.values()) {
      // The second character of the bigram is the one being timed.
      if (stats.bigram.charAt(1) !== letter) continue;
      hitCount += stats.hitCount;
      missCount += stats.missCount;
      if (stats.timeToType !== null) {
        timedHits += stats.hitCount;
        timedSum += stats.timeToType * stats.hitCount;
      }
      if (stats.bestTimeToType !== null) {
        bestHits += stats.hitCount;
        bestSum += stats.bestTimeToType * stats.hitCount;
      }
    }
    result.set(letter, {
      letter,
      hitCount,
      missCount,
      timeToType: timedHits > 0 ? timedSum / timedHits : null,
      bestTimeToType: bestHits > 0 ? bestSum / bestHits : null,
    });
  }
  return result;
}
