import type { BigramHit } from "../../engine/adaptive";
import type { RunMetrics } from "../../engine/metrics";
import type { Mode, Profile, ProfileSettings } from "../../engine/session";

/**
 * Outcome of a profile load. Distinguishes the three legitimately different
 * "no profile" cases so the UI can give the user accurate feedback:
 *   - `ok`        — profile loaded successfully
 *   - `absent`    — never saved (fresh user); no banner needed
 *   - `corrupt`   — data was present but unreadable (schema mismatch, bad bytes)
 *   - `evicted`   — local marker shows data once existed but storage was wiped
 *                   (Safari ITP eviction, user-cleared site data, quota churn)
 */
export type LoadResult =
  | { status: "ok"; profile: Profile }
  | { status: "absent" }
  | { status: "corrupt"; reason: string }
  | { status: "evicted" };

/** Persists a single user profile. Async so cloud/filesystem backends can slot in later. */
export interface ProfileStore {
  load(): Promise<LoadResult>;
  save(profile: Profile): Promise<void>;
  /** Optional cleanup (close DB connections). No-op when not applicable. */
  close?(): Promise<void>;
  /** Delete all persisted data and clear the saved-data marker. */
  reset?(): Promise<void>;
}

/**
 * IndexedDB's structured clone could store the Profile (Maps included) as-is,
 * but an explicit, versioned, JSON-shaped format is inspectable and lets us
 * validate defensively on the way back in — storage is an untrusted boundary.
 */
export const FORMAT_VERSION = 2;

export interface SerializedProfile {
  version: typeof FORMAT_VERSION;
  settings: ProfileSettings;
  results: SerializedRunResult[];
}

export interface SerializedRunResult {
  index: number;
  mode: Mode;
  timestamp: number;
  passageId: string;
  text: string;
  metrics: RunMetrics;
  /** Keys are 2-char bigrams (the transition between consecutive expected chars). */
  histogram: Record<string, BigramHit>;
}
