// World-tick enemy movement pass (carved out of the index.ts monolith): slimes
// bounce (hop cycle in micros — tick-rate independent — with a landing SLAM as
// their only player damage), wisps/golems keep the smooth steered walk, and any
// un-aggro'd member patrols a ring around its camp home. This module is glue:
// all arithmetic lives in the pure helpers (slimeHop/patrol/steering/
// combatMath) and the clock/randomness arrive via worldTick's ctx + now/tick.
import { UNIT_KIND_ENEMY } from './attacks';
import { isWalkable } from './bridges';
import { distanceBetween, stepToward } from './combatMath';
import { ENEMY_ARCHETYPE_STATS, GOLIATH_SIZE_STATS } from './enemyStats';
import {
  PATROL_ARRIVE_DISTANCE,
  patrolCandidate,
  patrolRestMicros,
  pickPatrolPoint,
} from './patrol';
import {
  hasLanded,
  hopAirtimeMicrosFor,
  hopLandingToward,
  hopTravelSpeedFor,
  isAirborne,
  isSlimeArchetype,
  landingHits,
  nextHopPauseMicros,
  slamAttackIdFor,
  slamRadiusFor,
} from './slimeHop';
import { steeredStep, type SteerObstacle } from './steering';
import {
  AGGRO_GOLIATH,
  AGGRO_PLAYER,
  aggroExpired,
  clampToWorld,
  isInsideSafeZone,
} from './worldRules';

// The per-enemy outcome of one movement tick; the index.ts apply loop persists
// these columns onto the row (alongside damage/aggro) in its single update.
export interface EnemyMoveResult {
  x: number;
  z: number;
  hopStartedAtMicros: bigint;
  hopDurationMicros: bigint;
  hopTargetX: number;
  hopTargetZ: number;
  patrolTargetX: number;
  patrolTargetZ: number;
  restUntilMicros: bigint;
}

// Nearest OTHER member in the same-camp obstacle list — the anti-clump bias
// input for patrol point picking.
function nearestCampMate(
  obstacles: readonly SteerObstacle[],
  selfId: bigint,
  x: number,
  z: number
): { x: number; z: number } | null {
  let best: SteerObstacle | null = null;
  let bestDistance = Infinity;
  for (const obstacle of obstacles) {
    if (obstacle.id === selfId) continue;
    const distance = distanceBetween(x, z, obstacle.x, obstacle.z);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = obstacle;
    }
  }
  return best === null ? null : { x: best.x, z: best.z };
}

// Resolves a slime hop landing: every open-field player inside the slam radius
// takes the archetype's FULL contactDamage (per landing — the tick-decoupled
// replacement for the old per-tick bite), accumulated into the shared
// playerDamage map so the existing apply loop stays the only damage sink. The
// goliath this slime is fighting takes the slam too (body radius included —
// camp defense attrition survives the hop rework). One attack_strike event is
// emitted ONLY when at least one player was hit (squash sound on hit; the
// client animates the bounce itself from the hop columns).
function resolveSlamLanding(
  ctx: { db: any },
  now: bigint,
  enemyRow: any,
  landingX: number,
  landingZ: number,
  spiky: boolean,
  playerByHex: Map<string, any>,
  playerDamage: Map<string, number>,
  goliathBodies: Map<bigint, { x: number; z: number; radius: number }>,
  goliathDamage: Map<bigint, number>
): void {
  const radius = slamRadiusFor(spiky);
  let hitPlayer = false;
  for (const [hex, playerRow] of playerByHex) {
    if (isInsideSafeZone(playerRow.positionX, playerRow.positionZ)) continue;
    if (!landingHits(landingX, landingZ, playerRow.positionX, playerRow.positionZ, radius)) continue;
    playerDamage.set(hex, (playerDamage.get(hex) ?? 0) + enemyRow.contactDamage);
    hitPlayer = true;
  }
  if (enemyRow.aggroKind === AGGRO_GOLIATH && !aggroExpired(enemyRow.aggroExpiresAtMicros, now)) {
    const body = goliathBodies.get(enemyRow.aggroGoliathId);
    if (body && landingHits(landingX, landingZ, body.x, body.z, radius + body.radius)) {
      goliathDamage.set(
        enemyRow.aggroGoliathId,
        (goliathDamage.get(enemyRow.aggroGoliathId) ?? 0) + enemyRow.contactDamage
      );
    }
  }
  if (hitPlayer) {
    ctx.db.attackStrike.insert({
      unitKind: UNIT_KIND_ENEMY,
      unitId: enemyRow.enemyId,
      attackId: slamAttackIdFor(spiky),
      landingX,
      landingZ,
      radius,
    });
  }
}

