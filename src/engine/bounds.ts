/**
 * Single source of truth for profile-settings ranges. The persistence
 * deserializer enforces these on untrusted input; the Settings UI clamps
 * within the same ranges. A test asserts that the UI's narrower input ranges
 * are a subset of these, so the storage boundary never has to silently rewrite
 * a value the UI set.
 */
export interface SettingBounds {
  readonly lo: number;
  readonly hi: number;
  /** When true, only finite integers are accepted (vs any finite number). */
  readonly integer: boolean;
}

export interface SettingsBounds {
  readonly targetWpm: SettingBounds;
  readonly wordCount: SettingBounds;
  readonly testDurationSec: SettingBounds;
  readonly minAlphabetSize: SettingBounds;
  readonly alphabetExpansion: SettingBounds;
}

export const SETTINGS_BOUNDS: SettingsBounds = {
  targetWpm: { lo: 1, hi: 500, integer: false },
  wordCount: { lo: 1, hi: 1000, integer: true },
  testDurationSec: { lo: 5, hi: 600, integer: true },
  minAlphabetSize: { lo: 1, hi: 64, integer: true },
  alphabetExpansion: { lo: 0, hi: 1, integer: false },
};

/**
 * Narrower friendly ranges the Settings UI clamps user input to. MUST be a
 * subset of `SETTINGS_BOUNDS` — see `bounds.test.ts` for the runtime check.
 * Outside of UI input, the engine still accepts the full SETTINGS_BOUNDS range
 * (e.g. a profile imported with `targetWpm: 300` loads fine; the UI just won't
 * offer values that extreme).
 */
export const UI_BOUNDS: SettingsBounds = {
  targetWpm: { lo: 10, hi: 250, integer: false },
  wordCount: { lo: 5, hi: 200, integer: true },
  testDurationSec: { lo: 10, hi: 300, integer: true },
  minAlphabetSize: { lo: 1, hi: 26, integer: true },
  alphabetExpansion: { lo: 0, hi: 1, integer: false },
};

/** Returns true if `value` satisfies the given bound. */
export function inBound(value: unknown, bound: SettingBounds): value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return false;
  }
  if (bound.integer && !Number.isInteger(value)) {
    return false;
  }
  return value >= bound.lo && value <= bound.hi;
}
