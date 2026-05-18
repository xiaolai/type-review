import { PAUSE_CAP_MS } from "../typing/text-input";
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
 * Binning uses the same pause-capped active-time accounting as
 * `TextInput.elapsedMs`: a gap between two keystrokes larger than
 * `PAUSE_CAP_MS` contributes exactly `PAUSE_CAP_MS` to the cumulative
 * offset, never more. Without this, a tab-freeze pause would inflate the
 * raw timestamp gap to hours, producing hundreds of zero-char bins that
 * tank the consistency calculation even though the saved run duration
 * (which IS pause-capped) shows the user typed steadily.
 *
 * Tab-freeze guard: the bin array is capped at MAX_BINS as a second line
 * of defence — a long sequence of capped gaps still can't produce more
 * than 15 minutes of bins.
 */
export function binBySecond(steps: readonly Step[]): SecondBin[] {
  const first = steps[0];
  if (first === undefined) {
    return [];
  }
  const buckets = new Map<number, { chars: number; errors: number }>();
  let maxIndex = 0;
  let activeMs = 0;
  let prevTimeStamp: number | null = null;
  for (const step of steps) {
    if (prevTimeStamp !== null) {
      const rawInterval = step.timeStamp - prevTimeStamp;
      // Mirror TextInput.appendChar: floor negative (clock skew) at 0,
      // cap long pauses at PAUSE_CAP_MS. The cumulative `activeMs` then
      // matches `TextInput.elapsedMs` step-for-step.
      const interval = Math.max(0, Math.min(rawInterval, PAUSE_CAP_MS));
      activeMs += interval;
    }
    prevTimeStamp = step.timeStamp;
    const rawIndex = Math.floor(activeMs / 1000);
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
