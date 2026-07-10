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
    // D5-09 cooldown retune, D4-10 knockback + stun — all live as DATA, never
    // code. NO chainsInto/coneMinDot: the optional Phase-5 fields stay absent.
    expect(ATTACKS.leapSlam).toEqual({
      shape: 'circle',
      role: 'skill',
      windupTicks: 8,
      activeTicks: 1,
      graceTicks: 1,
      recoveryTicks: 8,
      cooldownMicros: 5_500_000n,
      radiusBySize: [4.0, 4.75, 5.5],
      damageMultiplier: 4.5,
      minBand: 0,
      maxBand: 8,
      knockback: 6,
      stunTicks: 7,
      move: 'leap',
      poiseThreshold: 600,
    });
  });

  it('swordSwing is a cone basic that chains into swordSwirl (D5-01/D5-06/D5-10..12)', () => {
    const swing = ATTACKS.swordSwing;
    expect(swing.shape).toBe('cone');
    expect(swing.role).toBe('basic');
    expect(swing.chainsInto).toBe('swordSwirl');
    expect(swing.coneMinDot).toBe(0.5); // cos 60° → 120° full angle (D5-06)
    expect(swing.radiusBySize).toEqual([3.0, 3.5, 4.0]); // reused as cone RANGE (D5-06)
    expect(swing.damageMultiplier).toBe(1.5); // D5-10
    expect(swing.knockback).toBe(0);
    expect(swing.stunTicks).toBe(4); // stun-only 0.6s (D5-12)
  });

  it('swordSwirl is a circle finisher: no chain, throw-clear knockback, chain cooldown (D5-11..13)', () => {
    const swirl = ATTACKS.swordSwirl;
    expect(swirl.shape).toBe('circle');
    expect(swirl.role).toBe('basic'); // finishing attack's role writes the basic cooldown (D5-13)
    expect(swirl.chainsInto).toBeUndefined();
    expect(swirl.coneMinDot).toBeUndefined();
    expect(swirl.windupTicks).toBe(5); // 0.75s chain warning (D5-11)
    expect(swirl.cooldownMicros).toBe(2_500_000n); // THE chain cooldown (D5-13)
    expect(swirl.radiusBySize).toEqual([4.0, 4.5, 5.0]);
    expect(swirl.damageMultiplier).toBe(2.5); // D5-10
    expect(swirl.knockback).toBe(4.5); // throw clear (D5-12)
    expect(swirl.stunTicks).toBe(0);
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

  it('UNIT_ATTACKS maps the goliath unit kind to [leapSlam, swordSwing] — swirl only via chain (D5-03)', () => {
    // FSM-04: a new unit is one list; every listed id must resolve in ATTACKS.
    expect(UNIT_ATTACKS[UNIT_KIND_GOLIATH].default).toEqual(['leapSlam', 'swordSwing']);
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

describe('selectAttack (FSM-03 selection, D4-08 rhythm + D5-08 basic gate)', () => {
  const available = UNIT_ATTACKS[UNIT_KIND_GOLIATH].default;

  it('returns leapSlam for EVERY distance 0..maxBand when off cooldown (ATK-05 dead-zone sweep)', () => {
    for (let distance = 0; distance <= 8; distance += 0.25) {
      expect(selectAttack(distance, 0n, 0n, 0n, available), `dead zone at d=${distance}`).toBe(
        'leapSlam'
      );
    }
  });

  it('returns null while nowMicros < skill cooldown and no basic is in band (cooldown gates the skill)', () => {
    expect(selectAttack(4, 999n, 1000n, 0n, available)).toBeNull();
  });

  it('boundary: nowMicros exactly equal to skill cooldownUntilMicros is OFF cooldown (>=, not >)', () => {
    expect(selectAttack(4, 1000n, 1000n, 0n, available)).toBe('leapSlam');
  });

  it('returns null when distance exceeds maxBand of every available attack (chase sentinel)', () => {
    expect(selectAttack(8.25, 0n, 0n, 0n, available)).toBeNull();
  });

  it('returns null when the in-band basic is still on ITS cooldown (D5-08 basic gate)', () => {
    // d=2 puts swordSwing in band (0..3.5); the skill is on cooldown; the basic
    // cooldown has not elapsed → nothing fires, chase continues.
    expect(selectAttack(2, 999n, 5000n, 1000n, available)).toBeNull();
  });

  it('boundary: nowMicros EXACTLY equal to basicCooldownUntilMicros returns the basic (inclusive >=)', () => {
    expect(selectAttack(2, 1000n, 5000n, 1000n, available)).toBe('swordSwing');
  });

  it('returns null at d=5 with the skill on cooldown (swing band is 0..3.5, chase sentinel D5-09)', () => {
    expect(selectAttack(5, 0n, 1000n, 0n, available)).toBeNull();
  });

  it('prefers the skill over the in-band basic when both are off cooldown (D4-08 rhythm)', () => {
    expect(selectAttack(2, 0n, 0n, 0n, available)).toBe('leapSlam');
  });
});
