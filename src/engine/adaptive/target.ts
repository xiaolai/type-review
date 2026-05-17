const MS_PER_MINUTE = 60_000;
const CHARS_PER_WORD = 5;

/** Converts a target typing speed into per-character timing and confidence ratios. */
export class Target {
  /** Target milliseconds per character. */
  readonly timePerChar: number;

  /** @param targetSpeed desired speed in WPM. */
  constructor(readonly targetSpeed: number) {
    if (!Number.isFinite(targetSpeed) || targetSpeed <= 0) {
      throw new Error("targetSpeed must be a finite positive number");
    }
    this.timePerChar = MS_PER_MINUTE / (targetSpeed * CHARS_PER_WORD);
  }

  /**
   * Confidence that a key is at target: targetTime / actualTime. 1.0 means
   * exactly on target, above 1 means faster than target, below means slower.
   * Returns null when there is no timing data yet.
   */
  confidence(timeToType: number | null): number | null {
    if (timeToType === null || timeToType <= 0) {
      return null;
    }
    return this.timePerChar / timeToType;
  }
}
