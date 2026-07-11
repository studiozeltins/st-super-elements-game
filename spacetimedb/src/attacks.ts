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
// heroes reuse the same kind space later with zero schema change.
export const UNIT_KIND_GOLIATH = 0;
// Camp enemies. Not FSM-driven — slime hop landings (enemyMovement.ts) emit
// attack_strike events with this kind ('slimeSlam'/'spikySlam') so clients can
// play the squash on a landed slam; those ids are deliberately NOT in ATTACKS
// (the slam has no windup/recovery FSM shape, its radius rides the event row).
export const UNIT_KIND_ENEMY = 1;

// Attack FSM states (u32-friendly). IDLE → WINDUP → STRIKE → RECOVERY → IDLE.
export const ATTACK_STATE_IDLE = 0;
export const ATTACK_STATE_WINDUP = 1;
export const ATTACK_STATE_STRIKE = 2;
export const ATTACK_STATE_RECOVERY = 3;

// Registry fields locked by D4-04..D4-10 + D5-01..D5-13; one entry = one attack (FSM-04).
export interface AttackSpec {
  shape: 'circle' | 'cone' | 'lane'; // circle + cone live; lane = Phase 6
  role: 'skill' | 'basic'; // D4-08 rhythm: skill preferred when off cooldown
  windupTicks: number; // EXACT tick multiples (FSM-05); 8 = 1.2s
  activeTicks: number; // strike window; 1 for leapSlam
  graceTicks: number; // D4-02 dodge grace; 1 = ~150ms
  recoveryTicks: number; // 8 = 1.2s (D4-06)
  cooldownMicros: bigint; // per-role: skill → cooldownUntilMicros, basic → basicCooldownUntilMicros (D5-08)
  radiusBySize: readonly number[]; // positionally aligned with sizeIndex, like GOLIATH_SIZE_STATS (D4-05); a cone reuses it as RANGE (D5-06)
  damageMultiplier: number; // x unit contactDamage -> 405/585/765 (D4-04)
  minBand: number; // 0 this phase — no point-blank dead zone (ATK-05)
  maxBand: number; // <= ~8u so the leap stays under the client SNAP_DISTANCE
  knockback: number; // displacement units on hit (D4-10)
  stunTicks: number; // D4-09: hit reaction is per-attack DATA; ticks × 150ms tick
  move: 'none' | 'leap' | 'charge'; // 'leap' teleports to landing at strike
  poiseThreshold: number; // consumed Phase 7; field exists now (FSM-04)
  chainsInto?: string; // D5-01: chaining is DATA — RECOVERY re-enters WINDUP on this attack id
  coneMinDot?: number; // D5-06: cos(half-angle) for shape 'cone'; 0.5 = 120° full angle
  laneLengthBySize?: readonly number[]; // D6-03: charge distance per size for shape 'lane'; each <= 8 (client SNAP_DISTANCE ceiling — a bigger strike-frame gap snaps instead of lerping)
}

