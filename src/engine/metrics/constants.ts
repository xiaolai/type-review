/**
 * Shared metric constants — kept in their own module so `binning.ts` and
 * `run-metrics.ts` reference one canonical definition rather than each holding
 * their own copy. Changing the WPM convention here propagates everywhere.
 */

export const MS_PER_MINUTE = 60_000;
/** Standard "word" length shared by every WPM convention. */
export const CHARS_PER_WORD = 5;
