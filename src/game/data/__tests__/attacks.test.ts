import { describe, expect, it } from 'vitest';

// Import the real registry across the package boundary (server module → client
// vitest runner), same mechanism as crit.test.ts — not a local re-implementation.
import {
  ATTACKS,
  ATTACK_STATE_IDLE,
  ATTACK_STATE_RECOVERY,
  ATTACK_STATE_STRIKE,
  ATTACK_STATE_WINDUP,
  UNIT_ATTACKS,
  UNIT_KIND_GOLIATH,
  selectAttack,
} from '../../../../spacetimedb/src/attacks';

describe('ATTACKS registry (FSM-04 data-driven attacks)', () => {
  it('leapSlam carries every locked D4 timing/geometry/reaction number', () => {
    // D4-01 windup, D4-02 grace, D4-04 damage, D4-05 radii, D4-06 recovery,
    // D4-07 cooldown, D4-10 knockback + stun — all live as DATA, never code.
    expect(ATTACKS.leapSlam).toEqual({
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
      knockback: 6,
      stunTicks: 2,
      move: 'leap',
      poiseThreshold: 600,
    });
  });

  it.each(Object.entries(ATTACKS))(
    '%s durations are exact tick multiples (integer windup >= 2, integer recovery)',
    (_, spec) => {
      // FSM-05: windups authored as exact tick multiples, >= 0.35s (2 ticks).
      expect(Number.isInteger(spec.windupTicks)).toBe(true);
      expect(spec.windupTicks).toBeGreaterThanOrEqual(2);
      expect(Number.isInteger(spec.recoveryTicks)).toBe(true);
    }
  );

  it('UNIT_ATTACKS maps the goliath unit kind to a default list containing leapSlam', () => {
    // FSM-04: a new unit is one list; every listed id must resolve in ATTACKS.
    expect(UNIT_ATTACKS[UNIT_KIND_GOLIATH].default).toEqual(['leapSlam']);
    for (const lists of Object.values(UNIT_ATTACKS)) {
      for (const attackIds of Object.values(lists)) {
        for (const attackId of attackIds) expect(ATTACKS[attackId]).toBeDefined();
      }
    }
  });

  it('attack state consts are the distinct u32-friendly values 0..3', () => {
    expect([
      ATTACK_STATE_IDLE,
      ATTACK_STATE_WINDUP,
      ATTACK_STATE_STRIKE,
      ATTACK_STATE_RECOVERY,
    ]).toEqual([0, 1, 2, 3]);
  });
});

describe('selectAttack (FSM-03 selection, D4-08 rhythm)', () => {
  const available = UNIT_ATTACKS[UNIT_KIND_GOLIATH].default;

  it('returns leapSlam for EVERY distance 0..maxBand when off cooldown (ATK-05 dead-zone sweep)', () => {
    for (let distance = 0; distance <= 8; distance += 0.25) {
      expect(selectAttack(distance, 0n, 0n, available), `dead zone at d=${distance}`).toBe(
        'leapSlam'
      );
    }
  });

  it('returns null while nowMicros < cooldownUntilMicros (cooldown gates the skill)', () => {
    expect(selectAttack(4, 999n, 1000n, available)).toBeNull();
  });

  it('boundary: nowMicros exactly equal to cooldownUntilMicros is OFF cooldown (>=, not >)', () => {
    expect(selectAttack(4, 1000n, 1000n, available)).toBe('leapSlam');
  });

  it('returns null when distance exceeds maxBand of every available attack (chase sentinel)', () => {
    expect(selectAttack(8.25, 0n, 0n, available)).toBeNull();
  });
});
