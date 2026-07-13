// Pure attack-FSM timing math, kept dependency-free (one pure sibling import) so
// it can be unit-tested directly under the client's vitest runner (same pattern
// as crit.ts / combatMath.ts). No global randomness, no wall-clock time — every
// timestamp is an injected bigint-micros argument and the caller injects the tick
// length (WORLD_TICK_INTERVAL_MICROS on the server), which preserves the calling
// reducer's determinism (CLAUDE.md rule 2). This module never touches the
// database: it computes deadlines and transition lists; the reducer glue applies
// the side effects.
import {
  ATTACKS,
  ATTACK_STATE_IDLE,
  ATTACK_STATE_RECOVERY,
  ATTACK_STATE_STRIKE,
  ATTACK_STATE_WINDUP,
  type AttackSpec,
} from './attacks';

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

// The unit_attack row fields the transition walk reads/writes — the glue's rows
// (which also carry id/unitKind/unitId) satisfy this structurally.
export interface AttackRow extends WindupEntry {
  attackId: string;
  cooldownUntilMicros: bigint; // skill cooldown (D4-07)
  basicCooldownUntilMicros: bigint; // basic cooldown (D5-08 per-role split)
}

// Everything the reducer glue needs to apply one walk's side effects: the final
// row to persist plus flags for the strike event, the leap teleport, and the
// single strike resolution (FSM-05 resolve-never-drop).
export interface TransitionPlan<Row extends AttackRow> {
  row: Row; // the row after the walk — persist as-is
  emitStrike: boolean; // a STRIKE step occurred → emit attack_strike unconditionally
  teleportToLanding: boolean; // STRIKE occurred AND the spec moves — 'leap'/'charge' relocate to the locked landing; 'none' stays planted (Pitfall 1 gate)
  resolveStrike: boolean; // a RECOVERY step occurred with strikeResolved false → resolve ONCE
  strikeSnapshot: Row | null; // the row at the pre-chain-swap point (old attackId/landing/radius) — event + resolution fields
  chainedInto: string | null; // spec.chainsInto when the chain entry fired (D5-01)
}

// Applies an ordered dueAttackTransitions list to a row as PURE data — the
// Wave-0 chain-glue seam (D5-01): the reducer glue delegates its walk here so
// the coalesced-tick chain contract is a plain unit test. Semantics:
//   - STRIKE: state → STRIKE; a moving spec ('leap'/'charge', D6-01) relocates
//     the unit to the locked landing, so the chain (and the returned position
//     intent) uses it — 'none' stays planted (Pitfall 1 gate);
//   - RECOVERY with spec.chainsInto authored: the walk spreads a SELF-CENTERED
//     enterWindup for the chained attack over the row (cast == landing == the
//     unit's effective position, D5-04) and STOPS IMMEDIATELY — the remaining
//     stale steps belong to the OLD attack's deadlines (Pitfall 2 break
//     contract), so neither cooldown field is written;
//   - RECOVERY without a chain: state → RECOVERY + strikeResolved true;
//   - IDLE: the full cycle ends — 'basic' role writes basicCooldownUntilMicros,
//     'skill' writes cooldownUntilMicros (D5-08/D5-13 per-role split).
// Clock/RNG-free: now and tick are injected bigints (CLAUDE.md rule 2).
export function walkAttackTransitions<Row extends AttackRow>(
  row: Row,
  transitions: readonly number[],
  spec: AttackSpec,
  now: bigint,
  tick: bigint,
  sizeIndex: number,
  posX: number,
  posZ: number
): TransitionPlan<Row> {
  let current = row;
  let emitStrike = false;
  let teleportToLanding = false;
  let resolveStrike = false;
  let strikeSnapshot: Row | null = null;
  let chainedInto: string | null = null;
  let effectiveX = posX;
  let effectiveZ = posZ;

  for (const nextState of transitions) {
    if (nextState === ATTACK_STATE_STRIKE) {
      emitStrike = true;
      if (spec.move !== 'none') {
        teleportToLanding = true;
        effectiveX = current.landingX;
        effectiveZ = current.landingZ;
      }
      current = { ...current, state: ATTACK_STATE_STRIKE };
      strikeSnapshot = current;
    } else if (nextState === ATTACK_STATE_RECOVERY) {
      if (!current.strikeResolved) resolveStrike = true;
      strikeSnapshot = current;
      const chainedSpec = spec.chainsInto !== undefined ? ATTACKS[spec.chainsInto] : undefined;
      if (spec.chainsInto !== undefined && chainedSpec) {
        current = {
          ...current,
          ...enterWindup(now, tick, chainedSpec, sizeIndex, effectiveX, effectiveZ, effectiveX, effectiveZ),
          attackId: spec.chainsInto,
        };
        chainedInto = spec.chainsInto;
        break;
      }
      current = { ...current, state: ATTACK_STATE_RECOVERY, strikeResolved: true };
    } else {
      current =
        spec.role === 'basic'
          ? { ...current, state: ATTACK_STATE_IDLE, basicCooldownUntilMicros: now + spec.cooldownMicros }
          : { ...current, state: ATTACK_STATE_IDLE, cooldownUntilMicros: now + spec.cooldownMicros };
    }
  }

  return { row: current, emitStrike, teleportToLanding, resolveStrike, strikeSnapshot, chainedInto };
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
