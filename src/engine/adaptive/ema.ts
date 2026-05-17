/**
 * Exponential moving average. `alpha` is the weight given to each new sample.
 * We use 0.1 (see `EMA_ALPHA` in `key-stats.ts`): each run nudges the
 * estimate 10% toward the new value, smoothing run-to-run noise while still
 * tracking real improvement.
 */
export class EmaFilter {
  private _value: number | null = null;

  constructor(private readonly alpha: number) {
    if (!Number.isFinite(alpha) || alpha <= 0 || alpha > 1) {
      throw new Error("EMA alpha must be a finite number in (0, 1]");
    }
  }

  get value(): number | null {
    return this._value;
  }

  add(sample: number): number {
    this._value = this._value === null ? sample : this._value + this.alpha * (sample - this._value);
    return this._value;
  }
}
