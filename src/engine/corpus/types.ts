/** Which letters a lesson may use and which one to over-represent. */
export interface Filter {
  /**
   * Letters this lesson may produce, in difficulty order (easiest first).
   * Modeled as an array (not a Set) because the order is meaningful — future
   * generators may bias toward easier letters — and array membership lookup
   * is O(n) on a ~26-letter alphabet, i.e. free.
   */
  allowed: readonly string[];
  /** The weakest letter — text should over-represent it. null when none is weak. */
  focus: string | null;
}

/** A pre-tagged unit of practice text. */
export interface Passage {
  id: string;
  /** The text to type, with natural capitalisation and punctuation preserved. */
  text: string;
  /**
   * Per-letter counts within `text` (lowercased, letters only). Pre-computed so
   * lookups stay a pure, fast operation at runtime.
   */
  keyHistogram: Readonly<Record<string, number>>;
  /** Sum of keyHistogram values — total typeable letters in `text`. */
  letterCount: number;
}
