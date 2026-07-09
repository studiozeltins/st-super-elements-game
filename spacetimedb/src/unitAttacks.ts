// Reducer-side glue for the unit attack FSM (FSM-01/FSM-02/FSM-06): one pass per
// worldTick that walks every LIVE goliath, lazily upserts its unit_attack row via
// the by_unit index (the attack table is NEVER the iteration driver), and applies
// windup → strike → recovery over the Plan-01 pure helpers. This module contains
// ZERO decision arithmetic of its own — every deadline, selection, hit test, and
// displacement comes from attacks/unitAttackFsm/attackHitbox — and it never
// samples the clock: now/tick arrive as arguments, sampled once by worldTick
// (FSM-05). No module-scope mutable state — all cross-tick state lives on the row.
import {
  ATTACKS,
  ATTACK_STATE_IDLE,
  ATTACK_STATE_RECOVERY,
  ATTACK_STATE_STRIKE,
  ATTACK_STATE_WINDUP,
  UNIT_ATTACKS,
  UNIT_KIND_GOLIATH,
  selectAttack,
  type AttackSpec,
} from './attacks';
import { dueAttackTransitions, enterWindup, graceDeadline, stunDeadline } from './unitAttackFsm';
import { knockbackDisplacement, resolveCircleHit } from './attackHitbox';
import { distanceBetween } from './combatMath';
import { headingFromStep } from './goliathAI';
import { aggroExpired, clampToWorld, isInsideSafeZone } from './worldRules';

// An idle unit_attack row for a unit that has never attacked (lazy upsert seed).
function idleAttackRow(unitKind: number, unitId: bigint) {
  return {
    id: 0n,
    unitKind,
    unitId,
    state: ATTACK_STATE_IDLE,
    attackId: '',
    startedAtMicros: 0n,
    strikeAtMicros: 0n,
    recoveryEndsAtMicros: 0n,
    cooldownUntilMicros: 0n,
    landingX: 0,
    landingZ: 0,
    radius: 0,
    castX: 0,
    castZ: 0,
    strikeResolved: false,
    poise: 0,
  };
}

// The single damage-resolution moment (D4-02 zero-storage grace, D4-03 bystanders
// included): EVERY online player is tested against the locked circle at their
// LIVE row position — a victim who left within the grace window reads outside and
// counts OUT. Hits get (a) RAW damage into the SHARED playerDamage map (the
// existing apply loop applies the 'contact' resistance, death, shard spill,
// respawn — never the player-hit path, whose 400 cap would clamp the slam), (b) a
// knockback displacement away from the center written onto the row (clamped to
// world bounds only — D4-11: edge deaths are a feature), and (c) an enforced stun
// window (HIT-01; updatePosition rejects the client while it runs).
function resolveStrike(
  ctx: { db: any },
  now: bigint,
  tick: bigint,
  goliathRow: any,
  row: any,
  spec: AttackSpec,
  heading: { x: number; z: number },
  playerByHex: Map<string, any>,
  playerDamage: Map<string, number>
): void {
  for (const [hex, snapshot] of playerByHex) {
    const victim = ctx.db.player.identity.find(snapshot.identity);
    if (!victim || isInsideSafeZone(victim.positionX, victim.positionZ)) continue;
    if (!resolveCircleHit(victim.positionX, victim.positionZ, row.landingX, row.landingZ, row.radius)) continue;
    playerDamage.set(hex, (playerDamage.get(hex) ?? 0) + goliathRow.contactDamage * spec.damageMultiplier);
    const pushed = knockbackDisplacement(
      victim.positionX,
      victim.positionZ,
      row.landingX,
      row.landingZ,
      spec.knockback,
      heading.x,
      heading.z
    );
    ctx.db.player.identity.update({
      ...victim,
      positionX: clampToWorld(pushed.x),
      positionZ: clampToWorld(pushed.z),
      stunnedUntilMicros: stunDeadline(now, spec.stunTicks, tick),
    });
  }
}

