import * as THREE from 'three';
import { ELEMENTS, resolveReaction, type ElementId } from '../data/elements';
import { SAFE_ZONE_RADIUS, WORLD_BOUND } from '../data/constants';
import type { EffectSystem } from './createEffectSystem';

interface Enemy {
  body: THREE.Mesh;
  group: THREE.Group;
  healthBarFill: THREE.Sprite;
  health: number;
  maxHealth: number;
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

const ENEMY_COUNT = 14;
const ENEMY_MAX_HEALTH = 320;
const ENEMY_MOVE_SPEED = 3.2;
const ENEMY_AGGRO_RANGE = 13;
const ENEMY_CONTACT_RANGE = 1.4;
const ENEMY_CONTACT_DAMAGE = 45;
const ENEMY_CONTACT_COOLDOWN_SECONDS = 1;
const AURA_DURATION_SECONDS = 8;
const FREEZE_DURATION_SECONDS = 2;
const RESPAWN_DELAY_SECONDS = 6;
const ENEMY_MIN_SPAWN_RADIUS = SAFE_ZONE_RADIUS + 8;

function randomSpawnPosition(): THREE.Vector3 {
  const angle = Math.random() * Math.PI * 2;
  const distance =
    ENEMY_MIN_SPAWN_RADIUS + Math.random() * (WORLD_BOUND - 8 - ENEMY_MIN_SPAWN_RADIUS);
  return new THREE.Vector3(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
}

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

function createEnemyMesh(): { group: THREE.Group; body: THREE.Mesh; healthBarFill: THREE.Sprite } {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    sharedBodyGeometry,
    new THREE.MeshLambertMaterial({ color: 0x8aa87a, emissive: 0x000000 })
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
  return { group, body, healthBarFill };
}

export function createEnemySystem(
  scene: THREE.Scene,
  effectSystem: EffectSystem,
  onEnemyKilled: () => void
): EnemySystem {
  let elapsedSeconds = 0;
  const enemies: Enemy[] = [];

  for (let enemyIndex = 0; enemyIndex < ENEMY_COUNT; enemyIndex++) {
    const { group, body, healthBarFill } = createEnemyMesh();
    group.position.copy(randomSpawnPosition());
    scene.add(group);
    enemies.push({
      group,
      body,
      healthBarFill,
      health: ENEMY_MAX_HEALTH,
      maxHealth: ENEMY_MAX_HEALTH,
      auraElement: null,
      auraExpiresAt: 0,
      frozenUntil: 0,
      nextContactHitAt: 0,
      respawnAt: 0,
      isAlive: true,
    });
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
    effectSystem.spawnBurst(enemy.group.position.clone().setY(0.8), 0xffffff, 26);
    onEnemyKilled();
  }

  function respawnEnemy(enemy: Enemy) {
    enemy.isAlive = true;
    enemy.group.visible = true;
    enemy.health = enemy.maxHealth;
    enemy.auraElement = null;
    enemy.frozenUntil = 0;
    enemy.group.position.copy(randomSpawnPosition());
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
    effectSystem.spawnBurst(enemy.group.position.clone().setY(1), reaction.color, 32);
    return damage * reaction.damageMultiplier;
  }

  function moveTowardPlayer(enemy: Enemy, playerPosition: THREE.Vector3, deltaSeconds: number) {
    const toPlayer = new THREE.Vector3().subVectors(playerPosition, enemy.group.position);
    toPlayer.y = 0;
    const distanceToPlayer = toPlayer.length();
    const playerInSafeZone =
      Math.hypot(playerPosition.x, playerPosition.z) <= SAFE_ZONE_RADIUS;
    const isChasing =
      !playerInSafeZone && distanceToPlayer < ENEMY_AGGRO_RANGE && distanceToPlayer > 0.01;
    if (!isChasing) {
      enemy.body.position.y = 0.55;
      return distanceToPlayer;
    }

    toPlayer.normalize();
    enemy.group.position.addScaledVector(toPlayer, ENEMY_MOVE_SPEED * deltaSeconds);
    const distanceFromCenter = Math.hypot(enemy.group.position.x, enemy.group.position.z);
    if (distanceFromCenter < SAFE_ZONE_RADIUS + 1) {
      const pushOut = (SAFE_ZONE_RADIUS + 1) / distanceFromCenter;
      enemy.group.position.x *= pushOut;
      enemy.group.position.z *= pushOut;
    }
    enemy.group.lookAt(playerPosition.x, enemy.group.position.y, playerPosition.z);
    enemy.body.position.y = 0.55 + Math.abs(Math.sin(elapsedSeconds * 6)) * 0.35;
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

        const distanceToPlayer = moveTowardPlayer(enemy, playerPosition, deltaSeconds);
        const canHit =
          distanceToPlayer < ENEMY_CONTACT_RANGE && elapsedSeconds >= enemy.nextContactHitAt;
        if (canHit) {
          enemy.nextContactHitAt = elapsedSeconds + ENEMY_CONTACT_COOLDOWN_SECONDS;
          onPlayerHit(ENEMY_CONTACT_DAMAGE);
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
        if (distance > radius + 0.75) continue;
        hitSomething = true;
        const finalDamage = applyElementalHit(enemy, damage, element);
        enemy.health -= finalDamage;
        const healthFraction = Math.max(0, enemy.health / enemy.maxHealth);
        enemy.healthBarFill.scale.x = 1.2 * healthFraction;
        effectSystem.spawnBurst(
          enemy.group.position.clone().setY(0.9),
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
