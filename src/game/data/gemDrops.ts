// Gem-drop economy shared between the enemy system, the world renderer, and the
// server. A kill spills its whole hoard as many small gems in these
// denominations (largest first) rather than one fat gem, so several
// players/enemies can each grab a share. The visual of a ground gem is keyed off
// its amount: bigger denominations are larger, brighter, and a different hue.
//
// GEM_DENOMINATIONS and BOSS_GEM_MULTIPLIER MUST match spacetimedb/src/index.ts
// (enforced by src/game/data/__tests__/serverSync.test.ts).

export const GEM_DENOMINATIONS = [500, 100, 50, 20, 10, 5, 1] as const;

/** A boss kill pays this multiple of the base reward. Mirrors the server. */
export const BOSS_GEM_MULTIPLIER = 3;

/**
 * How a single ground gem looks, chosen by its value. Every gem is the same
 * (smallest) size; only the color tells denominations apart (no sparkle/glow
 * on any tier — playtest 2026-07-12).
 */
export interface GemVisual {
  /** Core + emissive color. */
  color: number;
}

// One color per denomination tier: gold family for the common tiers, shifting
// to cyan then magenta for the rare ones.
const GEM_VISUALS: Record<number, GemVisual> = {
  1: { color: 0xbfa24a },
  5: { color: 0xd8b24e },
  10: { color: 0xf2c14e },
  20: { color: 0xffd15c },
  50: { color: 0xffe08a },
  100: { color: 0x9fe8ff },
  500: { color: 0xff8af0 },
};

/** The largest denomination not exceeding the amount (amounts always ≥ 1). */
export function gemDenominationTier(amount: number): number {
  for (const denom of GEM_DENOMINATIONS) {
    if (amount >= denom) return denom;
  }
  return GEM_DENOMINATIONS[GEM_DENOMINATIONS.length - 1];
}

/** Visual for a ground gem of the given amount. */
export function gemVisual(amount: number): GemVisual {
  return GEM_VISUALS[gemDenominationTier(amount)];
}
