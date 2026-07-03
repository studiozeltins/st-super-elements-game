import * as THREE from 'three';
import { ELEMENTS, resolveReaction, type ElementId } from '../data/elements';
import { SAFE_ZONE_RADIUS } from '../data/constants';
import {
  BOSS_DAMAGE_MULTIPLIER,
  BOSS_HEALTH_MULTIPLIER,
  BOSS_MASS_MULTIPLIER,
  BOSS_SCALE,
  ENEMY_ARCHETYPES,
  type EnemyArchetype,
} from '../data/enemyArchetypes';
import type { CollisionBody } from '../physics/resolveCollisions';
import { createEnemyModel, disposeEnemyModel, type EnemyModel } from '../entities/createEnemyModel';
import { getCampSites } from '../world/camps';
import { createSeededRandom } from '../world/rng';
import type { DamageKind } from '../combat/damageKind';
import type { EffectSystem } from './createEffectSystem';

/** Reports a damage instance so the caller can spawn a floating number. */
export type DamageReporter = (
  worldPosition: THREE.Vector3,
  amount: number,
  kind: DamageKind,
  color?: number
) => void;

interface ElementalHitResult {
  finalDamage: number;
  reacted: boolean;
  reactionColor: number | null;
}

interface Enemy {
  model: EnemyModel;
  archetype: EnemyArchetype;
  collisionBody: CollisionBody;
  baseBodyY: number;
  homeX: number;
  homeZ: number;
  homeGroundY: number;
  maxHealth: number;
  health: number;
  contactDamage: number;
  auraElement: ElementId | null;
  auraExpiresAt: number;
  reactionFlashUntil: number;
  frozenUntil: number;
  nextContactHitAt: number;
  respawnAt: number;
  isAlive: boolean;
}

export interface EnemySystem {
  update(
    deltaSeconds: number,
    playerPosition: THREE.Vector3,
    onPlayerHit: (damage: number) => void
  ): void;
  applyDamageInRadius(
    center: { x: number; y: number; z: number },
    radius: number,
    damage: number,
    element: ElementId,
    kind: DamageKind
  ): boolean;
  getAlivePositions(): THREE.Vector3[];
  /** Appends live pushable bodies (position refs) into the shared, reused array. */
  collectCollisionBodies(target: CollisionBody[]): void;
  dispose(): void;
}

const PACK_SIZE_PER_CAMP = 4;
const ENEMY_AGGRO_RANGE = 13;
const ENEMY_LEASH_RANGE = 22;
const ENEMY_CONTACT_RANGE = 1.4;
const ENEMY_CONTACT_COOLDOWN_SECONDS = 1;
const AURA_DURATION_SECONDS = 8;
/** Above this remaining-fraction the aura icon is solid; below it blinks. */
const AURA_STRONG_FRACTION = 0.5;
const REACTION_FLASH_SECONDS = 0.7;
const FREEZE_DURATION_SECONDS = 2;
const RESPAWN_DELAY_SECONDS = 6;
const SPAWN_SCATTER_RADIUS = 3;
/** Attacks only connect within this vertical gap — no hitting across cliffs. */
const VERTICAL_HIT_GATE = 3;
const ENEMY_PLATFORM_REACH = 2.6;
const ENEMY_MAX_DROP = 4;

// Per-frame scratch vectors — avoids ~10k allocations/second in moveEnemy.
const scratchToPlayer = new THREE.Vector3();
const scratchMoveDirection = new THREE.Vector3();
const scratchHomeTarget = new THREE.Vector3();

function locomotionBob(enemy: Enemy, elapsedSeconds: number, isMoving: boolean): number {
  if (enemy.archetype.locomotion === 'float') return Math.sin(elapsedSeconds * 3) * 0.25;
  if (!isMoving) return 0;
  if (enemy.archetype.locomotion === 'stomp') return Math.abs(Math.sin(elapsedSeconds * 4)) * 0.08;
  return Math.abs(Math.sin(elapsedSeconds * 6)) * 0.35;
}

