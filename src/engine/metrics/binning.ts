import type { Step } from "../typing/types";
import { CHARS_PER_WORD, MS_PER_MINUTE } from "./constants";
import { roundTo2 } from "./math";

/**
 * Hard cap on per-second bin output (15 minutes). Defends against tab-freeze
 * resumes producing arrays of thousands of zero-char bins.
 */
const MAX_BINS = 15 * 60;

export interface SecondBin {
  /** 1-based second index within the run. */
  second: number;
  /** Keystrokes committed during this second. */
  chars: number;
  /** Mistyped keystrokes committed during this second. */
  errors: number;
  /** Instantaneous raw WPM implied by this second's keystroke count. */
  rawWpm: number;
}

/**
 * Groups keystrokes into 1-second buckets relative to the first keystroke.
 * Empty seconds in the middle of a run are preserved as zero-char bins so the
 * consistency calculation sees pauses. The final bucket may be a partial
 * second — an accepted approximation that is negligible over real run lengths.
 *
 * Tab-freeze guard: the bin array is capped at MAX_BINS so a multi-hour pause
 * between two keystrokes can't allocate a 14,400-element array.
 */
export function binBySecond(steps: readonly Step[]): SecondBin[] {
  const first = steps[0];
  if (first === undefined) {
    return [];
  }
  const origin = first.timeStamp;
  const buckets = new Map<number, { chars: number; errors: number }>();
  let maxIndex = 0;
  for (const step of steps) {
    // Clock skew or out-of-order timestamps can yield negative rawIndex;
    // clamp to 0 so the bucket lookup doesn't produce a hidden -1 key
    // that later loops gracefully skip but make the data harder to reason
    // about. Also caps the upper end against the tab-freeze guard.
    const rawIndex = Math.floor((step.timeStamp - origin) / 1000);
    const index = Math.max(0, Math.min(rawIndex, MAX_BINS - 1));
    maxIndex = Math.max(maxIndex, index);
    const bucket = buckets.get(index) ?? { chars: 0, errors: 0 };
    bucket.chars++;
    if (step.typo) {
      bucket.errors++;
    }
    buckets.set(index, bucket);
  }
  const result: SecondBin[] = [];
  for (let index = 0; index <= maxIndex; index++) {
    const bucket = buckets.get(index) ?? { chars: 0, errors: 0 };
    result.push({
      second: index + 1,
      chars: bucket.chars,
      errors: bucket.errors,
      rawWpm: roundTo2((bucket.chars * (MS_PER_MINUTE / 1000)) / CHARS_PER_WORD),
    });
  }
  return result;
}
