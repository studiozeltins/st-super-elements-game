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

/** How a single ground gem looks, chosen by its value. */
export interface GemVisual {
  /** Octahedron radius. */
  radius: number;
  /** Core + emissive color. */
  color: number;
  /** Emissive strength (brightness). */
  emissiveIntensity: number;
  /** Halo sphere opacity — bigger gems glow more. */
  haloOpacity: number;
}

// One visual per denomination tier. Higher value = larger, brighter, and shifts
// hue up through gold into cyan/magenta so tiers read apart at a glance.
const GEM_VISUALS: Record<number, GemVisual> = {
  1: { radius: 0.28, color: 0xbfa24a, emissiveIntensity: 0.45, haloOpacity: 0.1 },
  5: { radius: 0.34, color: 0xd8b24e, emissiveIntensity: 0.55, haloOpacity: 0.12 },
  10: { radius: 0.4, color: 0xf2c14e, emissiveIntensity: 0.65, haloOpacity: 0.14 },
  20: { radius: 0.48, color: 0xffd15c, emissiveIntensity: 0.75, haloOpacity: 0.17 },
  50: { radius: 0.58, color: 0xffe08a, emissiveIntensity: 0.9, haloOpacity: 0.2 },
  100: { radius: 0.7, color: 0x9fe8ff, emissiveIntensity: 1.05, haloOpacity: 0.24 },
  500: { radius: 0.9, color: 0xff8af0, emissiveIntensity: 1.25, haloOpacity: 0.3 },
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
