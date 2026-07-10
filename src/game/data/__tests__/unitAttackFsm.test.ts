import { describe, expect, it } from 'vitest';

// Import the real FSM math across the package boundary (server module → client
// vitest runner), same mechanism as crit.test.ts — not a local re-implementation.
import {
  ATTACKS,
  ATTACK_STATE_IDLE,
  ATTACK_STATE_RECOVERY,
  ATTACK_STATE_STRIKE,
  ATTACK_STATE_WINDUP,
} from '../../../../spacetimedb/src/attacks';
import {
  deadlinePassed,
  dueAttackTransitions,
  enterWindup,
  graceDeadline,
  recoveryDeadline,
  strikeDeadline,
  stunDeadline,
  walkAttackTransitions,
} from '../../../../spacetimedb/src/unitAttackFsm';

// The server world tick length, injected exactly like the reducer glue will.
const TICK = 150_000n;
const NOW = 1_000_000_000n;

describe('deadline math (injected-clock bigint micros)', () => {
  it('strikeDeadline = start + windupTicks * tick', () => {
    expect(strikeDeadline(NOW, 8, TICK)).toBe(NOW + 8n * TICK);
  });

  it('graceDeadline(strikeAt, 1, tick) === strikeAt + tick (D4-02 single resolution moment)', () => {
    const strikeAt = NOW + 8n * TICK;
    expect(graceDeadline(strikeAt, 1, TICK)).toBe(strikeAt + TICK);
  });

  it('recoveryDeadline(strikeAt, 1, 8, tick) === strikeAt + 9 * tick (grace + recovery)', () => {
    const strikeAt = NOW + 8n * TICK;
    expect(recoveryDeadline(strikeAt, 1, 8, TICK)).toBe(strikeAt + 9n * TICK);
  });

  it('stunDeadline(now, 2, tick) === now + 2 * tick (D4-10 HIT-01 window)', () => {
    expect(stunDeadline(NOW, 2, TICK)).toBe(NOW + 2n * TICK);
  });

  it('deadlinePassed is >= semantics: true at the exact deadline, false 1 microsecond before (FSM-05)', () => {
    const deadline = NOW + 8n * TICK;
    expect(deadlinePassed(deadline, deadline)).toBe(true);
    expect(deadlinePassed(deadline - 1n, deadline)).toBe(false);
    expect(deadlinePassed(deadline + 1n, deadline)).toBe(true);
  });
});

describe('enterWindup (ATK-01 landing lock + D4-12 root point)', () => {
  const spec = ATTACKS.leapSlam;
  const entry = enterWindup(NOW, TICK, spec, 2, 10, 20, 14, 26);

  it('stamps every timing field from the injected now/tick', () => {
    expect(entry.startedAtMicros).toBe(NOW);
    expect(entry.strikeAtMicros).toBe(NOW + 8n * TICK);
    // recoveryEndsAtMicros is written ONCE here (grace 1 + recovery 8 past strike).
    expect(entry.recoveryEndsAtMicros).toBe(entry.strikeAtMicros + 9n * TICK);
  });

  it('locks the landing at the CAST-time target sample and passes the cast root through', () => {
    expect(entry.landingX).toBe(14);
    expect(entry.landingZ).toBe(26);
    expect(entry.castX).toBe(10);
    expect(entry.castZ).toBe(20);
  });

  it('indexes the radius by sizeIndex (2 -> 5.5) and resets poise/strikeResolved', () => {
    expect(entry.radius).toBe(5.5);
    expect(entry.poise).toBe(0);
    expect(entry.strikeResolved).toBe(false);
    expect(entry.state).toBe(ATTACK_STATE_WINDUP);
  });

  it('clamps an out-of-range sizeIndex to the last radius entry', () => {
    expect(enterWindup(NOW, TICK, spec, 99, 0, 0, 0, 0).radius).toBe(5.5);
  });
});

