// Pure ray-vs-entities geometry shared by the server's ranged hitscan reducer.
// Kept dependency-free so it can be unit-tested directly under the client's
// vitest runner (see src/game/combat/__tests__/hitscan.test.ts).

// Nearest entity struck by a ray from (originX,originZ) heading (dirX,dirZ) up to
// `range`, whose position lies within `hitRadius` of the ray segment. "Nearest" =
// smallest forward projection (a projectile hits the first thing it flies into).
// Returns { index, alongRay } with index -1 if nothing is hit. Ignores entities
// behind the origin. Guards a zero-length / non-finite direction (returns -1).
export function pickRayHit(
  positions: readonly { x: number; z: number }[],
  originX: number,
  originZ: number,
  dirX: number,
  dirZ: number,
  range: number,
  hitRadius: number
): { index: number; alongRay: number } {
  const miss = { index: -1, alongRay: 0 };
  if (
    !Number.isFinite(originX) ||
    !Number.isFinite(originZ) ||
    !Number.isFinite(dirX) ||
    !Number.isFinite(dirZ) ||
    !Number.isFinite(range) ||
    !Number.isFinite(hitRadius)
  ) {
    return miss;
  }
  const dirLength = Math.hypot(dirX, dirZ);
  if (dirLength === 0) return miss;
  const normalizedX = dirX / dirLength;
  const normalizedZ = dirZ / dirLength;

  let bestIndex = -1;
  let bestAlongRay = Infinity;
  for (let index = 0; index < positions.length; index++) {
    const position = positions[index];
    const alongRay =
      (position.x - originX) * normalizedX + (position.z - originZ) * normalizedZ;
    if (alongRay < 0) continue; // behind the origin
    if (alongRay > range) continue; // beyond the ray's reach
    const closestX = originX + normalizedX * alongRay;
    const closestZ = originZ + normalizedZ * alongRay;
    const perpendicular = Math.hypot(position.x - closestX, position.z - closestZ);
    if (perpendicular > hitRadius) continue;
    if (alongRay < bestAlongRay) {
      bestAlongRay = alongRay;
      bestIndex = index;
    }
  }
  return bestIndex === -1 ? miss : { index: bestIndex, alongRay: bestAlongRay };
}
