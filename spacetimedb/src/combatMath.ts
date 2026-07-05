// Pure combat math shared by the world tick. Kept dependency-free so it can be
// unit-tested directly under the client's vitest runner.

// Converts a per-second rate (enemy/goliath contactDamage is authored per second)
// into the damage a single tick of the given length applies.
export function damagePerTick(damagePerSecond: number, tickMicros: bigint): number {
  return damagePerSecond * (Number(tickMicros) / 1_000_000);
}

// The 5-minute window bucket a timestamp falls in (goliaths spawn once per bucket).
export function windowBucketFor(nowMicros: bigint, windowMicros: bigint): bigint {
  return nowMicros / windowMicros;
}

// Planar (x/z) distance between two points.
export function distanceBetween(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

// A ground gem is collectible only after its grace period has elapsed, so a fresh
// drop visibly falls and rests before any enemy, goliath, or player can take it.
export function gemIsCollectible(droppedAtMicros: bigint, nowMicros: bigint, delayMicros: bigint): boolean {
  return nowMicros - droppedAtMicros >= delayMicros;
}

// Moves a point toward a target by at most `step`, returning the new x/z. Never
// overshoots; returns the target when already within one step.
export function stepToward(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  step: number
): { x: number; z: number } {
  const deltaX = toX - fromX;
  const deltaZ = toZ - fromZ;
  const distance = Math.hypot(deltaX, deltaZ);
  if (distance <= step || distance === 0) return { x: toX, z: toZ };
  return { x: fromX + (deltaX / distance) * step, z: fromZ + (deltaZ / distance) * step };
}
