import { DEFAULT_ALPHABET } from "../adaptive";
import type { ProfileSettings } from "./types";

/**
 * Digits, in frequency-ish order (0 is rare in prose; 1 and 2 common). The
 * order matters for the unlock progression — the adaptive engine introduces
 * letters left-to-right.
 */
export const DIGITS: readonly string[] = ["1", "2", "0", "3", "5", "4", "7", "8", "6", "9"];

/**
 * Common ASCII punctuation, ordered from most-to-least-common in English
 * prose. Comma and period dominate; the rest tail off.
 */
export const PUNCTUATION: readonly string[] = [",", ".", "'", "-", '"', ":", ";", "?", "!"];

/**
 * Compute the effective adaptive alphabet from the user's settings. Base is
 * always the 26 lowercase letters; numbers + punctuation extend it when
 * toggled. The order matters: the adaptive engine unlocks left-to-right, so
 * we keep letters first (the user already learned them).
 */
export function buildAlphabet(settings: ProfileSettings): readonly string[] {
  const alphabet: string[] = [...DEFAULT_ALPHABET];
  if (settings.includeNumbers) alphabet.push(...DIGITS);
  if (settings.includePunctuation) alphabet.push(...PUNCTUATION);
  return alphabet;
}
