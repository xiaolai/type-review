import type { BigramHit, Histogram } from "../../engine/adaptive";
import type { RunMetrics } from "../../engine/metrics";
import type { Profile, RunResult } from "../../engine/session";
import {
  ALLOWED_METRICS_KEYS,
  ALLOWED_PROFILE_KEYS,
  ALLOWED_RESULT_KEYS,
  MAX_DURATION_MS,
  MAX_HISTOGRAM_ENTRIES,
  MAX_KEY_COUNT,
  MAX_PASSAGE_ID_LENGTH,
  MAX_RESULTS,
  MAX_TEXT_LENGTH,
  MAX_TIME_TO_TYPE_MS,
} from "./constants";
import type { LoadResult, SerializedProfile, SerializedRunResult } from "./types";
import { FORMAT_VERSION } from "./types";
import {
  hasOnlyAllowedKeys,
  isFiniteNumber,
  isInRange,
  isNonNegativeInteger,
  isObject,
  validateSettings,
} from "./validators";

export function serializeProfile(profile: Profile): SerializedProfile {
  return {
    version: FORMAT_VERSION,
    settings: {
      ...profile.settings,
      adaptive: { ...profile.settings.adaptive },
    },
    results: profile.results.map(
      (result): SerializedRunResult => ({
        index: result.index,
        mode: result.mode,
        timestamp: result.timestamp,
        passageId: result.passageId,
        text: result.text,
        metrics: { ...result.metrics },
        histogram: Object.fromEntries(result.histogram),
      }),
    ),
  };
}

function parseMetrics(raw: unknown): RunMetrics | null {
  if (!isObject(raw) || !hasOnlyAllowedKeys(raw, ALLOWED_METRICS_KEYS)) {
    return null;
  }
  // `wpmStdDev` (v2) and `wpmSeries` (v3) are forward-compat optional —
  // older records back-fill on read. Every other key is required.
  for (const key of ALLOWED_METRICS_KEYS) {
    if (key === "wpmStdDev" && raw[key] === undefined) continue;
    if (key === "wpmSeries" && raw[key] === undefined) continue;
    if (key === "wpmSeries") continue; // validated separately as array of numbers
    if (!isFiniteNumber(raw[key])) {
      return null;
    }
  }
  // wpmSeries — accept absence or any array of finite numbers.
  const wpmSeries: number[] = [];
  if (raw.wpmSeries !== undefined) {
    if (!Array.isArray(raw.wpmSeries)) return null;
    // Cap by length BEFORE walking, so a tampered megabyte-sized array
    // doesn't burn CPU validating samples we'd discard anyway.
    const capped = raw.wpmSeries.length > 1000 ? raw.wpmSeries.slice(0, 1000) : raw.wpmSeries;
    for (const sample of capped) {
      if (!isFiniteNumber(sample)) return null;
      wpmSeries.push(sample as number);
    }
  }
  // Per-field range checks — a finite number isn't enough; negative WPM
  // or 250% accuracy would render but be meaningless. Lenient upper
  // bounds: WPM<=1000, chars<=MAX_TEXT_LENGTH, accuracy 0..100.
  const netWpm = raw.netWpm as number;
  const rawWpm = raw.rawWpm as number;
  const accuracy = raw.accuracy as number;
  const consistency = raw.consistency as number;
  const wpmStdDev = isFiniteNumber(raw.wpmStdDev) ? (raw.wpmStdDev as number) : 0;
  const correctChars = raw.correctChars as number;
  const incorrectChars = raw.incorrectChars as number;
  if (
    netWpm < 0 ||
    netWpm > 1000 ||
    rawWpm < 0 ||
    rawWpm > 1000 ||
    accuracy < 0 ||
    accuracy > 100 ||
    consistency < 0 ||
    consistency > 100 ||
    wpmStdDev < 0 ||
    wpmStdDev > 1000 ||
    correctChars < 0 ||
    correctChars > MAX_TEXT_LENGTH ||
    incorrectChars < 0 ||
    incorrectChars > MAX_TEXT_LENGTH
  ) {
    return null;
  }
  return {
    netWpm,
    rawWpm,
    accuracy,
    consistency,
    wpmStdDev,
    wpmSeries,
    correctChars,
    incorrectChars,
    durationMs: raw.durationMs as number,
  };
}

function parseHistogram(raw: unknown): Histogram | null {
  if (!isObject(raw)) {
    return null;
  }
  const entries = Object.entries(raw);
  if (entries.length > MAX_HISTOGRAM_ENTRIES) {
    return null;
  }
  const map = new Map<string, BigramHit>();
  for (const [key, hit] of entries) {
    // Keys are 2-char bigrams (the transition between consecutive expected
    // characters). Reject surrogate halves; engine indexes by code unit.
    if (key.length !== 2 || /[\uD800-\uDFFF]/.test(key)) {
      return null;
    }
    if (!isObject(hit)) {
      return null;
    }
    if (
      !isNonNegativeInteger(hit.hitCount, MAX_KEY_COUNT) ||
      !isNonNegativeInteger(hit.missCount, MAX_KEY_COUNT) ||
      hit.missCount > hit.hitCount ||
      !isInRange(hit.timeToType, 0, MAX_TIME_TO_TYPE_MS)
    ) {
      return null;
    }
    map.set(key, {
      hitCount: hit.hitCount,
      missCount: hit.missCount,
      timeToType: hit.timeToType,
    });
  }
  return map;
}

