/**
 * Pure numeric primitives used by the metrics layer. No typing-domain
 * knowledge — these would be at home in any stats library.
 */

export function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function mean(xs: readonly number[]): number {
  if (xs.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const x of xs) {
    sum += x;
  }
  return sum / xs.length;
}

/** Population standard deviation. */
export function stdDev(xs: readonly number[]): number {
  if (xs.length === 0) {
    return 0;
  }
  const m = mean(xs);
  let acc = 0;
  for (const x of xs) {
    acc += (x - m) ** 2;
  }
  return Math.sqrt(acc / xs.length);
}

/**
 * Maps a coefficient of variation (stdDev / mean, in [0, infinity)) to a
 * consistency percentage in (0, 100]. Lower variation yields higher
 * consistency. A smooth sigmoid-like rolloff (named "kogasa" in the
 * function below) that is forgiving near zero and saturates fast — the
 * `tanh(x + x³/3 + x⁵/5)` series is a numerically-stable arctangent
 * approximation rescaled into the consistency-percentage range.
 */
export function kogasa(cov: number): number {
  return 100 * (1 - Math.tanh(cov + cov ** 3 / 3 + cov ** 5 / 5));
}
