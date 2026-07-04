// Deterministic PRNG (mulberry32), ported VERBATIM from the client
// (src/game/world/rng.ts). The server generates the same camp layout the client
// draws props for, so both must draw the identical pseudo-random sequence.
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
