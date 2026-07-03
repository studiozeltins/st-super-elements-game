import * as THREE from 'three';
import { CHARACTERS, type CharacterDefinition } from './data/characters';
import { WEAPONS } from './data/weapons';
import { ELEMENTS } from './data/elements';
import {
  GRAVITY,
  JUMP_VELOCITY,
  MAX_HEALTH,
  POSITION_SYNC_INTERVAL_SECONDS,
  SAFE_ZONE_HEAL_PER_SECOND,
  WORLD_BOUND,
} from './data/constants';
import { createPixelRenderer } from './engine/createPixelRenderer';
import { createMondstadtWorld, isInsideSafeZone } from './world/createMondstadtWorld';
import { createCharacterModel, createNameSprite, type CharacterModel } from './entities/createCharacterModel';
import { createInputSystem } from './systems/createInputSystem';
import { createEffectSystem, type DamageApplier } from './systems/createEffectSystem';
import { createEnemySystem } from './systems/createEnemySystem';
import type { Player, SkillCast } from '../module_bindings/types';

export interface HudState {
  attackCooldownFraction: number;
  skillCooldownFraction: number;
  inSafeZone: boolean;
}

export interface GameNetworkActions {
  sendPosition(x: number, y: number, z: number, rotationY: number): void;
  sendCastSkill(
    skillId: string,
    originX: number,
    originZ: number,
    directionX: number,
    directionZ: number
  ): void;
  sendAttackPlayer(target: Player, damage: number): void;
  sendTakeDamage(damage: number): void;
  sendHeal(amount: number): void;
  sendKillReward(): void;
}

export interface Game {
  start(): void;
  dispose(): void;
  setActiveCharacter(characterId: string): void;
  syncRemotePlayers(players: readonly Player[], myIdentityHex: string | null): void;
  syncMyServerRow(row: Player): void;
  handleRemoteSkillCast(cast: SkillCast): void;
  setTouchMove(x: number, z: number): void;
  pressTouchButton(button: 'attack' | 'skill' | 'jump'): void;
  releaseTouchButton(button: 'attack'): void;
  onPartySlotRequested: ((slotIndex: number) => void) | null;
}

interface RemotePlayerView {
  model: CharacterModel;
  nameSprite: THREE.Sprite;
  characterId: string;
  row: Player;
  targetPosition: THREE.Vector3;
  targetRotationY: number;
  lastPvpHitAt: number;
}

const CAMERA_OFFSET = new THREE.Vector3(7, 15, 11);
const CAMERA_YAW = Math.atan2(CAMERA_OFFSET.x, CAMERA_OFFSET.z);
const DASH_DISTANCE = 5;
const PVP_HIT_COOLDOWN_SECONDS = 0.3;
const POSITION_EPSILON = 0.01;
const SERVER_TELEPORT_THRESHOLD = 20;

