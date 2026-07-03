/**
 * Deterministic PRNG (mulberry32). World generation must produce identical
 * results on every client, otherwise multiplayer positions would disagree.
 */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic 2D integer hash → [0, 1). Stable across platforms. */
export function hashGridPoint(gridX: number, gridZ: number, seed: number): number {
  let hash = Math.imul(gridX, 374761393) ^ Math.imul(gridZ, 668265263) ^ seed;
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}
