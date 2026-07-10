// Data-driven attack registry + pure selection fn, kept dependency-free so it can
// be unit-tested directly under the client's vitest runner (same pattern as
// crit.ts / combatMath.ts). Zero dependencies, no global randomness, no wall-clock
// time — every timestamp arrives as an injected bigint-micros argument, which
// preserves the calling reducer's determinism (CLAUDE.md rule 2).
//
// FSM-04: an attack is ONE entry in ATTACKS; a new unit archetype is ONE list in
// UNIT_ATTACKS. All timing/geometry/reaction numbers live here as DATA — the FSM
// and the client renderer never hardcode them.

// Unit kinds the unit-agnostic FSM discriminates on (u32-friendly, matching the
// existing aggroKind idiom). Goliaths are the only FSM-driven unit this milestone;
// camp enemies + heroes reuse the same kind space later with zero schema change.
export const UNIT_KIND_GOLIATH = 0;

// Attack FSM states (u32-friendly). IDLE → WINDUP → STRIKE → RECOVERY → IDLE.
export const ATTACK_STATE_IDLE = 0;
export const ATTACK_STATE_WINDUP = 1;
export const ATTACK_STATE_STRIKE = 2;
export const ATTACK_STATE_RECOVERY = 3;

// Registry fields locked by D4-04..D4-10; one entry = one attack (FSM-04).
export interface AttackSpec {
  shape: 'circle' | 'cone' | 'lane'; // circle ships now; cone/lane = Phases 5/6
  role: 'skill' | 'basic'; // D4-08 rhythm: skill preferred when off cooldown
  windupTicks: number; // EXACT tick multiples (FSM-05); 8 = 1.2s
  activeTicks: number; // strike window; 1 for leapSlam
  graceTicks: number; // D4-02 dodge grace; 1 = ~150ms
  recoveryTicks: number; // 8 = 1.2s (D4-06)
  cooldownMicros: bigint; // 3_500_000n micros (D4-07; Phase-5 retune noted)
  radiusBySize: readonly number[]; // positionally aligned with sizeIndex, like GOLIATH_SIZE_STATS (D4-05)
  damageMultiplier: number; // x unit contactDamage -> 405/585/765 (D4-04)
  minBand: number; // 0 this phase — no point-blank dead zone (ATK-05)
  maxBand: number; // <= ~8u so the leap stays under the client SNAP_DISTANCE
  knockback: number; // displacement units on hit (D4-10)
  stunTicks: number; // D4-09: hit reaction is per-attack DATA; ticks × 150ms tick
  move: 'none' | 'leap' | 'charge'; // 'leap' teleports to landing at strike
  poiseThreshold: number; // consumed Phase 7; field exists now (FSM-04)
}

export const ATTACKS: Record<string, AttackSpec> = {
  leapSlam: {
    shape: 'circle',
    role: 'skill',
    windupTicks: 8,
    activeTicks: 1,
    graceTicks: 1,
    recoveryTicks: 8,
    cooldownMicros: 3_500_000n,
    radiusBySize: [4.0, 4.75, 5.5],
    damageMultiplier: 4.5,
    minBand: 0,
    maxBand: 8,
    knockback: 6, // doubled from 3 after 04-07 local playtest — landed slam must throw players clear
    stunTicks: 7, // 2 -> 7 (~1.05s) after 04-07 playtest — 0.3s read as a stutter, not a stun
    move: 'leap',
    poiseThreshold: 600,
  },
};

// Per-archetype attack lists keyed by unit kind — a new unit is one list (FSM-04).
export const UNIT_ATTACKS: Record<number, Record<string, readonly string[]>> = {
  [UNIT_KIND_GOLIATH]: { default: ['leapSlam'] },
};

// Picks the attack a unit should open at the given distance (FSM-03), following
// the D4-08 rhythm verbatim:
//   - a 'skill' attack whose band contains the distance AND that is off cooldown
//     wins (maximize DPS);
//   - else a 'basic' attack in band fills the gap (none exist in Phase 4);
//   - else null = keep chasing.
// Band test: minBand <= distance <= maxBand. Cooldown test: nowMicros >=
// cooldownUntilMicros. leapSlam's band 0..8 covers every distance this phase (no
// facetank dead zone, ATK-05); Phases 5/6 SPLIT bands by adding entries, never
// reshaping existing ones.
export function selectAttack(
  distance: number,
  nowMicros: bigint,
  cooldownUntilMicros: bigint,
  available: readonly string[]
): string | null {
  let basicInBand: string | null = null;
  for (const attackId of available) {
    const spec = ATTACKS[attackId];
    if (!spec) continue;
    if (distance < spec.minBand || distance > spec.maxBand) continue;
    if (spec.role === 'skill') {
      if (nowMicros >= cooldownUntilMicros) return attackId;
      continue;
    }
    if (basicInBand === null) basicInBand = attackId;
  }
  return basicInBand;
}