export function createGame(
  canvas: HTMLCanvasElement,
  network: GameNetworkActions,
  onHudChange: (hud: HudState) => void
): Game {
  const scene = new THREE.Scene();
  const pixelRenderer = createPixelRenderer(canvas);
  const world = createMondstadtWorld(scene);
  const effectSystem = createEffectSystem(scene);
  const enemySystem = createEnemySystem(scene, effectSystem, () => network.sendKillReward());
  const inputSystem = createInputSystem(canvas);

  let activeCharacter: CharacterDefinition = CHARACTERS.zibo;
  let playerModel = createCharacterModel(activeCharacter);
  scene.add(playerModel.group);

  const playerPosition = new THREE.Vector3(0, 0, 0);
  let playerVelocityY = 0;
  let playerRotationY = 0;
  let myServerHealth = MAX_HEALTH;
  let elapsedSeconds = 0;
  let positionSyncTimer = 0;
  let healTimer = 0;
  let attackReadyAt = 0;
  const skillReadyAtByCharacter = new Map<string, number>();
  const remotePlayers = new Map<string, RemotePlayerView>();
  let animationFrameHandle = 0;
  let lastFrameTime = 0;
  let lastSentPosition = new THREE.Vector3(Infinity, 0, 0);

  const applyLocalDamage: DamageApplier = (center, radius, damage, element) => {
    const hitEnemy = enemySystem.applyDamageInRadius(center, radius, damage, element);
    const hitPlayer = applyPvpDamage(center, radius, damage);
    return hitEnemy || hitPlayer;
  };

  function applyPvpDamage(
    center: { x: number; z: number },
    radius: number,
    damage: number
  ): boolean {
    if (isInsideSafeZone(playerPosition.x, playerPosition.z)) return false;
    let hitSomeone = false;
    for (const remotePlayer of remotePlayers.values()) {
      const remotePosition = remotePlayer.model.group.position;
      if (isInsideSafeZone(remotePosition.x, remotePosition.z)) continue;
      if (elapsedSeconds < remotePlayer.lastPvpHitAt + PVP_HIT_COOLDOWN_SECONDS) continue;
      const distance = Math.hypot(remotePosition.x - center.x, remotePosition.z - center.z);
      if (distance > radius + 0.8) continue;
      remotePlayer.lastPvpHitAt = elapsedSeconds;
      hitSomeone = true;
      network.sendAttackPlayer(remotePlayer.row, Math.round(damage));
      effectSystem.spawnBurst(remotePosition.clone().setY(1.2), 0xff4a4a, 14);
    }
    return hitSomeone;
  }

  function facingDirection(): { x: number; z: number } {
    return { x: Math.sin(playerRotationY), z: Math.cos(playerRotationY) };
  }

  function faceNearestTarget(maxRange: number): boolean {
    let nearestDistance = maxRange;
    let nearestPosition: THREE.Vector3 | null = null;
    for (const remotePlayer of remotePlayers.values()) {
      const remotePosition = remotePlayer.model.group.position;
      if (isInsideSafeZone(remotePosition.x, remotePosition.z)) continue;
      const distance = playerPosition.distanceTo(remotePosition);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestPosition = remotePosition;
      }
    }
    const nearestEnemyPosition = findNearestEnemyPosition(nearestDistance);
    if (nearestEnemyPosition) nearestPosition = nearestEnemyPosition;
    if (!nearestPosition) return false;
    playerRotationY = Math.atan2(
      nearestPosition.x - playerPosition.x,
      nearestPosition.z - playerPosition.z
    );
    return true;
  }

  function findNearestEnemyPosition(maxRange: number): THREE.Vector3 | null {
    let nearestPosition: THREE.Vector3 | null = null;
    let nearestDistance = maxRange;
    for (const candidate of enemySystem.getAlivePositions()) {
      const distance = playerPosition.distanceTo(candidate);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestPosition = candidate;
      }
    }
    return nearestPosition;
  }

  function performAttack() {
    const weapon = WEAPONS[activeCharacter.weapon];
    if (elapsedSeconds < attackReadyAt) return;
    attackReadyAt = elapsedSeconds + weapon.cooldownSeconds;
    faceNearestTarget(weapon.range + 3);
    const direction = facingDirection();
    const elementColor = ELEMENTS[activeCharacter.element].color;

    if (weapon.isRanged) {
      effectSystem.spawnProjectile({
        origin: playerPosition.clone().setY(1.2),
        direction,
        speed: weapon.projectileSpeed,
        damage: weapon.damage,
        element: activeCharacter.element,
        hitRadius: 0.9,
        applyDamage: applyLocalDamage,
      });
      return;
    }

    const hitCenter = {
      x: playerPosition.x + direction.x * weapon.range * 0.6,
      z: playerPosition.z + direction.z * weapon.range * 0.6,
    };
    effectSystem.spawnMeleeSlash(playerPosition, playerRotationY, elementColor);
    applyLocalDamage(hitCenter, weapon.range * 0.75, weapon.damage, activeCharacter.element);
  }

  function performSkill() {
    const skill = activeCharacter.skill;
    const skillReadyAt = skillReadyAtByCharacter.get(activeCharacter.id) ?? 0;
    if (elapsedSeconds < skillReadyAt) return;
    skillReadyAtByCharacter.set(activeCharacter.id, elapsedSeconds + skill.cooldownSeconds);
    faceNearestTarget(16);
    const direction = facingDirection();

    if (skill.kind === 'dash') {
      playerPosition.x += direction.x * DASH_DISTANCE;
      playerPosition.z += direction.z * DASH_DISTANCE;
      clampPlayerToWorld();
    }

    effectSystem.spawnSkillEffect({
      skill,
      element: activeCharacter.element,
      origin: playerPosition.clone().setY(1),
      direction,
      applyDamage: applyLocalDamage,
      followPosition: () => playerPosition,
    });
    network.sendCastSkill(skill.id, playerPosition.x, playerPosition.z, direction.x, direction.z);
  }

  function clampPlayerToWorld() {
    playerPosition.x = Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, playerPosition.x));
    playerPosition.z = Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, playerPosition.z));
  }

  function updateLocalPlayer(deltaSeconds: number) {
    const moveVector = inputSystem.getMoveVector();
    const isMoving = Math.hypot(moveVector.x, moveVector.z) > 0.05;
    if (isMoving) {
      // Rotate screen-space input by the camera yaw so "up" moves away from the camera.
      const worldMoveX =
        moveVector.x * Math.cos(CAMERA_YAW) + moveVector.z * Math.sin(CAMERA_YAW);
      const worldMoveZ =
        -moveVector.x * Math.sin(CAMERA_YAW) + moveVector.z * Math.cos(CAMERA_YAW);
      playerPosition.x += worldMoveX * activeCharacter.moveSpeed * deltaSeconds;
      playerPosition.z += worldMoveZ * activeCharacter.moveSpeed * deltaSeconds;
      playerRotationY = Math.atan2(worldMoveX, worldMoveZ);
      clampPlayerToWorld();
    }

    if (inputSystem.consumeJump() && playerPosition.y <= 0.001) {
      playerVelocityY = JUMP_VELOCITY;
    }
    playerVelocityY -= GRAVITY * deltaSeconds;
    playerPosition.y = Math.max(0, playerPosition.y + playerVelocityY * deltaSeconds);
    if (playerPosition.y === 0) playerVelocityY = 0;

    if (inputSystem.isAttackHeld()) performAttack();
    if (inputSystem.consumeSkill()) performSkill();
    const requestedSlot = inputSystem.consumePartySlot();
    if (requestedSlot !== null) game.onPartySlotRequested?.(requestedSlot);

    playerModel.group.position.copy(playerPosition);
    playerModel.group.rotation.y = playerRotationY;
    playerModel.animate(elapsedSeconds, isMoving);
  }

  function syncPositionToServer(deltaSeconds: number) {
    positionSyncTimer += deltaSeconds;
    if (positionSyncTimer < POSITION_SYNC_INTERVAL_SECONDS) return;
    positionSyncTimer = 0;
    if (playerPosition.distanceTo(lastSentPosition) < POSITION_EPSILON) return;
    lastSentPosition = playerPosition.clone();
    network.sendPosition(playerPosition.x, playerPosition.y, playerPosition.z, playerRotationY);
  }

  function healInSafeZone(deltaSeconds: number) {
    healTimer += deltaSeconds;
    if (healTimer < 1) return;
    healTimer = 0;
    const inSafeZone = isInsideSafeZone(playerPosition.x, playerPosition.z);
    if (inSafeZone && myServerHealth < MAX_HEALTH) {
      network.sendHeal(SAFE_ZONE_HEAL_PER_SECOND);
    }
  }

  function updateRemotePlayerViews(deltaSeconds: number) {
    const lerpFactor = Math.min(1, deltaSeconds * 10);
    for (const remotePlayer of remotePlayers.values()) {
      const group = remotePlayer.model.group;
      group.position.lerp(remotePlayer.targetPosition, lerpFactor);
      group.rotation.y = remotePlayer.targetRotationY;
      const isMoving = group.position.distanceTo(remotePlayer.targetPosition) > 0.1;
      remotePlayer.model.animate(elapsedSeconds, isMoving);
    }
  }

  function updateCamera(deltaSeconds: number) {
    const desiredPosition = playerPosition.clone().add(CAMERA_OFFSET);
    pixelRenderer.camera.position.lerp(desiredPosition, Math.min(1, deltaSeconds * 6));
    pixelRenderer.camera.lookAt(playerPosition.x, 1, playerPosition.z);
  }

  function pushHudState() {
    const weapon = WEAPONS[activeCharacter.weapon];
    const skillReadyAt = skillReadyAtByCharacter.get(activeCharacter.id) ?? 0;
    onHudChange({
      attackCooldownFraction: Math.max(
        0,
        Math.min(1, (attackReadyAt - elapsedSeconds) / weapon.cooldownSeconds)
      ),
      skillCooldownFraction: Math.max(
        0,
        Math.min(1, (skillReadyAt - elapsedSeconds) / activeCharacter.skill.cooldownSeconds)
      ),
      inSafeZone: isInsideSafeZone(playerPosition.x, playerPosition.z),
    });
  }

  let hudPushTimer = 0;

  function frame(frameTime: number) {
    animationFrameHandle = requestAnimationFrame(frame);
    const deltaSeconds = Math.min(0.05, (frameTime - lastFrameTime) / 1000 || 0.016);
    lastFrameTime = frameTime;
    elapsedSeconds += deltaSeconds;

    updateLocalPlayer(deltaSeconds);
    enemySystem.update(deltaSeconds, playerPosition, damage => network.sendTakeDamage(damage));
    effectSystem.update(deltaSeconds);
    world.update(deltaSeconds);
    updateRemotePlayerViews(deltaSeconds);
    updateCamera(deltaSeconds);
    syncPositionToServer(deltaSeconds);
    healInSafeZone(deltaSeconds);

    hudPushTimer += deltaSeconds;
    if (hudPushTimer >= 0.1) {
      hudPushTimer = 0;
      pushHudState();
    }

    pixelRenderer.render(scene);
  }

  function removeRemotePlayer(identityHex: string, view: RemotePlayerView) {
    scene.remove(view.model.group);
    view.model.dispose();
    remotePlayers.delete(identityHex);
  }

  const game: Game = {
    onPartySlotRequested: null,
    start() {
      lastFrameTime = performance.now();
      animationFrameHandle = requestAnimationFrame(frame);
    },
    dispose() {
      cancelAnimationFrame(animationFrameHandle);
      inputSystem.dispose();
      effectSystem.dispose();
      enemySystem.dispose();
      pixelRenderer.dispose();
    },
    setActiveCharacter(characterId) {
      const nextCharacter = CHARACTERS[characterId];
      if (!nextCharacter || nextCharacter.id === activeCharacter.id) return;
      activeCharacter = nextCharacter;
      scene.remove(playerModel.group);
      playerModel.dispose();
      playerModel = createCharacterModel(nextCharacter);
      playerModel.group.position.copy(playerPosition);
      scene.add(playerModel.group);
      effectSystem.spawnBurst(
        playerPosition.clone().setY(1.2),
        ELEMENTS[nextCharacter.element].color,
        22
      );
    },
    syncRemotePlayers(players, myIdentityHex) {
      const seenIdentities = new Set<string>();
      for (const row of players) {
        const identityHex = row.identity.toHexString();
        if (identityHex === myIdentityHex) continue;
        if (!row.online) continue;
        seenIdentities.add(identityHex);
        const existingView = remotePlayers.get(identityHex);
        if (!existingView) {
          const character = CHARACTERS[row.activeCharacterId] ?? CHARACTERS.zibo;
          const model = createCharacterModel(character);
          const nameSprite = createNameSprite(row.name);
          model.group.add(nameSprite);
          model.group.position.set(row.positionX, row.positionY, row.positionZ);
          scene.add(model.group);
          remotePlayers.set(identityHex, {
            model,
            nameSprite,
            characterId: row.activeCharacterId,
            row,
            targetPosition: new THREE.Vector3(row.positionX, row.positionY, row.positionZ),
            targetRotationY: row.rotationY,
            lastPvpHitAt: 0,
          });
          continue;
        }
        existingView.row = row;
        existingView.targetPosition.set(row.positionX, row.positionY, row.positionZ);
        existingView.targetRotationY = row.rotationY;
        if (existingView.characterId !== row.activeCharacterId) {
          const character = CHARACTERS[row.activeCharacterId] ?? CHARACTERS.zibo;
          const previousPosition = existingView.model.group.position.clone();
          scene.remove(existingView.model.group);
          existingView.model.dispose();
          existingView.model = createCharacterModel(character);
          existingView.model.group.add(createNameSprite(row.name));
          existingView.model.group.position.copy(previousPosition);
          scene.add(existingView.model.group);
          existingView.characterId = row.activeCharacterId;
        }
      }
      for (const [identityHex, view] of remotePlayers) {
        if (!seenIdentities.has(identityHex)) removeRemotePlayer(identityHex, view);
      }
    },
    syncMyServerRow(row) {
      myServerHealth = row.currentHealth;
      const serverPosition = new THREE.Vector3(row.positionX, row.positionY, row.positionZ);
      if (playerPosition.distanceTo(serverPosition) > SERVER_TELEPORT_THRESHOLD) {
        // The server respawned us (death) — accept its position.
        playerPosition.copy(serverPosition);
        playerVelocityY = 0;
      }
      game.setActiveCharacter(row.activeCharacterId);
    },
    handleRemoteSkillCast(cast) {
      const character = CHARACTERS[cast.characterId];
      if (!character) return;
      const casterView = [...remotePlayers.values()].find(
        view => view.row.identity.toHexString() === cast.caster.toHexString()
      );
      effectSystem.spawnSkillEffect({
        skill: character.skill,
        element: character.element,
        origin: new THREE.Vector3(cast.originX, 1, cast.originZ),
        direction: { x: cast.directionX, z: cast.directionZ },
        applyDamage: null,
        followPosition: casterView ? () => casterView.model.group.position : undefined,
      });
    },
    setTouchMove(x, z) {
      inputSystem.setTouchMove(x, z);
    },
    pressTouchButton(button) {
      inputSystem.pressTouchButton(button);
    },
    releaseTouchButton(button) {
      inputSystem.releaseTouchButton(button);
    },
  };

  return game;
}
