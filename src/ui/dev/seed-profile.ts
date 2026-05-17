/**
 * Developer helper: generate a realistic-looking `RunResult[]` so the
 * Stats page is reviewable without having to actually type N sessions.
 * Used by the dev-only "populate sample data" button on Stats.
 *
 * Realism choices:
 *   - WPM trends upward (≈38 → ≈78) over the seeded range, with noise,
 *     so the sparkline looks like a typing journey rather than a flat line.
 *   - Accuracy stays in the 93–99 % band, slowly improving.
 *   - Mix of modes (60 % adaptive, 40 % benchmark) so the table shows
 *     both labels.
 *   - Passage ids rotate through the four corpus channels' id prefixes
 *     so per-source attribution looks plausible when we add it.
 *   - Timestamps spread over the last ~30 days, oldest first.
 *   - Each run gets a per-bigram histogram seeded from a small list of
 *     common bigrams, so the adaptive engine's downstream consumers
 *     don't see empty maps.
 */

import type { Histogram } from "../../engine/adaptive";
import type { Mode, RunResult } from "../../engine/session";

// Prefixes here match the real corpus id schemes so `channelOf()` in
// stats/aggregations.ts classifies them correctly when computing the
// WPM-by-source breakdown.
const PASSAGE_IDS: ReadonlyArray<{ id: string; text: string }> = [
  { id: "q-twain-travel", text: "Travel is fatal to prejudice and bigotry." },
  { id: "q-thoreau-deliberate", text: "I went to the woods to live deliberately." },
  { id: "q-emerson-trust", text: "Self-trust is the first secret of success." },
  { id: "q-lincoln-people", text: "Government of the people, by the people, for the people." },
  { id: "code-fizzbuzz-py", text: "for i in range(1, 101):" },
  { id: "code-quicksort-rs", text: "fn quicksort(xs: &mut [i32])" },
  { id: "difficult:1", text: "rhythm mnemonic accommodate succinct" },
  { id: "difficult:2", text: "perspicacious ubiquitous xenophobia jazz" },
  { id: "pseudo:eta-1", text: "ate eat tea the tat eat" },
  { id: "pseudo:rsdh-2", text: "she had her dear rest" },
  { id: "u-sample-1", text: "user-uploaded passage placeholder text" },
];

const BIGRAMS = [
  "th",
  "he",
  "in",
  "er",
  "an",
  "re",
  "on",
  "at",
  "en",
  "nd",
  "ti",
  "es",
  "or",
  "te",
  "of",
  "ed",
  "is",
  "it",
  "al",
  "ar",
  "st",
  "to",
  "nt",
  "ng",
  "se",
  "ha",
  "as",
  "ou",
  "io",
  "le",
];

interface SeedOptions {
  count?: number;
  /** Anchor for the newest timestamp; defaults to "now". */
  endTimestamp?: number;
  /** Days the seeded runs span backwards from `endTimestamp`. */
  spanDays?: number;
  /** Deterministic RNG for tests; defaults to Math.random. */
  rng?: () => number;
}

const DEFAULT_COUNT = 50;
const DEFAULT_SPAN_DAYS = 30;

/**
 * Deterministic-ish per-index value with a target trajectory + noise.
 * `t` is normalised position in [0, 1]; lower → earlier in time.
 */
function trended(min: number, max: number, t: number, jitter: number, rng: () => number): number {
  const base = min + (max - min) * t;
  const noise = (rng() - 0.5) * 2 * jitter;
  return Math.max(min, Math.min(max + jitter, base + noise));
}

function randomHistogram(rng: () => number): Histogram {
  const out = new Map<string, { hitCount: number; missCount: number; timeToType: number }>();
  // Sample 8–16 bigrams per run with plausible hit / miss / timing.
  const n = 8 + Math.floor(rng() * 9);
  const shuffled = [...BIGRAMS].sort(() => rng() - 0.5);
  for (let i = 0; i < n; i++) {
    const bg = shuffled[i];
    if (!bg) continue;
    const hitCount = 2 + Math.floor(rng() * 12);
    const missCount = rng() < 0.3 ? Math.floor(rng() * 2) : 0;
    const timeToType = Math.round(110 + rng() * 160); // 110–270 ms
    out.set(bg, { hitCount, missCount, timeToType });
  }
  return out;
}

/**
 * Build `count` plausible `RunResult` entries spanning the last
 * `spanDays` days, with metrics that trend upward over time.
 */
export function seedFakeResults(options: SeedOptions = {}): RunResult[] {
  const count = Math.max(1, options.count ?? DEFAULT_COUNT);
  const endTimestamp = options.endTimestamp ?? Date.now();
  const spanDays = Math.max(1, options.spanDays ?? DEFAULT_SPAN_DAYS);
  const rng = options.rng ?? Math.random;

  const spanMs = spanDays * 24 * 60 * 60 * 1000;
  const startTimestamp = endTimestamp - spanMs;
  const results: RunResult[] = [];

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 1 : i / (count - 1);
    const timestamp = Math.round(startTimestamp + spanMs * t);
    const netWpm = Math.round(trended(38, 78, t, 6, rng));
    const rawWpm = netWpm + 2 + Math.round(rng() * 4);
    const accuracy = Math.round(trended(93, 99, t, 1.2, rng) * 10) / 10;
    const consistency = Math.round(trended(60, 88, t, 8, rng));
    const wpmStdDev = Math.round((6 + rng() * 8) * 10) / 10;
    const durationMs = 22_000 + Math.floor(rng() * 18_000); // 22–40s
    const totalChars = Math.round((netWpm * 5 * durationMs) / 60_000);
    const incorrectChars = Math.max(0, Math.round(totalChars * (1 - accuracy / 100)));
    const correctChars = Math.max(0, totalChars - incorrectChars);
    const mode: Mode = rng() < 0.6 ? "adaptive" : "benchmark";
    const pick = PASSAGE_IDS[i % PASSAGE_IDS.length] ?? PASSAGE_IDS[0];
    if (!pick) continue;

    results.push({
      index: i,
      mode,
      timestamp,
      passageId: pick.id,
      text: pick.text,
      metrics: {
        netWpm,
        rawWpm,
        accuracy,
        consistency,
        wpmStdDev,
        // Fake a wpmSeries that wiggles around the run's rawWpm —
        // gives the in-run WPM graph on the sample-data Stats view
        // a realistic-looking curve.
        wpmSeries: Array.from({ length: Math.max(2, Math.round(durationMs / 1000)) }, () =>
          Math.round(rawWpm + (rng() - 0.5) * 12),
        ),
        correctChars,
        incorrectChars,
        durationMs,
      },
      histogram: randomHistogram(rng),
    });
  }

  return results;
}
