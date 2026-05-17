import { inBound, SETTINGS_BOUNDS } from "../../engine/bounds";
import type { ProfileSettings } from "../../engine/session";

/**
 * Predicate helpers used at the storage boundary (and reused by the
 * UI→engine settings validator). They never throw; every check returns a
 * narrowed boolean so the caller can decide whether to bail.
 */

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isNonNegativeInteger(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;
}

export function isInRange(value: unknown, lo: number, hi: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= lo && value <= hi;
}

export function hasOnlyAllowedKeys(
  raw: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): boolean {
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) {
      return false;
    }
  }
  return true;
}

const ALLOWED_SETTINGS_KEYS: ReadonlySet<string> = new Set([
  "mode",
  "targetWpm",
  "wordCount",
  "testMode",
  "testDurationSec",
  "stopOnError",
  "noBackspace",
  "passageLength",
  "adaptive",
  "includeNumbers",
  "includePunctuation",
]);

/**
 * Keys that the current format does not know about but were valid in
 * earlier versions. They are silently dropped during validation so
 * existing on-disk profiles upgrade cleanly instead of being marked
 * corrupt. Add to this set whenever a settings field is removed.
 */
const LEGACY_SETTINGS_KEYS: ReadonlySet<string> = new Set([
  // Removed 2026-05-17 — see /codex-toolkit:audit-fix discussion. The
  // funbox feature (off/blind/nospaces) was deleted as gimmicky.
  "funbox",
]);

const ALLOWED_ADAPTIVE_KEYS: ReadonlySet<string> = new Set([
  "minAlphabetSize",
  "alphabetExpansion",
]);

/**
 * Validates an unknown value as `ProfileSettings`. Exported so the UI→engine
 * write path can run the same checks the storage→engine read path runs —
 * a single source of truth for what counts as valid settings, no "trusted
 * caller bypass".
 *
 * Returns the (defensively copied) settings on success, `null` on any failure.
 */
export function validateSettings(raw: unknown): ProfileSettings | null {
  if (!isObject(raw)) {
    return null;
  }
  // Reject objects with truly unknown keys, but tolerate keys we knew
  // about in past versions — they are dropped on the way in. This is
  // the upgrade path for users whose on-disk profile still contains
  // fields that have since been removed (see LEGACY_SETTINGS_KEYS).
  for (const key of Object.keys(raw)) {
    if (!ALLOWED_SETTINGS_KEYS.has(key) && !LEGACY_SETTINGS_KEYS.has(key)) {
      return null;
    }
  }
  if (!isObject(raw.adaptive) || !hasOnlyAllowedKeys(raw.adaptive, ALLOWED_ADAPTIVE_KEYS)) {
    return null;
  }
  if (raw.mode !== "adaptive" && raw.mode !== "benchmark") {
    return null;
  }
  if (typeof raw.stopOnError !== "boolean") {
    return null;
  }
  // `includeNumbers` / `includePunctuation` / `noBackspace` / `testMode` /
  // `testDurationSec` are optional for forward-compat with payloads from
  // earlier format versions (the migrator may not set them). Default
  // sensibly on absence; reject if present but the wrong type.
  if (raw.includeNumbers !== undefined && typeof raw.includeNumbers !== "boolean") {
    return null;
  }
  if (raw.includePunctuation !== undefined && typeof raw.includePunctuation !== "boolean") {
    return null;
  }
  if (raw.noBackspace !== undefined && typeof raw.noBackspace !== "boolean") {
    return null;
  }
  if (raw.testMode !== undefined && raw.testMode !== "words" && raw.testMode !== "time") {
    return null;
  }
  if (
    raw.testDurationSec !== undefined &&
    !inBound(raw.testDurationSec, SETTINGS_BOUNDS.testDurationSec)
  ) {
    return null;
  }
  if (
    raw.passageLength !== undefined &&
    raw.passageLength !== "any" &&
    raw.passageLength !== "short" &&
    raw.passageLength !== "medium" &&
    raw.passageLength !== "long"
  ) {
    return null;
  }
  if (
    !inBound(raw.targetWpm, SETTINGS_BOUNDS.targetWpm) ||
    !inBound(raw.wordCount, SETTINGS_BOUNDS.wordCount) ||
    !inBound(raw.adaptive.minAlphabetSize, SETTINGS_BOUNDS.minAlphabetSize) ||
    !inBound(raw.adaptive.alphabetExpansion, SETTINGS_BOUNDS.alphabetExpansion)
  ) {
    return null;
  }
  return {
    mode: raw.mode,
    targetWpm: raw.targetWpm,
    wordCount: raw.wordCount,
    testMode: (raw.testMode as "words" | "time" | undefined) ?? "words",
    testDurationSec: (raw.testDurationSec as number | undefined) ?? 30,
    stopOnError: raw.stopOnError,
    noBackspace: raw.noBackspace ?? false,
    passageLength: (raw.passageLength as "any" | "short" | "medium" | "long" | undefined) ?? "any",
    includeNumbers: raw.includeNumbers ?? false,
    includePunctuation: raw.includePunctuation ?? false,
    adaptive: {
      minAlphabetSize: raw.adaptive.minAlphabetSize,
      alphabetExpansion: raw.adaptive.alphabetExpansion,
    },
  };
}
