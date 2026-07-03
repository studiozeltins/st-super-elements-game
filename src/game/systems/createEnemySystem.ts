import * as THREE from 'three';
import { ELEMENTS, resolveReaction, type ElementId } from '../data/elements';
import { SAFE_ZONE_RADIUS } from '../data/constants';
import { getCampSites } from '../world/camps';
import { createSeededRandom } from '../world/rng';
import type { EffectSystem } from './createEffectSystem';

interface Enemy {
  body: THREE.Mesh;
  group: THREE.Group;
  healthBarFill: THREE.Sprite;
  homeX: number;
  homeZ: number;
  maxHealth: number;
  health: number;
  contactDamage: number;
  isBoss: boolean;
  auraElement: ElementId | null;
  auraExpiresAt: number;
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
    center: { x: number; z: number },
    radius: number,
    damage: number,
    element: ElementId
  ): boolean;
  getAlivePositions(): THREE.Vector3[];
  dispose(): void;
}

const PACK_SIZE_PER_CAMP = 4;
const ENEMY_MAX_HEALTH = 320;
const BOSS_MAX_HEALTH = 900;
const ENEMY_MOVE_SPEED = 3.2;
const ENEMY_AGGRO_RANGE = 13;
const ENEMY_LEASH_RANGE = 22;
const ENEMY_CONTACT_RANGE = 1.4;
const ENEMY_CONTACT_DAMAGE = 45;
const BOSS_CONTACT_DAMAGE = 70;
const BOSS_SCALE = 1.55;
const ENEMY_CONTACT_COOLDOWN_SECONDS = 1;
const AURA_DURATION_SECONDS = 8;
const FREEZE_DURATION_SECONDS = 2;
const RESPAWN_DELAY_SECONDS = 6;
const SPAWN_SCATTER_RADIUS = 3;

// Shared across all enemies — allocated once, disposed with the system.
const sharedBodyGeometry = new THREE.SphereGeometry(0.75, 10, 8);
const sharedEyeGeometry = new THREE.SphereGeometry(0.09, 6, 6);
const sharedEyeMaterial = new THREE.MeshBasicMaterial({ color: 0x101410 });

function createHealthBar(group: THREE.Group): THREE.Sprite {
  const background = new THREE.Sprite(
    new THREE.SpriteMaterial({ color: 0x141814, depthTest: false })
  );
  background.scale.set(1.3, 0.14, 1);
  background.position.y = 1.6;
  const fill = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x7ec843, depthTest: false }));
  fill.scale.set(1.2, 0.09, 1);
  fill.position.y = 1.6;
  group.add(background, fill);
  return fill;
}

function createEnemyMesh(isBoss: boolean) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    sharedBodyGeometry,
    new THREE.MeshLambertMaterial({ color: isBoss ? 0x7a9868 : 0x8aa87a, emissive: 0x000000 })
  );
  body.scale.y = 0.72;
  body.position.y = 0.55;
  body.castShadow = true;
  const leftEye = new THREE.Mesh(sharedEyeGeometry, sharedEyeMaterial);
  leftEye.position.set(-0.22, 0.7, 0.6);
  const rightEye = leftEye.clone();
  rightEye.position.x = 0.22;
  group.add(body, leftEye, rightEye);
  const healthBarFill = createHealthBar(group);
  if (isBoss) group.scale.setScalar(BOSS_SCALE);
  return { group, body, healthBarFill };
}

