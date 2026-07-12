/**
 * Pure slot/fade rules for the persistent scorch decal pool.
 */
export interface ScorchSlot {
  activeSince: number;
  life: number;
  radius: number;
}

/** Free slot if any, else steal the oldest (ring-buffer behavior). */
export function acquireScorchSlot(
  slots: readonly (ScorchSlot | null)[],
  now: number
): number {
  let oldestIndex = 0;
  let oldestSince = now;
  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index];
    if (slot === null) return index;
    if (slot.activeSince < oldestSince) {
      oldestSince = slot.activeSince;
      oldestIndex = index;
    }
  }
  return oldestIndex;
}

/** 1 → 0 over life: long hold (nothing fades for the first 60%), then ease out. */
export function scorchOpacity(ageSeconds: number, lifeSeconds: number): number {
  if (ageSeconds <= 0) return 1;
  if (ageSeconds >= lifeSeconds) return 0;
  const holdFraction = 0.6;
  const fraction = ageSeconds / lifeSeconds;
  if (fraction <= holdFraction) return 1;
  const tail = (fraction - holdFraction) / (1 - holdFraction);
  return 1 - tail * tail;
}