describe('dueAttackTransitions (FSM-05 resolve-never-drop cascade)', () => {
  const startedAt = NOW;
  const strikeAt = startedAt + 8n * TICK;
  const graceAt = strikeAt + TICK;
  const recoveryEndsAt = strikeAt + 9n * TICK;

  it('WINDUP with a now that jumped two intervals past strikeAt emits [STRIKE, RECOVERY] in order', () => {
    // A coalesced/late tick at startedAt + 10 ticks passed BOTH the strike and the
    // grace deadlines — the strike is resolved exactly once, never dropped.
    expect(
      dueAttackTransitions(ATTACK_STATE_WINDUP, startedAt + 10n * TICK, strikeAt, graceAt, recoveryEndsAt)
    ).toEqual([ATTACK_STATE_STRIKE, ATTACK_STATE_RECOVERY]);
  });

  it('WINDUP at exactly strikeAt emits [STRIKE] only (grace not yet due)', () => {
    expect(
      dueAttackTransitions(ATTACK_STATE_WINDUP, strikeAt, strikeAt, graceAt, recoveryEndsAt)
    ).toEqual([ATTACK_STATE_STRIKE]);
  });

  it('WINDUP before strikeAt emits nothing', () => {
    expect(
      dueAttackTransitions(ATTACK_STATE_WINDUP, strikeAt - 1n, strikeAt, graceAt, recoveryEndsAt)
    ).toEqual([]);
  });

  it('WINDUP jumped past the WHOLE attack cascades [STRIKE, RECOVERY, IDLE]', () => {
    expect(
      dueAttackTransitions(ATTACK_STATE_WINDUP, recoveryEndsAt, strikeAt, graceAt, recoveryEndsAt)
    ).toEqual([ATTACK_STATE_STRIKE, ATTACK_STATE_RECOVERY, ATTACK_STATE_IDLE]);
  });

  it('STRIKE at its grace deadline emits [RECOVERY] (normal path)', () => {
    expect(
      dueAttackTransitions(ATTACK_STATE_STRIKE, graceAt, strikeAt, graceAt, recoveryEndsAt)
    ).toEqual([ATTACK_STATE_RECOVERY]);
  });

  it('RECOVERY at recoveryEndsAt emits [IDLE]', () => {
    expect(
      dueAttackTransitions(ATTACK_STATE_RECOVERY, recoveryEndsAt, strikeAt, graceAt, recoveryEndsAt)
    ).toEqual([ATTACK_STATE_IDLE]);
  });

  it('IDLE never emits transitions', () => {
    expect(
      dueAttackTransitions(ATTACK_STATE_IDLE, recoveryEndsAt + 100n * TICK, strikeAt, graceAt, recoveryEndsAt)
    ).toEqual([]);
  });
});

