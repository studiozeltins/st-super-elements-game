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