export function createEnemySystem(
  scene: THREE.Scene,
  effectSystem: EffectSystem,
  getGroundHeight: (x: number, z: number) => number,
  onEnemyKilled: () => void
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
    const packSize = PACK_SIZE_PER_CAMP + 1; // pack + one boss
    for (let memberIndex = 0; memberIndex < packSize; memberIndex++) {
      const isBoss = memberIndex === 0;
      const { group, body, healthBarFill } = createEnemyMesh(isBoss);
      const enemy: Enemy = {
        group,
        body,
        healthBarFill,
        homeX: campSite.x,
        homeZ: campSite.z,
        maxHealth: isBoss ? BOSS_MAX_HEALTH : ENEMY_MAX_HEALTH,
        health: isBoss ? BOSS_MAX_HEALTH : ENEMY_MAX_HEALTH,
        contactDamage: isBoss ? BOSS_CONTACT_DAMAGE : ENEMY_CONTACT_DAMAGE,
        isBoss,
        auraElement: null,
        auraExpiresAt: 0,
        frozenUntil: 0,
        nextContactHitAt: 0,
        respawnAt: 0,
        isAlive: true,
      };
      enemy.group.position.copy(spawnPositionNearHome(enemy));
      scene.add(enemy.group);
      enemies.push(enemy);
    }
  }

  function refreshAuraVisual(enemy: Enemy) {
    const material = enemy.body.material as THREE.MeshLambertMaterial;
    if (!enemy.auraElement) {
      material.emissive.setHex(0x000000);
      return;
    }
    material.emissive.setHex(ELEMENTS[enemy.auraElement].color);
    material.emissiveIntensity = 0.55;
  }

  function killEnemy(enemy: Enemy) {
    enemy.isAlive = false;
    enemy.group.visible = false;
    enemy.respawnAt = elapsedSeconds + RESPAWN_DELAY_SECONDS;
    effectSystem.spawnBurst(enemy.group.position.clone().setY(enemy.group.position.y + 0.8), 0xffffff, 26);
    onEnemyKilled();
  }

  function respawnEnemy(enemy: Enemy) {
    enemy.isAlive = true;
    enemy.group.visible = true;
    enemy.health = enemy.maxHealth;
    enemy.auraElement = null;
    enemy.frozenUntil = 0;
    enemy.group.position.copy(spawnPositionNearHome(enemy));
    refreshAuraVisual(enemy);
  }

  function applyElementalHit(enemy: Enemy, damage: number, element: ElementId): number {
    if (!enemy.auraElement) {
      enemy.auraElement = element;
      enemy.auraExpiresAt = elapsedSeconds + AURA_DURATION_SECONDS;
      refreshAuraVisual(enemy);
      return damage;
    }

    const reaction = resolveReaction(enemy.auraElement, element);
    if (!reaction) {
      enemy.auraExpiresAt = elapsedSeconds + AURA_DURATION_SECONDS;
      return damage;
    }

    enemy.auraElement = null;
    refreshAuraVisual(enemy);
    if (reaction.freezes) enemy.frozenUntil = elapsedSeconds + FREEZE_DURATION_SECONDS;
    effectSystem.spawnBurst(enemy.group.position.clone().setY(enemy.group.position.y + 1), reaction.color, 32);
    return damage * reaction.damageMultiplier;
  }

  function moveEnemy(enemy: Enemy, playerPosition: THREE.Vector3, deltaSeconds: number): number {
    const position = enemy.group.position;
    const toPlayer = new THREE.Vector3().subVectors(playerPosition, position);
    toPlayer.y = 0;
    const distanceToPlayer = toPlayer.length();
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
    if (isReturningHome) moveTarget = new THREE.Vector3(enemy.homeX, 0, enemy.homeZ);

    if (moveTarget) {
      const direction = new THREE.Vector3(
        moveTarget.x - position.x,
        0,
        moveTarget.z - position.z
      ).normalize();
      position.addScaledVector(direction, ENEMY_MOVE_SPEED * deltaSeconds);
      const distanceFromCenter = Math.hypot(position.x, position.z);
      if (distanceFromCenter < SAFE_ZONE_RADIUS + 1) {
        const pushOut = (SAFE_ZONE_RADIUS + 1) / distanceFromCenter;
        position.x *= pushOut;
        position.z *= pushOut;
      }
      enemy.group.lookAt(moveTarget.x, position.y, moveTarget.z);
    }

    position.y = getGroundHeight(position.x, position.z);
    const isHopping = moveTarget !== null;
    enemy.body.position.y = 0.55 + (isHopping ? Math.abs(Math.sin(elapsedSeconds * 6)) * 0.35 : 0);
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
        if (elapsedSeconds < enemy.frozenUntil) continue;

        const distanceToPlayer = moveEnemy(enemy, playerPosition, deltaSeconds);
        const verticalGap = Math.abs(enemy.group.position.y - playerPosition.y);
        const canHit =
          distanceToPlayer < ENEMY_CONTACT_RANGE * enemy.group.scale.x &&
          verticalGap < 1.6 &&
          elapsedSeconds >= enemy.nextContactHitAt;
        if (canHit) {
          enemy.nextContactHitAt = elapsedSeconds + ENEMY_CONTACT_COOLDOWN_SECONDS;
          onPlayerHit(enemy.contactDamage);
        }
      }
    },
    applyDamageInRadius(center, radius, damage, element) {
      let hitSomething = false;
      for (const enemy of enemies) {
        if (!enemy.isAlive) continue;
        const distance = Math.hypot(
          enemy.group.position.x - center.x,
          enemy.group.position.z - center.z
        );
        if (distance > radius + 0.75 * enemy.group.scale.x) continue;
        hitSomething = true;
        const finalDamage = applyElementalHit(enemy, damage, element);
        enemy.health -= finalDamage;
        const healthFraction = Math.max(0, enemy.health / enemy.maxHealth);
        enemy.healthBarFill.scale.x = 1.2 * healthFraction;
        effectSystem.spawnBurst(
          enemy.group.position.clone().setY(enemy.group.position.y + 0.9),
          ELEMENTS[element].color,
          10
        );
        if (enemy.health <= 0) killEnemy(enemy);
      }
      return hitSomething;
    },
    getAlivePositions() {
      return enemies.filter(enemy => enemy.isAlive).map(enemy => enemy.group.position);
    },
    dispose() {
      for (const enemy of enemies) {
        (enemy.body.material as THREE.Material).dispose();
        enemy.group.traverse(node => {
          if (node instanceof THREE.Sprite) node.material.dispose();
        });
        scene.remove(enemy.group);
      }
      enemies.length = 0;
    },
  };
}
