// The single geometric definition of "did an attack at `center` (radius `radius`)
// land on an entity at (entityX, entityZ)". The client uses this to decide combo
// + projectile despawn; the SERVER's attackEnemies reducer damages with the exact
// same 2D check (distanceBetween(enemy, center) <= radius). Keeping them identical
// is what guarantees combo only ticks when the server actually deals damage — a
// wider client radius previously counted combo on hits the server never applied.
//
// The server clamps the radius to MAX_ATTACK_RADIUS before this check; mirror that
// here so the two sides agree for oversized radii too.
export const MAX_ATTACK_RADIUS = 20;

export function attackHitsEntity(
  entityX: number,
  entityZ: number,
  centerX: number,
  centerZ: number,
  radius: number
): boolean {
  const boundedRadius = Math.max(0, Math.min(radius, MAX_ATTACK_RADIUS));
  return Math.hypot(entityX - centerX, entityZ - centerZ) <= boundedRadius;
}
