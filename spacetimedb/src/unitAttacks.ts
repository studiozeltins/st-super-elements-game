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
  ATTACK_STATE_WINDUP,
  UNIT_ATTACKS,
  UNIT_KIND_GOLIATH,
  selectAttack,
  type AttackSpec,
} from './attacks';
import {
  dueAttackTransitions,
  enterWindup,
  graceDeadline,
  stunDeadline,
  walkAttackTransitions,
} from './unitAttackFsm';
import {
  closestPointOnSegment,
  computeLaneEnd,
  knockbackDisplacement,
  resolveCircleHit,
  resolveCone,
  resolveLane,
} from './attackHitbox';
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
    basicCooldownUntilMicros: 0n, // D5-08 per-role basic cooldown (Pitfall 5: any-typed row — a miss only fails at runtime insert)
    landingX: 0,
    landingZ: 0,
    radius: 0,
    castX: 0,
    castZ: 0,
    strikeResolved: false,
    poise: 0,
  };
}

// Camp-enemy side of the attack FSM: goliaths raid with their REAL skills, not
// only the per-tick contact drain. Bundled so runUnitAttacks' signature stays
// readable; the maps are the same ones worldTick's pass-3/apply loops consume.
export interface EnemyCombatContext {
  enemies: readonly any[];
  enemyPosition: Map<bigint, { x: number; z: number }>;
  /** Accumulated goliath→enemy damage, applied by the enemy apply loop. */
  enemyDamage: Map<bigint, number>;
  /** Struck members hard-aggro onto the raider (same rule as the tick strike). */
  enemyHardAggroGoliath: Map<bigint, bigint>;
  /** GOLIATH_VS_ENEMY_DAMAGE_MULTIPLIER — strikes hit camps as hard as the drain. */
  damageMultiplier: number;
  /** Attack-opening range vs camp members (GOLIATH_ENGAGE_RANGE). */
  engageRange: number;
}

/** Shared shape test: is (x, z) inside this strike's locked hitbox? */
function strikeHits(x: number, z: number, row: any, spec: AttackSpec): boolean {
  if (spec.shape === 'lane') {
    return resolveLane(x, z, row.castX, row.castZ, row.landingX, row.landingZ, row.radius);
  }
  if (spec.shape === 'cone') {
    return resolveCone(
      x,
      z,
      row.castX,
      row.castZ,
      row.landingX - row.castX,
      row.landingZ - row.castZ,
      row.radius,
      spec.coneMinDot ?? 0.5
    );
  }
  return resolveCircleHit(x, z, row.landingX, row.landingZ, row.radius);
}

