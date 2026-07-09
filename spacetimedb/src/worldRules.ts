// Pure world-rule predicates shared by index.ts (worldTick, movement, damage
// apply) and unitAttacks.ts (attack targeting, strike resolution, knockback
// destinations). Kept dependency-free — no ctx, no clock, no randomness — so
// both sides import the SAME rules without a circular index.ts dependency:
// SpacetimeDB rejects a module whose entry file exports plain helpers
// ("exporting something that is not a spacetime export"), so these can never
// live as index.ts exports.

// Keep in sync with src/game/data/constants.ts (archipelago extent).
const MOVEMENT_LIMIT = 135;
const SAFE_ZONE_RADIUS = 18;

// Knockback destinations and every server-driven step respect the same bounds.
export function clampToWorld(coordinate: number) {
  return Math.max(-MOVEMENT_LIMIT, Math.min(MOVEMENT_LIMIT, coordinate));
}

// The spawn-centered no-combat bubble: no damage in, no aggro pull-out.
export function isInsideSafeZone(positionX: number, positionZ: number) {
  return Math.hypot(positionX, positionZ) <= SAFE_ZONE_RADIUS;
}

// An aggro window of 0 means "never aggroed"; otherwise it expires at its deadline.
export function aggroExpired(expiresAtMicros: bigint, nowMicros: bigint): boolean {
  return expiresAtMicros !== 0n && nowMicros >= expiresAtMicros;
}
