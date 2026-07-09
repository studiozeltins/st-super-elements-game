// Pure attack-FSM timing math, kept dependency-free (one pure sibling import) so
// it can be unit-tested directly under the client's vitest runner (same pattern
// as crit.ts / combatMath.ts). No global randomness, no wall-clock time — every
// timestamp is an injected bigint-micros argument and the caller injects the tick
// length (WORLD_TICK_INTERVAL_MICROS on the server), which preserves the calling
// reducer's determinism (CLAUDE.md rule 2). This module never touches the
// database: it computes deadlines and transition lists; the reducer glue applies
// the side effects.
import { ATTACK_STATE_IDLE, ATTACK_STATE_RECOVERY, ATTACK_STATE_STRIKE, ATTACK_STATE_WINDUP, type AttackSpec } from './attacks';

// Every unit_attack row field the windup transition writes.
export interface WindupEntry {
  state: number;
  startedAtMicros: bigint;
  strikeAtMicros: bigint;
  recoveryEndsAtMicros: bigint;
  landingX: number;
  landingZ: number;
  castX: number;
  castZ: number;
  radius: number;
  strikeResolved: boolean;
  poise: number;
}

// The moment the windup ends and the unit strikes.
export function strikeDeadline(startedAtMicros: bigint, windupTicks: number, tickMicros: bigint): bigint {
  return startedAtMicros + BigInt(windupTicks) * tickMicros;
}

// The single damage-resolution moment (D4-02 zero-storage grace): damage resolves
// ONCE, at strikeAt + graceTicks, against LIVE positions — a player who left the
// circle within the final grace window reads outside and counts OUT. This deadline
// is derived per call by the glue, never stored on the row.
export function graceDeadline(strikeAtMicros: bigint, graceTicks: number, tickMicros: bigint): bigint {
  return strikeAtMicros + BigInt(graceTicks) * tickMicros;
}

// When the post-strike recovery ends and the unit returns to IDLE.
export function recoveryDeadline(
  strikeAtMicros: bigint,
  graceTicks: number,
  recoveryTicks: number,
  tickMicros: bigint
): bigint {
  return strikeAtMicros + BigInt(graceTicks + recoveryTicks) * tickMicros;
}

// When a struck victim's stun window ends (HIT-01; D4-10: 2 ticks).
export function stunDeadline(nowMicros: bigint, stunTicks: number, tickMicros: bigint): bigint {
  return nowMicros + BigInt(stunTicks) * tickMicros;
}

// The ONLY deadline comparison primitive: >= semantics, never equality-only, so a
// tick that lands exactly on — or jumps past — a deadline still fires it (FSM-05).
export function deadlinePassed(nowMicros: bigint, deadlineMicros: bigint): boolean {
  return nowMicros >= deadlineMicros;
}

// Builds the row a unit writes when it enters WINDUP. The landing is LOCKED to the
// target's position sampled NOW, at cast (ATK-01) — later transitions read these
// fields, never recompute them. castX/Z is the root point the unit stays planted
// on through the windup (D4-12). PINNED: this is the ONLY transition that writes
// recoveryEndsAtMicros; strike/grace/recovery transitions read it. The grace
// deadline is NOT stored — the glue derives it via graceDeadline(row.strikeAtMicros,
// spec.graceTicks, tick). poise resets on every windup entry (Phase-7 interrupt
// accumulates against it within one windup only).
export function enterWindup(
  nowMicros: bigint,
  tickMicros: bigint,
  spec: AttackSpec,
  sizeIndex: number,
  castX: number,
  castZ: number,
  targetX: number,
  targetZ: number
): WindupEntry {
  const strikeAtMicros = strikeDeadline(nowMicros, spec.windupTicks, tickMicros);
  const clampedIndex = Math.min(Math.max(sizeIndex, 0), spec.radiusBySize.length - 1);
  return {
    state: ATTACK_STATE_WINDUP,
    startedAtMicros: nowMicros,
    strikeAtMicros,
    recoveryEndsAtMicros: recoveryDeadline(strikeAtMicros, spec.graceTicks, spec.recoveryTicks, tickMicros),
    landingX: targetX,
    landingZ: targetZ,
    castX,
    castZ,
    radius: spec.radiusBySize[clampedIndex],
    strikeResolved: false,
    poise: 0,
  };
}

// Returns the ORDERED list of target states due at this now, cascading so a
// coalesced tick that jumped past several deadlines emits EVERY due transition in
// one call (FSM-05 resolve-never-drop): WINDUP past the grace deadline returns
// strike then recovery; past recovery-end it also returns idle. The reducer glue
// walks this list applying each transition's side effects in order.
export function dueAttackTransitions(
  state: number,
  nowMicros: bigint,
  strikeAtMicros: bigint,
  graceAtMicros: bigint,
  recoveryEndsAtMicros: bigint
): number[] {
  const transitions: number[] = [];
  if (state === ATTACK_STATE_WINDUP && deadlinePassed(nowMicros, strikeAtMicros)) {
    transitions.push(ATTACK_STATE_STRIKE);
    state = ATTACK_STATE_STRIKE;
  }
  if (state === ATTACK_STATE_STRIKE && deadlinePassed(nowMicros, graceAtMicros)) {
    transitions.push(ATTACK_STATE_RECOVERY);
    state = ATTACK_STATE_RECOVERY;
  }
  if (state === ATTACK_STATE_RECOVERY && deadlinePassed(nowMicros, recoveryEndsAtMicros)) {
    transitions.push(ATTACK_STATE_IDLE);
  }
  return transitions;
}