function parseResult(raw: unknown): RunResult | null {
  if (!isObject(raw) || !hasOnlyAllowedKeys(raw, ALLOWED_RESULT_KEYS)) {
    return null;
  }
  if (raw.mode !== "adaptive" && raw.mode !== "benchmark") {
    return null;
  }
  if (
    !isNonNegativeInteger(raw.index, Number.MAX_SAFE_INTEGER) ||
    !isFiniteNumber(raw.timestamp) ||
    typeof raw.passageId !== "string" ||
    raw.passageId.length === 0 ||
    raw.passageId.length > MAX_PASSAGE_ID_LENGTH ||
    typeof raw.text !== "string" ||
    raw.text.length === 0 ||
    raw.text.length > MAX_TEXT_LENGTH
  ) {
    return null;
  }
  const metrics = parseMetrics(raw.metrics);
  if (metrics === null || !isInRange(metrics.durationMs, 0, MAX_DURATION_MS)) {
    return null;
  }
  const histogram = parseHistogram(raw.histogram);
  if (histogram === null) {
    return null;
  }
  return {
    index: raw.index,
    mode: raw.mode,
    timestamp: raw.timestamp,
    passageId: raw.passageId,
    text: raw.text,
    metrics,
    histogram,
  };
}

/**
 * Migrator chain: each entry takes a payload at version N and returns a
 * payload at version N+1. Every schema bump ships a migrator instead of
 * silently discarding pre-existing user data.
 */
const MIGRATORS: Record<number, (raw: Record<string, unknown>) => unknown> = {
  /**
   * v1 → v2: per-letter histograms become per-bigram. There's no faithful
   * way to reconstruct per-bigram timings from per-letter data, so we drop
   * the histograms and let the adaptive engine relearn over the next
   * handful of runs. Run counts and metrics (WPM, accuracy, etc.) are
   * preserved — only the adaptive picture resets.
   */
  1: (raw) => {
    const results = Array.isArray(raw.results) ? raw.results : [];
    const migrated = results.map((entry) => {
      if (!isObject(entry)) return entry;
      return { ...entry, histogram: {} };
    });
    return { ...raw, version: 2, results: migrated };
  },
};

function migrate(raw: Record<string, unknown>): unknown | null {
  const version = typeof raw.version === "number" ? raw.version : Number.NaN;
  if (!Number.isInteger(version)) {
    return null;
  }
  if (version > FORMAT_VERSION) {
    // Newer-than-known: refuse rather than guess.
    return null;
  }
  let current: Record<string, unknown> = raw;
  let cursor = version;
  while (cursor < FORMAT_VERSION) {
    const fn = MIGRATORS[cursor];
    if (fn === undefined) {
      return null;
    }
    const next = fn(current);
    if (!isObject(next)) {
      return null;
    }
    current = next;
    cursor++;
  }
  return current;
}

/**
 * Reconstructs a Profile from stored data. Returns a `LoadResult` so callers
 * can distinguish "no data" from "data was there but unreadable" — the latter
 * deserves user-visible feedback; the former is a clean first-run.
 */
export function deserializeProfile(raw: unknown): LoadResult {
  if (raw === undefined || raw === null) {
    return { status: "absent" };
  }
  if (!isObject(raw)) {
    return { status: "corrupt", reason: "not an object" };
  }
  if (!hasOnlyAllowedKeys(raw, ALLOWED_PROFILE_KEYS)) {
    return { status: "corrupt", reason: "unknown top-level keys" };
  }
  const migrated = migrate(raw);
  if (migrated === null) {
    return {
      status: "corrupt",
      reason: `version ${String(raw.version)} cannot be migrated to ${FORMAT_VERSION}`,
    };
  }
  if (!isObject(migrated)) {
    return { status: "corrupt", reason: "migrator returned non-object" };
  }
  const settings = validateSettings(migrated.settings);
  if (settings === null) {
    return { status: "corrupt", reason: "invalid settings" };
  }
  if (!Array.isArray(migrated.results)) {
    return { status: "corrupt", reason: "results not an array" };
  }
  // Cap untrusted history at a defensive ceiling — tampering with stored data
  // cannot make startup do unbounded work. Keep the most recent entries.
  const rawResults =
    migrated.results.length > MAX_RESULTS
      ? migrated.results.slice(migrated.results.length - MAX_RESULTS)
      : migrated.results;
  const results: RunResult[] = [];
  for (const rawResult of rawResults) {
    const result = parseResult(rawResult);
    if (result === null) {
      return { status: "corrupt", reason: "invalid result entry" };
    }
    results.push(result);
  }
  return { status: "ok", profile: { settings, results } };
}