// Moves every live camp enemy for one tick and returns the per-enemy result
// map (position + hop/patrol state) that later passes read and the apply loop
// persists. Slime landings write into the SHARED playerDamage/goliathDamage
// maps, so the single damage-apply loops at the bottom of worldTick remain the
// only damage sinks.
export function moveEnemies(
  ctx: { db: any; random: any },
  now: bigint,
  tick: bigint,
  enemies: readonly any[],
  goliaths: readonly any[],
  goliathPosition: Map<bigint, { x: number; z: number }>,
  playerByHex: Map<string, any>,
  playerDamage: Map<string, number>,
  goliathDamage: Map<bigint, number>
): Map<bigint, EnemyMoveResult> {
  const dtSeconds = Number(tick) / 1_000_000;
  const results = new Map<bigint, EnemyMoveResult>();

  // Same-camp obstacle lists at tick-START positions (order-independent:
  // every member steers against where its mates stood, not where earlier loop
  // iterations moved them). O(members) per camp — see steering.ts for why no
  // spatial hash.
  const campObstacles = new Map<number, SteerObstacle[]>();
  for (const enemyRow of enemies) {
    let list = campObstacles.get(enemyRow.campIndex);
    if (!list) campObstacles.set(enemyRow.campIndex, (list = []));
    list.push({
      id: enemyRow.enemyId,
      x: enemyRow.positionX,
      z: enemyRow.positionZ,
      radius: ENEMY_ARCHETYPE_STATS[enemyRow.archetypeId as keyof typeof ENEMY_ARCHETYPE_STATS].collisionRadius,
    });
  }

  // Goliath bodies at this tick's (pre-attack-FSM) positions for the slam test.
  const goliathBodies = new Map<bigint, { x: number; z: number; radius: number }>();
  for (const goliathRow of goliaths) {
    const position = goliathPosition.get(goliathRow.goliathId);
    if (!position) continue;
    const sizeIndex = Math.min(Math.max(goliathRow.sizeIndex, 0), GOLIATH_SIZE_STATS.length - 1);
    goliathBodies.set(goliathRow.goliathId, {
      x: position.x,
      z: position.z,
      radius: GOLIATH_SIZE_STATS[sizeIndex].collisionRadius,
    });
  }

  for (const enemyRow of enemies) {
    const stats = ENEMY_ARCHETYPE_STATS[enemyRow.archetypeId as keyof typeof ENEMY_ARCHETYPE_STATS];
    const slime = isSlimeArchetype(enemyRow.archetypeId);
    const spiky = enemyRow.archetypeId === 'spikySlime';
    const result: EnemyMoveResult = {
      x: enemyRow.positionX,
      z: enemyRow.positionZ,
      hopStartedAtMicros: enemyRow.hopStartedAtMicros,
      hopDurationMicros: enemyRow.hopDurationMicros,
      hopTargetX: enemyRow.hopTargetX,
      hopTargetZ: enemyRow.hopTargetZ,
      patrolTargetX: enemyRow.patrolTargetX,
      patrolTargetZ: enemyRow.patrolTargetZ,
      restUntilMicros: enemyRow.restUntilMicros,
    };
    results.set(enemyRow.enemyId, result);
    const obstacles = campObstacles.get(enemyRow.campIndex) ?? [];

    // Chase target from live aggro (same rules the old pass used).
    const expired = aggroExpired(enemyRow.aggroExpiresAtMicros, now);
    let chasing = false;
    let targetX = 0;
    let targetZ = 0;
    if (!expired && enemyRow.aggroKind === AGGRO_GOLIATH) {
      const chased = goliathPosition.get(enemyRow.aggroGoliathId);
      if (chased) {
        targetX = chased.x;
        targetZ = chased.z;
        chasing = true;
      }
    } else if (!expired && enemyRow.aggroKind === AGGRO_PLAYER && enemyRow.aggroPlayer) {
      const chased = playerByHex.get(enemyRow.aggroPlayer.toHexString());
      if (chased) {
        targetX = chased.positionX;
        targetZ = chased.positionZ;
        chasing = true;
      }
    }

    // Patrol maintenance when nothing holds its aggro: on arriving at the
    // current point (or with none picked yet — the (0,0) default is never a
    // legal ring point, camps sit far from the origin) and once rested, pick
    // the next ring point biased AWAY from the nearest camp-mate (anti-clump)
    // and rest before setting out. An unwalkable pick falls back to home,
    // which is always solid ground.
    let hasMoveTarget = chasing;
    if (!chasing) {
      const patrolUnset = result.patrolTargetX === 0 && result.patrolTargetZ === 0;
      const arrived =
        patrolUnset ||
        distanceBetween(result.x, result.z, result.patrolTargetX, result.patrolTargetZ) <=
          PATROL_ARRIVE_DISTANCE;
      if (arrived) {
        if (now >= result.restUntilMicros) {
          const neighbor = nearestCampMate(obstacles, enemyRow.enemyId, result.x, result.z);
          const candidateA = patrolCandidate(enemyRow.homeX, enemyRow.homeZ, ctx.random(), ctx.random());
          const candidateB = patrolCandidate(enemyRow.homeX, enemyRow.homeZ, ctx.random(), ctx.random());
          const picked = pickPatrolPoint(candidateA.x, candidateA.z, candidateB.x, candidateB.z, neighbor);
          const pickedX = clampToWorld(picked.x);
          const pickedZ = clampToWorld(picked.z);
          const walkable = isWalkable(pickedX, pickedZ);
          result.patrolTargetX = walkable ? pickedX : enemyRow.homeX;
          result.patrolTargetZ = walkable ? pickedZ : enemyRow.homeZ;
          result.restUntilMicros = now + patrolRestMicros(ctx.random());
        }
        // Resting at the point (or waiting out the fresh rest just written).
      } else {
        targetX = result.patrolTargetX;
        targetZ = result.patrolTargetZ;
        hasMoveTarget = now >= result.restUntilMicros;
      }
    }

    if (slime) {
      // Slimes move ONLY via hops: grounded = stationary. The hop cycle runs
      // on MICROS deadlines, so tick length never changes the rhythm.
      if (isAirborne(now, result.hopStartedAtMicros, result.hopDurationMicros)) {
        // Travel along the locked hop displacement; same clamp + walkable
        // refusal the walk uses (a refused mid-air step stands, the landing
        // snap below still puts it on the validated landing).
        const moved = stepToward(
          result.x,
          result.z,
          result.hopTargetX,
          result.hopTargetZ,
          hopTravelSpeedFor(spiky) * dtSeconds
        );
        const nextX = clampToWorld(moved.x);
        const nextZ = clampToWorld(moved.z);
        if (isWalkable(nextX, nextZ)) {
          result.x = nextX;
          result.z = nextZ;
        }
      } else if (hasLanded(now, result.hopStartedAtMicros, result.hopDurationMicros)) {
        // LANDING tick (fires once — the duration is cleared below): snap to
        // the landing locked at hop start, slam, then rest before the next hop.
        if (isWalkable(result.hopTargetX, result.hopTargetZ)) {
          result.x = result.hopTargetX;
          result.z = result.hopTargetZ;
        }
        resolveSlamLanding(
          ctx,
          now,
          enemyRow,
          result.x,
          result.z,
          spiky,
          playerByHex,
          playerDamage,
          goliathBodies,
          goliathDamage
        );
        result.hopDurationMicros = 0n;
        result.restUntilMicros = now + nextHopPauseMicros(ctx.random(), spiky);
      } else if (hasMoveTarget && now >= result.restUntilMicros) {
        // Grounded, rested, and has somewhere to be → start a hop. The landing
        // is locked NOW (capped hop length toward the move target); a landing
        // off walkable ground becomes a bounce in place at the cliff edge.
        const landing = hopLandingToward(result.x, result.z, targetX, targetZ);
        let landingX = clampToWorld(landing.x);
        let landingZ = clampToWorld(landing.z);
        if (!isWalkable(landingX, landingZ)) {
          landingX = result.x;
          landingZ = result.z;
        }
        result.hopStartedAtMicros = now;
        result.hopDurationMicros = hopAirtimeMicrosFor(spiky);
        result.hopTargetX = landingX;
        result.hopTargetZ = landingZ;
      }
    } else if (hasMoveTarget) {
      // Wisps/golems: smooth walk with mutual-avoidance steering against
      // camp-mates, so two members on crossing paths arc apart instead of
      // shoving through each other. Same clamp + walkable refusal as before.
      const moved = steeredStep(
        enemyRow.enemyId,
        result.x,
        result.z,
        targetX,
        targetZ,
        stats.moveSpeed * dtSeconds,
        stats.collisionRadius,
        obstacles
      );
      const nextX = clampToWorld(moved.x);
      const nextZ = clampToWorld(moved.z);
      if (isWalkable(nextX, nextZ)) {
        result.x = nextX;
        result.z = nextZ;
      }
    }
  }
  return results;
}