export const ATTACKS: Record<string, AttackSpec> = {
  leapSlam: {
    shape: 'circle',
    role: 'skill',
    windupTicks: 8,
    activeTicks: 1,
    graceTicks: 1,
    recoveryTicks: 8,
    cooldownMicros: 5_500_000n, // 3.5s -> 5.5s (D5-09 playtest seed): the slam is the rhythm's punctuation now that the swing chain fills the melee band
    radiusBySize: [4.0, 4.75, 5.5],
    damageMultiplier: 4.5,
    minBand: 0,
    // 8 -> 5.5 (RESEARCH Pitfall 1 — playtest seed, D-02 latitude): under the
    // SHARED skill cooldown (D6-06) and slam-first list order (D6-07), a slam
    // band of 0..8 fully shadows the dash band 3.5..8, making shieldDash
    // unreachable dead code. 5.5 creates the dash-only 5.5..8 zone the D6-07
    // after-whiff emergence story requires. DOCUMENTED DEVIATION from D6-07's
    // literal numbers — surfaced for user confirmation at the 06-05 playtest
    // checkpoint.
    maxBand: 5.5,
    knockback: 6, // doubled from 3 after 04-07 local playtest — landed slam must throw players clear
    stunTicks: 7, // 2 -> 7 (~1.05s) after 04-07 playtest — 0.3s read as a stutter, not a stun
    move: 'leap',
    poiseThreshold: 600,
  },
  swordSwing: {
    shape: 'cone', // ATK-02: forward cone resolved by resolveCone
    role: 'basic', // fills the melee band the slam cooldown leaves open (D5-08)
    windupTicks: 4, // 0.6s readable-but-quick opener (D5-11 playtest seed)
    activeTicks: 1,
    graceTicks: 1,
    recoveryTicks: 8, // INERT — the swing always chains, RECOVERY is never entered (D5-01)
    cooldownMicros: 2_500_000n, // INERT — the swing never reaches IDLE; the swirl writes the chain cooldown (D5-13)
    radiusBySize: [3.0, 3.5, 4.0], // reused as CONE RANGE per size (D5-06 playtest seed)
    damageMultiplier: 1.5, // 135/195/255 per size (D5-10 playtest seed)
    minBand: 0,
    maxBand: 3.5, // basic melee band; beyond it the goliath chases or slams (D5-09)
    knockback: 0, // stun-only opener — the victim must stay in swirl range (D5-12)
    stunTicks: 4, // 0.6s tag so the swirl windup is a real escape race (D5-12 playtest seed)
    move: 'none',
    poiseThreshold: 600,
    chainsInto: 'swordSwirl', // D5-01: the chain is DATA, not FSM code
    coneMinDot: 0.5, // cos 60° → 120° full swing arc (D5-06)
  },
  swordSwirl: {
    shape: 'circle', // self-centered AoE spin (D5-04)
    role: 'basic', // the FINISHING attack's role writes the basic cooldown (D5-13)
    windupTicks: 5, // 0.75s chain warning — the escape window after the swing stun (D5-11 playtest seed)
    activeTicks: 1,
    graceTicks: 1,
    recoveryTicks: 8, // 1.2s — the chain's single punish window (D5-11)
    cooldownMicros: 2_500_000n, // THE chain cooldown, written at IDLE into basicCooldownUntilMicros (D5-13)
    // Escape-race arithmetic (RESEARCH Pitfall 9 — tune informed): swing stun 4
    // ticks eats most of the 5-tick swirl windup, leaving ~1 tick + grace
    // (~0.3s) of free run ≈ 2.5u at player speed 8.4u/s; a victim tagged at the
    // cone edge starts ~3-4u out, so 4.0-5.0u radii make escape tight but real.
    // Full windup outrun budget if never tagged: 0.75s × 8.4 ≈ 6.3u.
    radiusBySize: [4.0, 4.5, 5.0], // escape-race seed (D5-06/Pitfall 9 playtest seed)
    damageMultiplier: 2.5, // 225/325/425 per size (D5-10 playtest seed)
    minBand: 0, // INERT — never selectable directly (D5-03); authored to swing's values for parity sanity
    maxBand: 3.5, // INERT (D5-03)
    knockback: 4.5, // throw clear so the chain cannot re-tag instantly (D5-12 playtest seed)
    stunTicks: 0,
    move: 'none',
    poiseThreshold: 600,
  },
  shieldDash: {
    shape: 'lane', // ATK-04: capsule test via resolveLane along the cast->landing charge path
    role: 'skill', // D6-06: writes the SHARED cooldownUntilMicros at IDLE — slam and dash gate each other
    windupTicks: 6, // 0.9s (D6-08 playtest seed) — the dodge is a short sidestep, not a sprint; aggressive vs the slam's 1.2s
    activeTicks: 1,
    graceTicks: 1, // D4-02 verbatim (serverSync locks graceTicks === 1)
    recoveryTicks: 8, // 1.2s whiffed-charge punish window at the lane end (D6-08)
    cooldownMicros: 6_000_000n, // 6.0s (D6-08 playtest seed)
    radiusBySize: [1.6, 1.8, 2.0], // lane HALF-WIDTH per size (D6-03 playtest seed) — row.radius carries it to the client, no mirror field needed
    // D6-03 seeds (playtest); size 2 backed off from the locked 8.0 to 7.95
    // (RESEARCH Pitfall 2): 8.0 sits exactly ON the client's strict-greater
    // SNAP_DISTANCE comparison — a float epsilon would render the size-2 charge
    // as a teleport. DOCUMENTED DEVIATION, confirmed-or-retuned at the 06-05
    // playtest checkpoint.
    laneLengthBySize: [6.5, 7.25, 7.95],
    damageMultiplier: 2.5, // 225/325/425 per size (D6-09 playtest seed) — between the swing chain and the slam
    minBand: 3.5, // D6-07: point-blank belongs to the swing's melee band — no zero-distance body slam
    maxBand: 8, // ≈ lane reach (length + halfWidth >= 8 for every size)
    knockback: 3.5, // perpendicular bulldoze OUT of the lane (D6-05/D6-10 playtest seed)
    stunTicks: 3, // 0.45s (D6-10 playtest seed) — parity: ATTACK_RENDER.stunSeconds 0.45
    move: 'charge', // D6-01: relocate-at-strike on the proven leap seam, resolve ONCE vs live positions
    poiseThreshold: 600,
  },
};

// Per-archetype attack lists keyed by unit kind — a new unit is one list (FSM-04).
// swordSwirl is deliberately ABSENT: it is reachable ONLY via the swing chain (D5-03).
// shieldDash is listed LAST (D6-07): list order decides skill ties, so the dash
// only wins where the slam is out of band (5.5..8) — the after-whiff gap-closer
// emerges from plain band selection, no weighting code.
export const UNIT_ATTACKS: Record<number, Record<string, readonly string[]>> = {
  [UNIT_KIND_GOLIATH]: { default: ['leapSlam', 'swordSwing', 'shieldDash'] },
};

// Picks the attack a unit should open at the given distance (FSM-03), following
// the D4-08 rhythm verbatim:
//   - a 'skill' attack whose band contains the distance AND that is off cooldown
//     wins (maximize DPS);
//   - else a 'basic' attack in band AND off the basic cooldown fills the gap
//     (D5-08: basics gate on their OWN per-role cooldown);
//   - else null = keep chasing.
// Band test: minBand <= distance <= maxBand. Cooldown tests: nowMicros >=
// skillCooldownUntilMicros / basicCooldownUntilMicros (inclusive >=, FSM-05
// boundary style). Both roles on cooldown at d <= 3.5, or nothing in band past
// its maxBand, means chase (chase sentinel, D5-09/D4-13).
export function selectAttack(
  distance: number,
  nowMicros: bigint,
  skillCooldownUntilMicros: bigint,
  basicCooldownUntilMicros: bigint,
  available: readonly string[]
): string | null {
  let basicInBand: string | null = null;
  for (const attackId of available) {
    const spec = ATTACKS[attackId];
    if (!spec) continue;
    if (distance < spec.minBand || distance > spec.maxBand) continue;
    if (spec.role === 'skill') {
      if (nowMicros >= skillCooldownUntilMicros) return attackId;
      continue;
    }
    if (nowMicros < basicCooldownUntilMicros) continue; // D5-08 basic gate
    if (basicInBand === null) basicInBand = attackId;
  }
  return basicInBand;
}
