// Pure crit-roll decision, kept dependency-free so it can be unit-tested directly
// under the client's vitest runner (same pattern as deathPenalty.ts / combatMath.ts).
// Zero dependencies, no global randomness, no wall-clock time — the randomness is
// INJECTED as the `rng` thunk, which preserves the calling reducer's determinism
// (CLAUDE.md rule 2). In Phase 2 wiring, the reducer's injected random source
// (a `() => number` in [0,1)) slots into `rng`, so the crit decision stays
// server-authoritative and replayable.

export interface CritRoll {
  isCrit: boolean;
  multiplier: number;
}

// Rolls a crit against `critRate` using an injected rng thunk. The decision is a
// strict `rng() < critRate` (so rng() === critRate does NOT crit). On a crit the
// multiplier is `critDmg` VERBATIM — critDmg is stored as a FULL multiplier
// (e.g. 1.9), not a bonus fraction — otherwise the multiplier is 1.
export function rollCrit(critRate: number, critDmg: number, rng: () => number): CritRoll {
  const isCrit = rng() < critRate;
  return { isCrit, multiplier: isCrit ? critDmg : 1 };
}