export function createEnemySystem(
  scene: THREE.Scene,
  effectSystem: EffectSystem,
  getGroundHeight: (x: number, z: number, maxSurfaceY?: number) => number,
  onEnemyKilled: (rewardTier: number) => void,
  reportDamage: DamageReporter
): EnemySystem {
  let elapsedSeconds = 0;
  const enemies: Enemy[] = [];
  const spawnRandom = createSeededRandom(0xbeef5);

  function spawnPositionNearHome(enemy: Pick<Enemy, 'homeX' | 'homeZ'>): THREE.Vector3 {
    const angle = spawnRandom() * Math.PI * 2;
    const distance = spawnRandom() * SPAWN_SCATTER_RADIUS;
    const x = enemy.homeX + Math.cos(angle) * distance;
    const z = enemy.homeZ + Math.sin(angle) * distance;
    return new THREE.Vector3(x, getGroundHeight(x, z), z);
  }

  for (const campSite of getCampSites()) {
    const archetype = ENEMY_ARCHETYPES[campSite.archetypeId];
    const packSize = PACK_SIZE_PER_CAMP + 1; // pack + one boss
    for (let memberIndex = 0; memberIndex < packSize; memberIndex++) {
      const isBoss = memberIndex === 0;
      const model = createEnemyModel(archetype, isBoss ? BOSS_SCALE : 1);
      const maxHealth = Math.round(
        archetype.maxHealth * (isBoss ? BOSS_HEALTH_MULTIPLIER : 1)
      );
      const scale = isBoss ? BOSS_SCALE : 1;
      const enemy: Enemy = {
        model,
        archetype,
        collisionBody: {
          position: model.group.position,
          radius: archetype.collisionRadius * scale,
          mass: archetype.mass * (isBoss ? BOSS_MASS_MULTIPLIER : 1),
        },
        baseBodyY: model.body.position.y,
        homeX: campSite.x,
        homeZ: campSite.z,
        homeGroundY: getGroundHeight(campSite.x, campSite.z),
        maxHealth,
        health: maxHealth,
        contactDamage: Math.round(
          archetype.contactDamage * (isBoss ? BOSS_DAMAGE_MULTIPLIER : 1)
        ),
        auraElement: null,
        auraExpiresAt: 0,
        reactionFlashUntil: 0,
        frozenUntil: 0,
        nextContactHitAt: 0,
        respawnAt: 0,
        isAlive: true,
      };
      enemy.model.group.position.copy(spawnPositionNearHome(enemy));
      scene.add(enemy.model.group);
      enemies.push(enemy);
    }
  }

  function refreshAuraVisual(enemy: Enemy) {
    const material = enemy.model.body.material as THREE.MeshLambertMaterial;
    if (!enemy.auraElement) {
      material.emissive.setHex(
        enemy.archetype.locomotion === 'float' ? enemy.archetype.bodyColor : 0x000000
      );
      return;
    }
    material.emissive.setHex(ELEMENTS[enemy.auraElement].color);
    material.emissiveIntensity = 0.55;
    const iconMaterial = enemy.model.auraIcon.material as THREE.SpriteMaterial;
    iconMaterial.color.setHex(ELEMENTS[enemy.auraElement].color);
  }

  /** Solid icon = fresh/strong aura, blinking = fading; mixed color on reaction. */
  function updateAuraIcon(enemy: Enemy) {
    const icon = enemy.model.auraIcon;
    const iconMaterial = icon.material as THREE.SpriteMaterial;

    if (elapsedSeconds < enemy.reactionFlashUntil) {
      icon.visible = true;
      iconMaterial.opacity = 1;
      icon.scale.set(0.6, 0.6, 1); // pops bigger while the elements mix
      return;
    }
    if (!enemy.auraElement) {
      icon.visible = false;
      return;
    }
    icon.visible = true;
    icon.scale.set(0.42, 0.42, 1);
    const remainingFraction = (enemy.auraExpiresAt - elapsedSeconds) / AURA_DURATION_SECONDS;
    if (remainingFraction > AURA_STRONG_FRACTION) {
      iconMaterial.opacity = 1;
      return;
    }
    iconMaterial.opacity = 0.35 + Math.abs(Math.sin(elapsedSeconds * 9)) * 0.65;
  }

  function killEnemy(enemy: Enemy) {
    enemy.isAlive = false;
    enemy.model.group.visible = false;
    enemy.respawnAt = elapsedSeconds + RESPAWN_DELAY_SECONDS;
    effectSystem.spawnBurst(
      enemy.model.group.position.clone().setY(enemy.model.group.position.y + 0.8),
      0xffffff,
      26
    );
    onEnemyKilled(enemy.archetype.rewardTier);
  }

  function respawnEnemy(enemy: Enemy) {
    enemy.isAlive = true;
    enemy.model.group.visible = true;
    enemy.health = enemy.maxHealth;
    enemy.model.healthBarFill.scale.x = 1.2;
    enemy.auraElement = null;
    enemy.reactionFlashUntil = 0;
    enemy.model.auraIcon.visible = false;
    enemy.frozenUntil = 0;
    enemy.model.group.position.copy(spawnPositionNearHome(enemy));
    refreshAuraVisual(enemy);
  }

  function applyElementalHit(enemy: Enemy, damage: number, element: ElementId): ElementalHitResult {
    if (!enemy.auraElement) {
      enemy.auraElement = element;
      enemy.auraExpiresAt = elapsedSeconds + AURA_DURATION_SECONDS;
      refreshAuraVisual(enemy);
      return { finalDamage: damage, reacted: false, reactionColor: null };
    }

    const reaction = resolveReaction(enemy.auraElement, element);
    if (!reaction) {
      enemy.auraExpiresAt = elapsedSeconds + AURA_DURATION_SECONDS;
      return { finalDamage: damage, reacted: false, reactionColor: null };
    }

    // Second element mixes with the aura: consume it, flash the mixed color,
    // and deal bonus reaction damage.
    enemy.auraElement = null;
    enemy.reactionFlashUntil = elapsedSeconds + REACTION_FLASH_SECONDS;
    (enemy.model.auraIcon.material as THREE.SpriteMaterial).color.setHex(reaction.color);
    refreshAuraVisual(enemy);
    if (reaction.freezes) enemy.frozenUntil = elapsedSeconds + FREEZE_DURATION_SECONDS;
    effectSystem.spawnBurst(
      enemy.model.group.position.clone().setY(enemy.model.group.position.y + 1),
      reaction.color,
      32
    );
    return {
      finalDamage: damage * reaction.damageMultiplier,
      reacted: true,
      reactionColor: reaction.color,
    };
  }

  function moveEnemy(enemy: Enemy, playerPosition: THREE.Vector3, deltaSeconds: number): number {
    const position = enemy.model.group.position;
    scratchToPlayer.subVectors(playerPosition, position);
    scratchToPlayer.y = 0;
    const distanceToPlayer = scratchToPlayer.length();
    const distanceFromHome = Math.hypot(position.x - enemy.homeX, position.z - enemy.homeZ);
    const playerInSafeZone = Math.hypot(playerPosition.x, playerPosition.z) <= SAFE_ZONE_RADIUS;

    const isChasing =
      !playerInSafeZone &&
      distanceToPlayer < ENEMY_AGGRO_RANGE &&
      distanceFromHome < ENEMY_LEASH_RANGE &&
      distanceToPlayer > 0.01;
    const isReturningHome = !isChasing && distanceFromHome > SPAWN_SCATTER_RADIUS + 1;

    let moveTarget: THREE.Vector3 | null = null;
    if (isChasing) moveTarget = playerPosition;
    if (isReturningHome) moveTarget = scratchHomeTarget.set(enemy.homeX, 0, enemy.homeZ);

    if (moveTarget) {
      scratchMoveDirection
        .set(moveTarget.x - position.x, 0, moveTarget.z - position.z)
        .normalize();
      const nextX = position.x + scratchMoveDirection.x * enemy.archetype.moveSpeed * deltaSeconds;
      const nextZ = position.z + scratchMoveDirection.z * enemy.archetype.moveSpeed * deltaSeconds;
      const nextGround = getGroundHeight(nextX, nextZ, position.y + ENEMY_PLATFORM_REACH);
      // Enemies stop at cliff edges instead of diving into the void.
      const wouldFallOffCliff = position.y - nextGround > ENEMY_MAX_DROP;
      if (!wouldFallOffCliff) {
        position.x = nextX;
        position.z = nextZ;
      }
      enemy.model.group.lookAt(moveTarget.x, position.y, moveTarget.z);
    }

    // Applies even when idle — collision shoves must not leave enemies inside
    // the safe zone or stranded in the void below their home island.
    const distanceFromCenter = Math.hypot(position.x, position.z);
    if (distanceFromCenter < SAFE_ZONE_RADIUS + 1 && distanceFromCenter > 0) {
      const pushOut = (SAFE_ZONE_RADIUS + 1) / distanceFromCenter;
      position.x *= pushOut;
      position.z *= pushOut;
    }
    if (enemy.homeGroundY - position.y > ENEMY_MAX_DROP) {
      position.copy(spawnPositionNearHome(enemy));
    }

    position.y = getGroundHeight(position.x, position.z, position.y + ENEMY_PLATFORM_REACH);
    enemy.model.body.position.y =
      enemy.baseBodyY + locomotionBob(enemy, elapsedSeconds, moveTarget !== null);
    return distanceToPlayer;
  }

  return {
    update(deltaSeconds, playerPosition, onPlayerHit) {
      elapsedSeconds += deltaSeconds;
      for (const enemy of enemies) {
        if (!enemy.isAlive) {
          if (elapsedSeconds >= enemy.respawnAt) respawnEnemy(enemy);
          continue;
        }
        if (enemy.auraElement && elapsedSeconds >= enemy.auraExpiresAt) {
          enemy.auraElement = null;
          refreshAuraVisual(enemy);
        }
        updateAuraIcon(enemy);
        if (elapsedSeconds < enemy.frozenUntil) continue;

        const distanceToPlayer = moveEnemy(enemy, playerPosition, deltaSeconds);
        const verticalGap = Math.abs(enemy.model.group.position.y - playerPosition.y);
        const canHit =
          distanceToPlayer < ENEMY_CONTACT_RANGE * enemy.model.group.scale.x &&
          verticalGap < 1.6 &&
          elapsedSeconds >= enemy.nextContactHitAt;
        if (canHit) {
          enemy.nextContactHitAt = elapsedSeconds + ENEMY_CONTACT_COOLDOWN_SECONDS;
          onPlayerHit(enemy.contactDamage);
        }
      }
    },
    applyDamageInRadius(center, radius, damage, element, kind) {
      let hitSomething = false;
      for (const enemy of enemies) {
        if (!enemy.isAlive) continue;
        const position = enemy.model.group.position;
        if (Math.abs(position.y + 0.6 - center.y) > VERTICAL_HIT_GATE) continue;
        const distance = Math.hypot(position.x - center.x, position.z - center.z);
        if (distance > radius + 0.75 * enemy.model.group.scale.x) continue;
        hitSomething = true;
        const result = applyElementalHit(enemy, damage, element);
        enemy.health -= result.finalDamage;
        const healthFraction = Math.max(0, enemy.health / enemy.maxHealth);
        enemy.model.healthBarFill.scale.x = 1.2 * healthFraction;
        effectSystem.spawnBurst(position.clone().setY(position.y + 0.9), ELEMENTS[element].color, 10);
        reportDamage(
          position.clone().setY(position.y + 1),
          result.finalDamage,
          result.reacted ? 'reaction' : kind,
          result.reactionColor ?? undefined
        );
        if (enemy.health <= 0) killEnemy(enemy);
      }
      return hitSomething;
    },
    getAlivePositions() {
      return enemies.filter(enemy => enemy.isAlive).map(enemy => enemy.model.group.position);
    },
    collectCollisionBodies(target) {
      for (const enemy of enemies) {
        if (enemy.isAlive) target.push(enemy.collisionBody);
      }
    },
    dispose() {
      for (const enemy of enemies) {
        disposeEnemyModel(enemy.model);
        scene.remove(enemy.model.group);
      }
      enemies.length = 0;
    },
  };
}
