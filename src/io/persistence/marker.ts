/**
 * A single localStorage flag set on every successful save. If, later, the
 * primary store returns no profile but this flag is still present, we know
 * the data was evicted (Safari ITP, user-cleared site data, quota churn)
 * rather than genuinely absent — and we can tell the user instead of
 * pretending it's a brand-new install.
 *
 * Every helper is best-effort and never throws: localStorage may be
 * unavailable in private mode or under quota pressure, and the marker is a
 * UX nicety, not a correctness invariant.
 */

const STORAGE_MARKER_KEY = "type-review:has-saved-profile";

export function setSavedMarker(): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_MARKER_KEY, "1");
    }
  } catch {
    // Best-effort: ignore.
  }
}

export function hasSavedMarker(): boolean {
  try {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem(STORAGE_MARKER_KEY) === "1";
    }
  } catch {
    // Best-effort: ignore.
  }
  return false;
}

/** Clears the saved marker — used when the user explicitly resets, or by tests. */
export function clearSavedMarker(): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(STORAGE_MARKER_KEY);
    }
  } catch {
    // Best-effort: ignore.
  }
}
