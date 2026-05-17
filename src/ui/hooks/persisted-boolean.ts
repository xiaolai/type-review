/**
 * Best-effort localStorage primitives for boolean UI preferences. These
 * live OUTSIDE `ProfileSettings` because they're viewport / appearance
 * choices, not session state — they don't need validation, schema
 * versioning, or import/export.
 *
 * Storage shape: `"1"` for true, `"0"` for false. Anything else (and
 * missing keys, throws) falls back to the caller-supplied default —
 * matters in Safari ITP private mode, quota-exceeded, and SSR.
 */

/**
 * Read a persisted boolean preference, defaulting to `fallback` when
 * the key is missing, malformed, or storage is unavailable.
 */
export function readBooleanPref(key: string, fallback: boolean): boolean {
  try {
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem(key);
      if (stored === "1") return true;
      if (stored === "0") return false;
    }
  } catch {
    // Best-effort: ignore (Safari ITP private mode, quota, etc.).
  }
  return fallback;
}

/** Write a boolean preference. Silently swallows storage failures. */
export function writeBooleanPref(key: string, value: boolean): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, value ? "1" : "0");
    }
  } catch {
    // Best-effort: ignore.
  }
}
