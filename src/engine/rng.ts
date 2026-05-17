/**
 * Mulberry32 — a tiny, fast, seeded PRNG. Returns a function producing values
 * in [0, 1). Used for reproducible lessons and deterministic tests, so the
 * engine never has to reach for the non-deterministic global `Math.random`.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
