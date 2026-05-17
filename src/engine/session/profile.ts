import { DEFAULT_ADAPTIVE_SETTINGS, DEFAULT_TARGET_WPM } from "../adaptive";
import type { Mode, Profile, ProfileSettings } from "./types";

/** All profile-settings defaults in one place — the audit's "split defaults" fix. */
export const DEFAULT_MODE: Mode = "benchmark";
export const DEFAULT_WORD_COUNT = 30;
export const DEFAULT_TEST_MODE = "words" as const;
export const DEFAULT_TEST_DURATION_SEC = 30;
export const DEFAULT_STOP_ON_ERROR = false;
export const DEFAULT_NO_BACKSPACE = false;
export const DEFAULT_PASSAGE_LENGTH = "any" as const;
export const DEFAULT_INCLUDE_NUMBERS = false;
export const DEFAULT_INCLUDE_PUNCTUATION = false;

/** The full settings object a fresh profile starts with. */
export function defaultProfileSettings(): ProfileSettings {
  return {
    mode: DEFAULT_MODE,
    targetWpm: DEFAULT_TARGET_WPM,
    adaptive: { ...DEFAULT_ADAPTIVE_SETTINGS },
    wordCount: DEFAULT_WORD_COUNT,
    testMode: DEFAULT_TEST_MODE,
    testDurationSec: DEFAULT_TEST_DURATION_SEC,
    stopOnError: DEFAULT_STOP_ON_ERROR,
    noBackspace: DEFAULT_NO_BACKSPACE,
    passageLength: DEFAULT_PASSAGE_LENGTH,
    includeNumbers: DEFAULT_INCLUDE_NUMBERS,
    includePunctuation: DEFAULT_INCLUDE_PUNCTUATION,
  };
}

/** A fresh profile for a brand-new user: benchmark mode, sensible defaults, no history. */
export function createDefaultProfile(): Profile {
  return {
    settings: defaultProfileSettings(),
    results: [],
  };
}