describe('walkAttackTransitions (D5-01/D5-04 chain glue seam, Pitfalls 1+2)', () => {
  // A mid-attack row (state STRIKE deadlines passed) with distinct cooldown
  // markers so any accidental write is visible.
  const SIZE_INDEX = 1;
  const POS_X = 10;
  const POS_Z = 20;

  function rowFor(attackId: string, overrides: Record<string, unknown> = {}) {
    return {
      state: ATTACK_STATE_WINDUP,
      attackId,
      startedAtMicros: NOW - 10n * TICK,
      strikeAtMicros: NOW - 2n * TICK,
      recoveryEndsAtMicros: NOW - 1n * TICK,
      cooldownUntilMicros: 111n,
      basicCooldownUntilMicros: 222n,
      landingX: 14,
      landingZ: 26,
      castX: 10,
      castZ: 20,
      radius: 3.5,
      strikeResolved: false,
      poise: 0,
      ...overrides,
    };
  }

  it('[STRIKE] with move leap teleports to landing; move none never does (Pitfall 1 gate)', () => {
    const leap = walkAttackTransitions(
      rowFor('leapSlam'),
      [ATTACK_STATE_STRIKE],
      ATTACKS.leapSlam,
      NOW,
      TICK,
      SIZE_INDEX,
      POS_X,
      POS_Z
    );
    expect(leap.teleportToLanding).toBe(true);
    expect(leap.emitStrike).toBe(true);

    const rooted = walkAttackTransitions(
      rowFor('swordSwing'),
      [ATTACK_STATE_STRIKE],
      ATTACKS.swordSwing,
      NOW,
      TICK,
      SIZE_INDEX,
      POS_X,
      POS_Z
    );
    expect(rooted.teleportToLanding).toBe(false);
    expect(rooted.emitStrike).toBe(true);
  });

  it('[STRIKE] strikeSnapshot carries the OLD attack id/landing/radius for the event emit', () => {
    const plan = walkAttackTransitions(
      rowFor('swordSwing'),
      [ATTACK_STATE_STRIKE],
      ATTACKS.swordSwing,
      NOW,
      TICK,
      SIZE_INDEX,
      POS_X,
      POS_Z
    );
    expect(plan.strikeSnapshot).not.toBeNull();
    expect(plan.strikeSnapshot!.attackId).toBe('swordSwing');
    expect(plan.strikeSnapshot!.landingX).toBe(14);
    expect(plan.strikeSnapshot!.landingZ).toBe(26);
    expect(plan.strikeSnapshot!.radius).toBe(3.5);
  });

  it('coalesced [STRIKE, RECOVERY, IDLE] on swordSwing ends in WINDUP(swordSwirl) with cooldowns untouched (Pitfall 2 break contract)', () => {
    const plan = walkAttackTransitions(
      rowFor('swordSwing'),
      [ATTACK_STATE_STRIKE, ATTACK_STATE_RECOVERY, ATTACK_STATE_IDLE],
      ATTACKS.swordSwing,
      NOW,
      TICK,
      SIZE_INDEX,
      POS_X,
      POS_Z
    );
    expect(plan.row.state).toBe(ATTACK_STATE_WINDUP);
    expect(plan.row.attackId).toBe('swordSwirl');
    expect(plan.resolveStrike).toBe(true); // swing strike resolved, never dropped (FSM-05)
    expect(plan.chainedInto).toBe('swordSwirl');
    // The stale IDLE step belonged to the OLD attack's deadlines and never ran:
    expect(plan.row.cooldownUntilMicros).toBe(111n);
    expect(plan.row.basicCooldownUntilMicros).toBe(222n);
  });

  it('chain entry equals a self-centered enterWindup spread (D5-04) with a next-tick strike deadline', () => {
    const plan = walkAttackTransitions(
      rowFor('swordSwing'),
      [ATTACK_STATE_STRIKE, ATTACK_STATE_RECOVERY],
      ATTACKS.swordSwing,
      NOW,
      TICK,
      SIZE_INDEX,
      POS_X,
      POS_Z
    );
    const expected = enterWindup(NOW, TICK, ATTACKS.swordSwirl, SIZE_INDEX, POS_X, POS_Z, POS_X, POS_Z);
    expect(plan.row).toEqual({
      ...rowFor('swordSwing'),
      ...expected,
      attackId: 'swordSwirl',
    });
    // Self-centered: cast == landing == the unit's effective position.
    expect(plan.row.castX).toBe(POS_X);
    expect(plan.row.landingX).toBe(POS_X);
    expect(plan.row.castZ).toBe(POS_Z);
    expect(plan.row.landingZ).toBe(POS_Z);
    expect(plan.row.strikeResolved).toBe(false);
    // The swirl strike lands strictly in the future — a single pass cannot loop.
    expect(plan.row.strikeAtMicros > NOW).toBe(true);
  });

  it('[STRIKE, RECOVERY, IDLE] without a chain, role skill → IDLE + cooldownUntilMicros written', () => {
    const plan = walkAttackTransitions(
      rowFor('leapSlam'),
      [ATTACK_STATE_STRIKE, ATTACK_STATE_RECOVERY, ATTACK_STATE_IDLE],
      ATTACKS.leapSlam,
      NOW,
      TICK,
      SIZE_INDEX,
      POS_X,
      POS_Z
    );
    expect(plan.row.state).toBe(ATTACK_STATE_IDLE);
    expect(plan.row.cooldownUntilMicros).toBe(NOW + ATTACKS.leapSlam.cooldownMicros);
    expect(plan.row.basicCooldownUntilMicros).toBe(222n); // untouched (D5-08 split)
    expect(plan.chainedInto).toBeNull();
  });

  it('[STRIKE, RECOVERY, IDLE] role basic (swordSwirl) → basicCooldownUntilMicros written, skill cooldown untouched (D5-13)', () => {
    const plan = walkAttackTransitions(
      rowFor('swordSwirl'),
      [ATTACK_STATE_STRIKE, ATTACK_STATE_RECOVERY, ATTACK_STATE_IDLE],
      ATTACKS.swordSwirl,
      NOW,
      TICK,
      SIZE_INDEX,
      POS_X,
      POS_Z
    );
    expect(plan.row.state).toBe(ATTACK_STATE_IDLE);
    expect(plan.row.basicCooldownUntilMicros).toBe(NOW + 2_500_000n);
    expect(plan.row.cooldownUntilMicros).toBe(111n); // untouched (D5-08 split)
  });

  it('[RECOVERY] with strikeResolved already true never re-resolves (no double resolution)', () => {
    const plan = walkAttackTransitions(
      rowFor('leapSlam', { state: ATTACK_STATE_STRIKE, strikeResolved: true }),
      [ATTACK_STATE_RECOVERY],
      ATTACKS.leapSlam,
      NOW,
      TICK,
      SIZE_INDEX,
      POS_X,
      POS_Z
    );
    expect(plan.resolveStrike).toBe(false);
    expect(plan.row.state).toBe(ATTACK_STATE_RECOVERY);
  });

  it('a leap spec WITH a chain enters the chained windup at the LANDING coords (teleport before chain)', () => {
    const leapChain = { ...ATTACKS.leapSlam, chainsInto: 'swordSwirl' };
    const plan = walkAttackTransitions(
      rowFor('leapSlam'),
      [ATTACK_STATE_STRIKE, ATTACK_STATE_RECOVERY],
      leapChain,
      NOW,
      TICK,
      SIZE_INDEX,
      POS_X,
      POS_Z
    );
    expect(plan.teleportToLanding).toBe(true);
    // The chain windup is centered on where the unit actually IS now: the landing.
    expect(plan.row.castX).toBe(14);
    expect(plan.row.castZ).toBe(26);
    expect(plan.row.landingX).toBe(14);
    expect(plan.row.landingZ).toBe(26);
  });

  it('an empty transition list is a no-op plan (strikeSnapshot null, row unchanged)', () => {
    const row = rowFor('leapSlam');
    const plan = walkAttackTransitions(row, [], ATTACKS.leapSlam, NOW, TICK, SIZE_INDEX, POS_X, POS_Z);
    expect(plan.row).toEqual(row);
    expect(plan.strikeSnapshot).toBeNull();
    expect(plan.emitStrike).toBe(false);
    expect(plan.resolveStrike).toBe(false);
    expect(plan.teleportToLanding).toBe(false);
    expect(plan.chainedInto).toBeNull();
  });
});