// Runs the attack FSM for every live goliath inside one worldTick. Mutates the
// goliathPosition/goliathHeading maps (root during windup, leap at strike) — the
// existing goliath apply loop persists those entries — and accumulates strike
// damage into the shared playerDamage map the existing apply loop consumes.
export function runUnitAttacks(
  ctx: { db: any },
  now: bigint,
  tick: bigint,
  goliaths: readonly any[],
  goliathPosition: Map<bigint, { x: number; z: number }>,
  goliathHeading: Map<bigint, { x: number; z: number }>,
  playerByHex: Map<string, any>,
  playerDamage: Map<string, number>
): void {
  const attackTable = ctx.db.unitAttack;

  // Dead-row hygiene (RESEARCH Pitfall 6): a row whose goliath died or was
  // retired at the window boundary is reset to IDLE so it can never strike
  // posthumously or hang a telegraph. This is the only scan of the attack table —
  // the FSM driver below iterates the live-goliath list, never this table.
  const liveGoliathIds = new Set(goliaths.map(goliathRow => goliathRow.goliathId));
  for (const orphan of [...attackTable.iter()]) {
    if (orphan.unitKind !== UNIT_KIND_GOLIATH || liveGoliathIds.has(orphan.unitId)) continue;
    if (orphan.state !== ATTACK_STATE_IDLE) attackTable.id.update({ ...orphan, state: ATTACK_STATE_IDLE });
  }

  for (const goliathRow of goliaths) {
    // Lazy upsert via the multi-column index (FSM-06): the table starts empty on
    // a migrated DB; a unit's row appears the first time the FSM considers it.
    let row = [...attackTable.by_unit.filter([UNIT_KIND_GOLIATH, goliathRow.goliathId])][0];
    if (!row) row = attackTable.insert(idleAttackRow(UNIT_KIND_GOLIATH, goliathRow.goliathId));

    if (row.state === ATTACK_STATE_IDLE) {
      // Only a LIVE aggro target that is online and out in the open opens an
      // attack; selectAttack returning null means the normal chase continues
      // untouched (D4-13).
      const target =
        !aggroExpired(goliathRow.aggroExpiresAtMicros, now) && goliathRow.aggroPlayer
          ? playerByHex.get(goliathRow.aggroPlayer.toHexString())
          : undefined;
      if (!target || isInsideSafeZone(target.positionX, target.positionZ)) continue;
      const from = goliathPosition.get(goliathRow.goliathId) ?? { x: goliathRow.positionX, z: goliathRow.positionZ };
      const attackId = selectAttack(
        distanceBetween(from.x, from.z, target.positionX, target.positionZ),
        now,
        row.cooldownUntilMicros,
        UNIT_ATTACKS[UNIT_KIND_GOLIATH].default
      );
      if (attackId === null) continue;
      // Landing LOCKED at this single target sample (ATK-01); cast root = the
      // goliath's current map position (D4-12); poise reset (Phase-7 seam).
      const entry = enterWindup(
        now,
        tick,
        ATTACKS[attackId],
        goliathRow.sizeIndex,
        from.x,
        from.z,
        target.positionX,
        target.positionZ
      );
      row = { ...row, ...entry, attackId };
      attackTable.id.update(row);
    }

    const spec = ATTACKS[row.attackId];
    if (row.state === ATTACK_STATE_IDLE || !spec) continue;

    if (row.state === ATTACK_STATE_WINDUP) {
      // Rooted crouch (D4-12): override this tick's chase step back to the cast
      // point, aimed at the landing so the crouch reads targeted.
      goliathPosition.set(goliathRow.goliathId, { x: row.castX, z: row.castZ });
      goliathHeading.set(
        goliathRow.goliathId,
        headingFromStep(row.castX, row.castZ, row.landingX, row.landingZ, goliathRow.headingX, goliathRow.headingZ)
      );
    }

    // Walk every due transition in order — a coalesced tick that jumped past
    // several deadlines applies them all in one pass (FSM-05 resolve-never-drop).
    const transitions = dueAttackTransitions(
      row.state,
      now,
      row.strikeAtMicros,
      graceDeadline(row.strikeAtMicros, spec.graceTicks, tick),
      row.recoveryEndsAtMicros
    );
    for (const nextState of transitions) {
      if (nextState === ATTACK_STATE_STRIKE) {
        // The leap (move: 'leap'): the unit lands on the locked circle, and the
        // strike event fires UNCONDITIONALLY at the transition, BEFORE any
        // victim branching (Phase-2 guarded-emission lesson).
        goliathPosition.set(goliathRow.goliathId, { x: row.landingX, z: row.landingZ });
        ctx.db.attackStrike.insert({
          unitKind: row.unitKind,
          unitId: row.unitId,
          attackId: row.attackId,
          landingX: row.landingX,
          landingZ: row.landingZ,
          radius: row.radius,
        });
        row = { ...row, state: ATTACK_STATE_STRIKE };
      } else if (nextState === ATTACK_STATE_RECOVERY) {
        if (!row.strikeResolved) {
          const heading = goliathHeading.get(goliathRow.goliathId) ?? { x: goliathRow.headingX, z: goliathRow.headingZ };
          resolveStrike(ctx, now, tick, goliathRow, row, spec, heading, playerByHex, playerDamage);
        }
        row = { ...row, state: ATTACK_STATE_RECOVERY, strikeResolved: true };
      } else {
        // Back to IDLE: the full cycle ends and the cooldown starts (D4-06/D4-07).
        row = { ...row, state: ATTACK_STATE_IDLE, cooldownUntilMicros: now + spec.cooldownMicros };
      }
    }
    if (transitions.length > 0) attackTable.id.update(row);
  }
}
