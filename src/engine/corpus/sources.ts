/**
 * Pluggable corpus sources — the abstraction that lets bundled quotes,
 * bundled articles, user uploads, and the existing generators all feed
 * the typing engine through one interface.
 *
 * Each source returns `CorpusEntry` values; the Session layer adapts those
 * to its `Passage` shape. Pure TS — no DOM, no Vite globs, no IDB. Loaders
 * for each kind live in `io/corpus/`.
 */

export type SourceKind = "drills" | "difficult" | "quote" | "code" | "user";

export interface CorpusAttribution {
  author?: string;
  title?: string;
  url?: string;
  /**
   * Plain-text license declaration shown to the user. Examples:
   * "public domain", "fair-use snippet", "CC-BY-SA from Wikiquote".
   */
  license: string;
}

export interface CorpusEntry {
  /** Stable id used in run results for attribution lookup. */
  id: string;
  kind: SourceKind;
  text: string;
  /** Lowercase letters appearing in `text` — pre-computed for fast filter. */
  alphabet: ReadonlySet<string>;
  /** Length of `text` in code units. */
  length: number;
  /** Required for `quote` / `user`; omitted for the generator-backed
   * sources (`drills`, `difficult`). */
  attribution?: CorpusAttribution;
}

export interface CorpusSourceContext {
  /**
   * Allowed letters for adaptive mode. Every letter in a returned entry's
   * `alphabet` must be a member. `undefined` means "no alphabet constraint" —
   * the benchmark-mode case.
   */
  filter?: ReadonlySet<string>;
  /** Approximate desired length in characters. Source may return ±50%. */
  wantedChars: number;
  /** RNG in [0, 1). Pure for determinism in tests. */
  rng: () => number;
}

export interface CorpusSource {
  /** Pick one entry matching the context. Returns null if none fit. */
  pick(ctx: CorpusSourceContext): CorpusEntry | null;
}

/* ───────────────────────── helpers ─────────────────────────── */

const LETTER = /\p{Letter}/u;

/** Returns the set of lowercase letters appearing in `text`. */
export function alphabetOf(text: string): ReadonlySet<string> {
  const set = new Set<string>();
  for (const ch of text) {
    if (LETTER.test(ch)) {
      set.add(ch.toLowerCase());
    }
  }
  return set;
}

/** True iff every letter in `entry.alphabet` is in `filter`. */
export function fitsAlphabet(entry: CorpusEntry, filter: ReadonlySet<string>): boolean {
  for (const letter of entry.alphabet) {
    if (!filter.has(letter)) return false;
  }
  return true;
}

/**
 * Score how close an entry's length is to the wanted length. Returns a value
 * in [0, 1] — 1 means "perfect match". Triangular kernel peaking at ratio=1,
 * sloping linearly to 0 at ratio=0.5 (left edge) and ratio=3 (right edge).
 * Ratios outside that range score 0 — entries far from the wanted size are
 * effectively skipped during weighted picking.
 */
export function lengthScore(entryLength: number, wantedChars: number): number {
  if (wantedChars <= 0) return 0;
  const ratio = entryLength / wantedChars;
  if (ratio < 0.5 || ratio > 3) return 0;
  if (ratio <= 1) return 2 * ratio - 1;
  return (3 - ratio) / 2;
}

/**
 * Pick a random entry from `candidates`, weighted by `lengthScore`. Returns
 * null if `candidates` is empty.
 */
export function pickWeightedByLength(
  candidates: readonly CorpusEntry[],
  wantedChars: number,
  rng: () => number,
): CorpusEntry | null {
  if (candidates.length === 0) return null;
  const weights = candidates.map((c) => Math.max(0.01, lengthScore(c.length, wantedChars)));
  const total = weights.reduce((sum, w) => sum + w, 0);
  let pick = rng() * total;
  for (let i = 0; i < candidates.length; i++) {
    pick -= weights[i] ?? 0;
    if (pick <= 0) {
      const entry = candidates[i];
      if (entry !== undefined) return entry;
    }
  }
  return candidates[candidates.length - 1] ?? null;
}

/**
 * Build a `CorpusEntry` from the raw fields. Pre-computes `alphabet` so
 * subsequent `fitsAlphabet` checks stay fast.
 */
export function makeEntry(
  id: string,
  kind: SourceKind,
  text: string,
  attribution?: CorpusAttribution,
): CorpusEntry {
  return {
    id,
    kind,
    text,
    alphabet: alphabetOf(text),
    length: text.length,
    ...(attribution ? { attribution } : {}),
  };
}
