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
  sendFallToDeath(): void;
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
  setInputEnabled(enabled: boolean): void;
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
const DASH_SUBSTEPS = 4;
/** Walkable step height; anything taller needs a jump (terrace = 1.8, jump apex ≈ 2). */
const MAX_STEP_UP = 0.9;
const PVP_HIT_COOLDOWN_SECONDS = 0.3;
const PVP_MAX_HIT_RANGE = 45; // server MAX_HIT_RANGE
/** Attacks only connect within this vertical gap — no hitting across cliffs. */
const VERTICAL_HIT_GATE = 3;
const POSITION_EPSILON = 0.01;
const ROTATION_EPSILON = 0.02;
const SERVER_TELEPORT_THRESHOLD = 20;
const RESPAWN_HEALTH_JUMP = 100;
/** Falls up to ~2 terraces are free; longer drops hurt. */
const SAFE_FALL_DISTANCE = 4.5;
const FALL_DAMAGE_PER_UNIT = 50;
/** Below this Y the player has fallen off the islands — instant death. */
const VOID_KILL_DEPTH = -15;
const MOVEMENT_LIMIT = WORLD_BOUND + 5; // matches server clamp

export function createGame(
  canvas: HTMLCanvasElement,
  network: GameNetworkActions,
  onHudChange: (hud: HudState) => void
): Game {
  const scene = new THREE.Scene();
  const pixelRenderer = createPixelRenderer(canvas);
  const world = createMondstadtWorld(scene);
  const effectSystem = createEffectSystem(scene);
  const enemySystem = createEnemySystem(scene, effectSystem, world.getGroundHeight, () =>
    network.sendKillReward()
  );
  const inputSystem = createInputSystem(canvas);

  let activeCharacter: CharacterDefinition = CHARACTERS.zibo;
  let playerModel = createCharacterModel(activeCharacter);
  scene.add(playerModel.group);

  // Matches SPAWN_X/SPAWN_Z on the server (next to the plaza fountain).
  const playerPosition = new THREE.Vector3(6, 0, 6);
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
  let lastSentRotationY = Infinity;
  let fallPeakY = 0;
  let hasReportedVoidDeath = false;

  const applyLocalDamage: DamageApplier = (center, radius, damage, element) => {
    const hitEnemy = enemySystem.applyDamageInRadius(center, radius, damage, element);
    const hitPlayer = applyPvpDamage(center, radius, damage);
    return hitEnemy || hitPlayer;
  };

  function applyPvpDamage(
    center: { x: number; y: number; z: number },
    radius: number,
    damage: number
  ): boolean {
    if (isInsideSafeZone(playerPosition.x, playerPosition.z)) return false;
    let hitSomeone = false;
    for (const remotePlayer of remotePlayers.values()) {
      const remotePosition = remotePlayer.model.group.position;
      if (isInsideSafeZone(remotePosition.x, remotePosition.z)) continue;
      if (elapsedSeconds < remotePlayer.lastPvpHitAt + PVP_HIT_COOLDOWN_SECONDS) continue;
      if (playerPosition.distanceTo(remotePosition) > PVP_MAX_HIT_RANGE) continue;
      if (Math.abs(remotePosition.y + 1 - center.y) > VERTICAL_HIT_GATE) continue;
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
        origin: playerPosition.clone().setY(playerPosition.y + 1.2),
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
      y: playerPosition.y + 1,
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
      const substep = DASH_DISTANCE / DASH_SUBSTEPS;
      for (let dashStep = 0; dashStep < DASH_SUBSTEPS; dashStep++) {
        if (!tryMove(direction.x * substep, direction.z * substep)) break;
      }
      clampPlayerToWorld();
    }

    effectSystem.spawnSkillEffect({
      skill,
      element: activeCharacter.element,
      origin: playerPosition.clone().setY(playerPosition.y + 1),
      direction,
      applyDamage: applyLocalDamage,
      followPosition: () => playerPosition,
    });
    network.sendCastSkill(skill.id, playerPosition.x, playerPosition.z, direction.x, direction.z);
  }

  function clampPlayerToWorld() {
    playerPosition.x = Math.max(-MOVEMENT_LIMIT, Math.min(MOVEMENT_LIMIT, playerPosition.x));
    playerPosition.z = Math.max(-MOVEMENT_LIMIT, Math.min(MOVEMENT_LIMIT, playerPosition.z));
  }

  function isGrounded(): boolean {
    return (
      playerPosition.y <= world.getGroundHeight(playerPosition.x, playerPosition.z) + 0.02
    );
  }

  /** Moves horizontally unless blocked by a ledge taller than one step. */
  function tryMove(deltaX: number, deltaZ: number): boolean {
    const targetX = Math.max(-MOVEMENT_LIMIT, Math.min(MOVEMENT_LIMIT, playerPosition.x + deltaX));
    const targetZ = Math.max(-MOVEMENT_LIMIT, Math.min(MOVEMENT_LIMIT, playerPosition.z + deltaZ));
    const targetGround = world.getGroundHeight(targetX, targetZ);
    const ledgeHeight = targetGround - playerPosition.y;
    const grounded = isGrounded();
    if (grounded && ledgeHeight > MAX_STEP_UP) return false;
    if (!grounded && ledgeHeight > 0.1) return false;
    playerPosition.x = targetX;
    playerPosition.z = targetZ;
    if (grounded && ledgeHeight > 0) playerPosition.y = targetGround;
    return true;
  }

  function applyFallDamage(landingY: number) {
    const fallDistance = fallPeakY - landingY;
    if (fallDistance <= SAFE_FALL_DISTANCE) return;
    const damage = Math.round((fallDistance - SAFE_FALL_DISTANCE) * FALL_DAMAGE_PER_UNIT);
    network.sendTakeDamage(damage);
    effectSystem.spawnBurst(playerPosition.clone().setY(playerPosition.y + 0.5), 0xd8b48a, 16);
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
      const stepX = worldMoveX * activeCharacter.moveSpeed * deltaSeconds;
      const stepZ = worldMoveZ * activeCharacter.moveSpeed * deltaSeconds;
      if (!tryMove(stepX, stepZ) && !tryMove(stepX, 0)) tryMove(0, stepZ);
      playerRotationY = Math.atan2(worldMoveX, worldMoveZ);
    }

    if (inputSystem.consumeJump() && isGrounded()) {
      playerVelocityY = JUMP_VELOCITY;
    }
    playerVelocityY -= GRAVITY * deltaSeconds;
    playerPosition.y += playerVelocityY * deltaSeconds;
    fallPeakY = Math.max(fallPeakY, playerPosition.y);
    const groundBelow = world.getGroundHeight(playerPosition.x, playerPosition.z);
    if (playerPosition.y <= groundBelow) {
      playerPosition.y = groundBelow;
      playerVelocityY = 0;
      applyFallDamage(groundBelow);
      fallPeakY = groundBelow;
    }
    if (playerPosition.y < VOID_KILL_DEPTH && !hasReportedVoidDeath) {
      hasReportedVoidDeath = true;
      network.sendFallToDeath();
    }

    if (inputSystem.isAttackHeld()) performAttack();
    if (inputSystem.consumeSkill()) performSkill();
    const requestedSlot = inputSystem.consumePartySlot();
    if (requestedSlot !== null) game.onPartySlotRequested?.(requestedSlot);

    playerModel.group.position.copy(playerPosition);
    playerModel.group.rotation.y = playerRotationY;
    playerModel.animate(elapsedSeconds, isMoving);
  }

  function syncPositionToServer(deltaSeconds: number) {
    // While void death is pending, stop pushing positions so the server's
    // respawn row is not dragged back toward the falling client.
    if (hasReportedVoidDeath) return;
    positionSyncTimer += deltaSeconds;
    if (positionSyncTimer < POSITION_SYNC_INTERVAL_SECONDS) return;
    positionSyncTimer = 0;
    const positionUnchanged = playerPosition.distanceTo(lastSentPosition) < POSITION_EPSILON;
    const rotationUnchanged = Math.abs(playerRotationY - lastSentRotationY) < ROTATION_EPSILON;
    if (positionUnchanged && rotationUnchanged) return;
    lastSentPosition = playerPosition.clone();
    lastSentRotationY = playerRotationY;
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
    pixelRenderer.camera.lookAt(playerPosition.x, playerPosition.y + 1, playerPosition.z);
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
      for (const [identityHex, view] of remotePlayers) removeRemotePlayer(identityHex, view);
      scene.remove(playerModel.group);
      playerModel.dispose();
      world.dispose();
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
      // A big health jump only happens on death respawn (heals are +60/s).
      const wasRespawned = row.currentHealth > myServerHealth + RESPAWN_HEALTH_JUMP;
      myServerHealth = row.currentHealth;
      const serverPosition = new THREE.Vector3(row.positionX, row.positionY, row.positionZ);
      const isFarFromServer =
        playerPosition.distanceTo(serverPosition) > SERVER_TELEPORT_THRESHOLD;
      const voidRespawnConfirmed =
        hasReportedVoidDeath && serverPosition.y >= 0 && playerPosition.y < 0;
      if (wasRespawned || isFarFromServer || voidRespawnConfirmed) {
        playerPosition.copy(serverPosition);
        playerVelocityY = 0;
        fallPeakY = serverPosition.y;
        hasReportedVoidDeath = false;
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
        origin: new THREE.Vector3(
          cast.originX,
          world.getGroundHeight(cast.originX, cast.originZ) + 1,
          cast.originZ
        ),
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
    setInputEnabled(enabled) {
      inputSystem.setEnabled(enabled);
    },
  };

  return game;
}
