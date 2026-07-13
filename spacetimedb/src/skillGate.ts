// Pure skill-window math, kept dependency-free so it can be unit-tested directly
// under the client's vitest runner (same pattern as crit.ts / combatMath.ts).
// No dependencies, no global randomness, no wall-clock reads — every input is a
// plain argument (the current time is INJECTED as a bigint of micros), which
// preserves the calling reducer's determinism (CLAUDE.md rule 2). In Phase 2
// wiring, the reducer's injected time source slots into `nowMicros`, so the skill
// cooldown gate stays server-authoritative and replayable.

// Grants the skill window when the hit is a skill AND the injected time has not
// passed the window end. The bound is INCLUSIVE (`<=`): a hit landing exactly on
// the window end still grants — one micro past does not.
export function skillGrantActive(
  isSkill: boolean,
  nowMicros: bigint,
  windowEndsAtMicros: bigint
): boolean {
  return isSkill && nowMicros <= windowEndsAtMicros;
}

// The absolute time (micros) at which the skill is ready again: the injected now
// plus the cooldown converted seconds → micros (rounded to the nearest micro).
export function nextSkillReadyAt(nowMicros: bigint, cooldownSeconds: number): bigint {
  return nowMicros + BigInt(Math.round(cooldownSeconds * 1_000_000));
}