// The single damage-resolution moment (D4-02 zero-storage grace, D4-03 bystanders
// included): EVERY online player is tested against the locked hitbox at their
// LIVE row position — a victim who left within the grace window reads outside and
// counts OUT. Shape branch (ATK-02/ATK-04, Pitfall 4): a 'cone' resolves via
// resolveCone from the CAST apex with the aim locked at windup entry (landing
// minus cast, D5-05); a 'lane' resolves via resolveLane against the cast->landing
// centerline with row.radius as the half-width (D6-04 — every victim in the
// charge path counts, not just the aggro target); everything else stays the
// circle test on the landing. Hits get (a) RAW
// damage into the SHARED playerDamage map (the existing apply loop applies the
// 'contact' resistance, death, shard spill, respawn — never the player-hit path,
// which is player→enemy composition, not unit→player), (b) a knockback displacement away from the
// center written onto the row (clamped to world bounds only — D4-11: edge deaths
// are a feature), and (c) an enforced stun window (HIT-01; updatePosition rejects
// the client while it runs).
function resolveStrike(
  ctx: { db: any },
  now: bigint,
  tick: bigint,
  goliathRow: any,
  row: any,
  spec: AttackSpec,
  heading: { x: number; z: number },
  playerByHex: Map<string, any>,
  playerDamage: Map<string, number>,
  enemyCombat: EnemyCombatContext
): void {
  const isCone = spec.shape === 'cone';
  const isLane = spec.shape === 'lane';
  // Knockback center: the apex for cones (push AWAY from the goliath — the swing
  // seeds knockback 0 so this is inert this phase, but a later cone must never
  // pull victims toward the aim point), the landing for circles (swirl: landing
  // equals cast so both are identical, D5-04). Lanes have NO shared center —
  // each victim's center is their closest point on the centerline, computed
  // inside the loop after a hit (D6-05 perpendicular bulldoze).
  const centerX = isCone ? row.castX : row.landingX;
  const centerZ = isCone ? row.castZ : row.landingZ;
  for (const [hex, snapshot] of playerByHex) {
    const victim = ctx.db.player.identity.find(snapshot.identity);
    if (!victim || isInsideSafeZone(victim.positionX, victim.positionZ)) continue;
    if (!strikeHits(victim.positionX, victim.positionZ, row, spec)) continue;
    playerDamage.set(hex, (playerDamage.get(hex) ?? 0) + goliathRow.contactDamage * spec.damageMultiplier);
    // D6-05: a lane victim is shoved perpendicular OUT of the charge path — the
    // knockback center is the PER-VICTIM closest point on the cast->landing
    // centerline (only computed after a hit; circle/cone keep the pre-loop
    // constant center). A victim standing exactly ON the centerline reads a
    // zero-length delta and falls into knockbackDisplacement's existing heading
    // fallback (the attacker's facing) — no new code path.
    const laneCenter = isLane
      ? closestPointOnSegment(victim.positionX, victim.positionZ, row.castX, row.castZ, row.landingX, row.landingZ)
      : null;
    const pushed = knockbackDisplacement(
      victim.positionX,
      victim.positionZ,
      laneCenter === null ? centerX : laneCenter.x,
      laneCenter === null ? centerZ : laneCenter.z,
      spec.knockback,
      heading.x,
      heading.z
    );
    // Stuns are MONOTONIC: a concurrent attacker's hit may only extend the
    // victim's stun window, never shorten it. An unconditional write let a
    // second goliath's swing shrink a live slam stun — and the swirl
    // (stunTicks: 0) wrote `now`, cancelling any active stun outright and
    // re-enabling movement for a player who should still be locked (HIT-01).
    const newStun = stunDeadline(now, spec.stunTicks, tick);
    ctx.db.player.identity.update({
      ...victim,
      positionX: clampToWorld(pushed.x),
      positionZ: clampToWorld(pushed.z),
      stunnedUntilMicros: newStun > victim.stunnedUntilMicros ? newStun : victim.stunnedUntilMicros,
    });
  }

  // Camp members caught in the SAME locked hitbox take the strike too — a raid
  // is fought with real attacks, not just the per-tick contact drain. Damage
  // accumulates in the shared enemyDamage map (the enemy apply loop owns death,
  // loot spill, and respawn); a struck member hard-aggros onto the raider, the
  // same "damaged by" rule as the tick strike. No knockback/stun — enemies
  // carry no stun state.
  for (const enemyRow of enemyCombat.enemies) {
    if (!enemyRow.alive) continue;
    const position =
      enemyCombat.enemyPosition.get(enemyRow.enemyId) ??
      { x: enemyRow.positionX, z: enemyRow.positionZ };
    if (!strikeHits(position.x, position.z, row, spec)) continue;
    const dealt = goliathRow.contactDamage * spec.damageMultiplier * enemyCombat.damageMultiplier;
    enemyCombat.enemyDamage.set(
      enemyRow.enemyId,
      (enemyCombat.enemyDamage.get(enemyRow.enemyId) ?? 0) + dealt
    );
    enemyCombat.enemyHardAggroGoliath.set(enemyRow.enemyId, row.unitId);
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
  playerDamage: Map<string, number>,
  enemyCombat: EnemyCombatContext
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
      const from = goliathPosition.get(goliathRow.goliathId) ?? { x: goliathRow.positionX, z: goliathRow.positionZ };
      // Aim priority: a LIVE player aggro target that is online and out in the
      // open (D4-13); otherwise the nearest living camp member in engage range —
      // raids are fought with the same skills, not only the contact drain.
      const target =
        !aggroExpired(goliathRow.aggroExpiresAtMicros, now) && goliathRow.aggroPlayer
          ? playerByHex.get(goliathRow.aggroPlayer.toHexString())
          : undefined;
      let aim: { x: number; z: number } | null =
        target && !isInsideSafeZone(target.positionX, target.positionZ)
          ? { x: target.positionX, z: target.positionZ }
          : null;
      if (!aim) {
        let bestDistance = enemyCombat.engageRange;
        for (const enemyRow of enemyCombat.enemies) {
          if (!enemyRow.alive) continue;
          const position =
            enemyCombat.enemyPosition.get(enemyRow.enemyId) ??
            { x: enemyRow.positionX, z: enemyRow.positionZ };
          const distance = distanceBetween(from.x, from.z, position.x, position.z);
          if (distance < bestDistance) {
            bestDistance = distance;
            aim = { x: position.x, z: position.z };
          }
        }
      }
      if (!aim) continue;
      const attackId = selectAttack(
        distanceBetween(from.x, from.z, aim.x, aim.z),
        now,
        row.cooldownUntilMicros,
        row.basicCooldownUntilMicros, // D5-08: basics gate on their OWN cooldown
        UNIT_ATTACKS[UNIT_KIND_GOLIATH].default
      );
      if (attackId === null) continue;
      // Landing LOCKED at this single target sample (ATK-01); cast root = the
      // goliath's current map position (D4-12); poise reset (Phase-7 seam).
      // Lane attacks aim ONCE at cast (D6-02): the landing becomes the lane END —
      // an overshoot PAST where the target stood (computeLaneEnd), so a sideways
      // dodge beats the charge — with each axis clamped to the world (D6-14:
      // clamp the GOLIATH's destination, never the victims). enterWindup is
      // untouched: landingX/Z stores the lane end and row.radius the per-size
      // half-width for free. This branch only selects arguments — all arithmetic
      // lives in the pure helpers (glue header contract).
      const selected = ATTACKS[attackId];
      let aimX = aim.x;
      let aimZ = aim.z;
      if (selected.shape === 'lane' && selected.laneLengthBySize) {
        const clampedIndex = Math.min(Math.max(goliathRow.sizeIndex, 0), selected.laneLengthBySize.length - 1);
        const laneEnd = computeLaneEnd(from.x, from.z, aim.x, aim.z, selected.laneLengthBySize[clampedIndex]);
        aimX = clampToWorld(laneEnd.x);
        aimZ = clampToWorld(laneEnd.z);
      }
      const entry = enterWindup(now, tick, selected, goliathRow.sizeIndex, from.x, from.z, aimX, aimZ);
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

    // Delegate the transition walk to the tested pure applier (D5-01): the chain
    // swap + break contract (Pitfall 2) and the per-role cooldown split (D5-08)
    // live INSIDE walkAttackTransitions — this glue only applies the returned
    // plan's side effects and never duplicates that logic. A coalesced tick that
    // jumped past several deadlines applies them all in one pass (FSM-05).
    const transitions = dueAttackTransitions(
      row.state,
      now,
      row.strikeAtMicros,
      graceDeadline(row.strikeAtMicros, spec.graceTicks, tick),
      row.recoveryEndsAtMicros
    );
    if (transitions.length === 0) continue;
    const pos = goliathPosition.get(goliathRow.goliathId) ?? { x: goliathRow.positionX, z: goliathRow.positionZ };
    const plan = walkAttackTransitions(row, transitions, spec, now, tick, goliathRow.sizeIndex, pos.x, pos.z);
    const struck = plan.strikeSnapshot;
    // The ONLY relocate in the strike path, gated on the applier's generalized
    // move flag (D6-01): 'leap' (slam) and 'charge' (dash) both arrive at the
    // locked landing here; move 'none' attacks like the swing stay planted
    // (Pitfall 1 gate preserved).
    if (plan.teleportToLanding && struck) {
      goliathPosition.set(goliathRow.goliathId, { x: struck.landingX, z: struck.landingZ });
    }
    if (plan.emitStrike && struck) {
      // UNCONDITIONAL emission, BEFORE any victim branching (Phase-2 lesson —
      // the event fires even on a whiff-into-chain). Fields come from the
      // strikeSnapshot: after a chain swap the final row already carries the
      // swirl's geometry, but this strike belongs to the OLD attack.
      ctx.db.attackStrike.insert({
        unitKind: struck.unitKind,
        unitId: struck.unitId,
        attackId: struck.attackId,
        landingX: struck.landingX,
        landingZ: struck.landingZ,
        radius: struck.radius,
      });
    }
    if (plan.resolveStrike && struck) {
      const heading = goliathHeading.get(goliathRow.goliathId) ?? { x: goliathRow.headingX, z: goliathRow.headingZ };
      resolveStrike(ctx, now, tick, goliathRow, struck, spec, heading, playerByHex, playerDamage, enemyCombat);
    }
    attackTable.id.update(plan.row);
  }
}
