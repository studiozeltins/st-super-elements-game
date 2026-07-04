import * as THREE from 'three';
import { ELEMENTS, type ElementId } from '../data/elements';
import type { DamageKind } from '../combat/damageKind';
import type { CollisionBody } from '../physics/resolveCollisions';
import { createGoliathModel } from '../entities/createGoliathModel';
import { disposeEnemyModel, type EnemyModel } from '../entities/createEnemyModel';
import type { GoliathArchetype } from '../data/goliathArchetypes';
import { getCampSites } from '../world/camps';
import {
  GOLIATH_BATCH_WINDOW_MICROS,
  goliathBatchForTime,
  type GoliathSpawnDescriptor,
} from './goliathIdentity';
import {
  goliathRaidEventsInWindow,
  goliathStatesAtTime,
  type GoliathRaidEvent,
} from './goliathRaidSchedule';
import type { DamageReporter } from './createEnemySystem';

// A Goliath Raider is client-simulated with no server entity, so it must follow
// the deterministic shared-time schedule (goliathRaidSchedule) — every client
// draws the same raider at the same spot and fires the same raid events at the
// same instant, so the server dedups the duplicate payouts. Only the LOCAL
// player's fight with a goliath is allowed to diverge (the server's idempotency
// window absorbs it). This system owns the models and wires both paths.

/** The server-facing kill/raid calls the wiring injects (combo/flags bridged there). */
export interface GoliathNetworkActions {
  /**
   * A deterministic raid outcome fired identically on every client. Used for a
   * camp boss the goliath sacked (isBoss=true, isGoliath=false) and for a goliath
   * a camp felled (isGoliath=true, sizeIndex set).
   */
  sendEnemyRaidKill(
    enemyId: bigint,
    x: number,
    z: number,
    rewardTier: number,
    isBoss: boolean,
    isGoliath: boolean,
    goliathSizeIndex: number
  ): void;
  /** The local player killed a goliath — pays its size base plus vacuumed hoard. */
  sendKillEnemy(
    enemyId: bigint,
    x: number,
    z: number,
    rewardTier: number,
    comboCount: number,
    isBoss: boolean,
    isGoliath: boolean,
    goliathSizeIndex: number
  ): void;
}

/** Ground drops a goliath can vacuum into its hoard (mirrors EnemyGemField, bigint slot). */
export interface GoliathGemField {
  drops: ReadonlyArray<{ id: string; x: number; z: number; amount: number }>;
  /** Claims a drop for the goliath; false if another already took it. */
  onGrab(slotId: bigint, dropId: string): boolean;
}

export interface GoliathSystemOptions {
  scene: THREE.Scene;
  getGroundHeight: (x: number, z: number, maxSurfaceY?: number) => number;
  /** Shared wall clock as micros — the same on every client within seconds. */
  getSharedTimeMicros: () => bigint;
  getLocalPlayerPosition: () => THREE.Vector3;
  /** Current local hit combo, mirrored into the player-kill payout like enemies. */
  getComboCount: () => number;
  network: GoliathNetworkActions;
  onPlayerHit: (damage: number, isCrit: boolean) => void;
  /** Optional floating damage numbers over a struck goliath. */
  reportDamage?: DamageReporter;
}

export interface GoliathSystem {
  /** Advances the batch, fires raid events, and animates every goliath. */
  update(deltaSeconds: number, gemField: GoliathGemField): void;
  /** Feeds the server-tracked hoard per goliath slot for the carried-gem pill. */
  syncGoliathCarry(carriedBySlotId: ReadonlyMap<bigint, number>): void;
  /** Same signature as the enemy system so player attacks hit goliaths too. */
  applyDamageInRadius(
    center: { x: number; y: number; z: number },
    radius: number,
    damage: number,
    element: ElementId,
    kind: DamageKind
  ): boolean;
  getAlivePositions(): THREE.Vector3[];
  collectCollisionBodies(target: CollisionBody[]): void;
  dispose(): void;
}

// A goliath ignores the player until struck, then trades blows on this cadence.
const GOLIATH_CONTACT_COOLDOWN_SECONDS = 1.1;
const GOLIATH_CONTACT_REACH = 1.2;
// The largest raider's blow lands as a wider splash even out of melee.
const GOLIATH_SPLASH_EXTRA_REACH = 2.6;
const GOLIATH_CRIT_CHANCE = 0.25;
const GOLIATH_CRIT_MULTIPLIER = 1.8;
// Far wider than the enemy 1.7 — a roaming goliath sweeps open-field spills.
const GOLIATH_GEM_VACUUM_RANGE = 5;
const GOLIATH_DEATH_SECONDS = 1.1;
const GOLIATH_MASS = 9;
/** Attacks only connect within this vertical gap — no hitting across cliffs. */
const VERTICAL_HIT_GATE = 3;

interface GoliathParts {
  leftLeg: THREE.Object3D | null;
  rightLeg: THREE.Object3D | null;
  leftArm: THREE.Object3D | null;
  rightArm: THREE.Object3D | null;
}

interface Goliath {
  slotId: bigint;
  archetype: GoliathArchetype;
  model: EnemyModel;
  parts: GoliathParts;
  collisionBody: CollisionBody;
  baseBodyY: number;
  maxHealth: number;
  /** Cumulative LOCAL player damage — separate from the deterministic schedule. */
  localDamageTaken: number;
  /** Latest scheduled attrition fraction (raid wear), refreshed each frame. */
  scheduleHealthFraction: number;
  /** The goliath only hits back once the local player has provoked it. */
  provoked: boolean;
  nextContactHitAt: number;
  carriedGems: number;
  /** Set once this client has drawn the goliath alive — gates the death topple. */
  observedAlive: boolean;
  isDefeated: boolean;
  deathStartedAt: number;
  lastX: number;
  lastZ: number;
}

// Reused per-frame scratch so animation math never allocates.
const scratchPlayerOffset = new THREE.Vector2();

export function createGoliathSystem(options: GoliathSystemOptions): GoliathSystem {
  const {
    scene,
    getGroundHeight,
    getSharedTimeMicros,
    getLocalPlayerPosition,
    getComboCount,
    network,
    onPlayerHit,
    reportDamage,
  } = options;

  const campSites = getCampSites();
  const goliaths = new Map<bigint, Goliath>();
  const carriedBySlotId = new Map<bigint, number>();
  // Slots the local player killed this window — suppress their scheduled defeat
  // so the same client never double-pays the goliath hoard (player kill + raid
  // defeat). Their raidBossKill events still fire so camps stay consistent.
  const locallyKilledSlots = new Set<bigint>();

  let elapsedSeconds = 0;
  let currentBucket = -1n;
  let lastProcessedMicros = getSharedTimeMicros();

  function spawnGoliath(descriptor: GoliathSpawnDescriptor) {
    const model = createGoliathModel(descriptor.archetype);
    scene.add(model.group);
    const goliath: Goliath = {
      slotId: descriptor.slotId,
      archetype: descriptor.archetype,
      model,
      parts: {
        leftLeg: model.group.getObjectByName('leftLeg') ?? null,
        rightLeg: model.group.getObjectByName('rightLeg') ?? null,
        leftArm: model.group.getObjectByName('leftArm') ?? null,
        rightArm: model.group.getObjectByName('rightArm') ?? null,
      },
      collisionBody: {
        position: model.group.position,
        radius: descriptor.archetype.collisionRadius,
        mass: GOLIATH_MASS * descriptor.archetype.modelScale,
      },
      baseBodyY: model.body.position.y,
      maxHealth: descriptor.archetype.maxHealth,
      localDamageTaken: 0,
      scheduleHealthFraction: 1,
      provoked: false,
      nextContactHitAt: 0,
      carriedGems: 0,
      observedAlive: false,
      isDefeated: false,
      deathStartedAt: 0,
      lastX: model.group.position.x,
      lastZ: model.group.position.z,
    };
    goliaths.set(descriptor.slotId, goliath);
  }

  function tearDownAll() {
    for (const goliath of goliaths.values()) {
      disposeEnemyModel(goliath.model);
      scene.remove(goliath.model.group);
    }
    goliaths.clear();
    locallyKilledSlots.clear();
  }

  function rebuildBatch(nowMicros: bigint) {
    tearDownAll();
    for (const descriptor of goliathBatchForTime(nowMicros)) spawnGoliath(descriptor);
    currentBucket = nowMicros / GOLIATH_BATCH_WINDOW_MICROS;
  }

  rebuildBatch(getSharedTimeMicros());

  function markDefeated(goliath: Goliath) {
    goliath.isDefeated = true;
    goliath.deathStartedAt = elapsedSeconds;
  }

  // A goliath the local client never watched alive (defeated before this client
  // began tracking it) must not replay its topple. Backdate the death start so
  // animateDeath reports progress 1 at once — it lands hidden, no visible fall.
  function snapToFinishedDeath(goliath: Goliath) {
    goliath.isDefeated = true;
    goliath.deathStartedAt = elapsedSeconds - GOLIATH_DEATH_SECONDS;
  }

  function handleRaidEvent(event: GoliathRaidEvent) {
    if (event.kind === 'raidBossKill') {
      // Deterministic on every client → the camp boss is sacked exactly once.
      network.sendEnemyRaidKill(event.bossEnemyId, event.position.x, event.position.z, event.rewardTier, true, false, 0);
      return;
    }
    // goliathDefeated: skip if the local player already killed this goliath.
    if (locallyKilledSlots.has(event.slotId)) return;
    network.sendEnemyRaidKill(event.slotId, event.position.x, event.position.z, 0, false, true, event.sizeIndex);
    const goliath = goliaths.get(event.slotId);
    if (goliath && !goliath.isDefeated) markDefeated(goliath);
  }

  function animateDeath(goliath: Goliath) {
    const progress = Math.min(1, (elapsedSeconds - goliath.deathStartedAt) / GOLIATH_DEATH_SECONDS);
    goliath.model.group.rotation.z = progress * (Math.PI / 2); // topple sideways
    goliath.model.group.position.y -= progress * 0.02;
    goliath.model.group.visible = progress < 1;
  }

  function animateLocomotion(goliath: Goliath, isMoving: boolean, isEngaging: boolean) {
    const walk = elapsedSeconds * 6;
    const legSwing = isMoving ? Math.sin(walk) * 0.5 : 0;
    if (goliath.parts.leftLeg) goliath.parts.leftLeg.rotation.x = legSwing;
    if (goliath.parts.rightLeg) goliath.parts.rightLeg.rotation.x = -legSwing;

    // Engaging → an overhead sword chop; otherwise arms counter-swing the legs.
    const rightArmSwing = isEngaging
      ? -1.4 - Math.abs(Math.sin(elapsedSeconds * 7)) * 0.9
      : -legSwing;
    if (goliath.parts.rightArm) goliath.parts.rightArm.rotation.x = rightArmSwing;
    if (goliath.parts.leftArm) goliath.parts.leftArm.rotation.x = isEngaging ? -0.3 : legSwing;

    goliath.model.body.position.y =
      goliath.baseBodyY + (isMoving ? Math.abs(Math.sin(walk)) * 0.12 : 0);
  }

  function tryContactDamage(goliath: Goliath) {
    if (!goliath.provoked || elapsedSeconds < goliath.nextContactHitAt) return;
    const player = getLocalPlayerPosition();
    const position = goliath.model.group.position;
    const reach =
      goliath.collisionBody.radius +
      GOLIATH_CONTACT_REACH +
      (goliath.archetype.splashesOnAttack ? GOLIATH_SPLASH_EXTRA_REACH : 0);
    scratchPlayerOffset.set(player.x - position.x, player.z - position.z);
    if (scratchPlayerOffset.length() > reach) return;
    if (Math.abs(position.y - player.y) > VERTICAL_HIT_GATE) return;
    goliath.nextContactHitAt = elapsedSeconds + GOLIATH_CONTACT_COOLDOWN_SECONDS;
    const isCrit = Math.random() < GOLIATH_CRIT_CHANCE;
    const damage = isCrit
      ? Math.round(goliath.archetype.contactDamage * GOLIATH_CRIT_MULTIPLIER)
      : goliath.archetype.contactDamage;
    onPlayerHit(damage, isCrit);
  }

  function vacuumGems(goliath: Goliath, gemField: GoliathGemField) {
    const position = goliath.model.group.position;
    for (const drop of gemField.drops) {
      if (Math.hypot(position.x - drop.x, position.z - drop.z) > GOLIATH_GEM_VACUUM_RANGE) continue;
      gemField.onGrab(goliath.slotId, drop.id);
    }
  }

  function shownHealthFraction(goliath: Goliath): number {
    const remaining = goliath.scheduleHealthFraction - goliath.localDamageTaken / goliath.maxHealth;
    return Math.max(0, Math.min(1, remaining));
  }

  function placeAndAnimate(
    goliath: Goliath,
    position: { x: number; z: number },
    currentTargetCampIndex: number | null,
    gemField: GoliathGemField
  ) {
    const group = goliath.model.group;
    const groundY = getGroundHeight(position.x, position.z);
    group.position.set(position.x, groundY, position.z);

    const movedX = position.x - goliath.lastX;
    const movedZ = position.z - goliath.lastZ;
    const isMoving = Math.hypot(movedX, movedZ) > 0.0005;
    if (isMoving) group.lookAt(position.x + movedX, groundY, position.z + movedZ);
    goliath.lastX = position.x;
    goliath.lastZ = position.z;

    // Engaging = standing on the target camp (not travelling toward it).
    const isEngaging =
      currentTargetCampIndex !== null &&
      Math.hypot(position.x - campSites[currentTargetCampIndex].x, position.z - campSites[currentTargetCampIndex].z) < 0.5;
    animateLocomotion(goliath, isMoving && !isEngaging, isEngaging);

    goliath.carriedGems = carriedBySlotId.get(goliath.slotId) ?? 0;
    goliath.model.overlay.update({
      healthFraction: shownHealthFraction(goliath),
      carriedGems: goliath.archetype.baseGems + goliath.carriedGems,
      aura: null,
      reaction: null,
    });

    tryContactDamage(goliath);
    vacuumGems(goliath, gemField);
  }

  return {
    update(deltaSeconds, gemField) {
      elapsedSeconds += deltaSeconds;
      const nowMicros = getSharedTimeMicros();
      const nowBucket = nowMicros / GOLIATH_BATCH_WINDOW_MICROS;
      if (nowBucket !== currentBucket) {
        rebuildBatch(nowMicros);
        // Never replay a prior window's events against the fresh batch — slot ids
        // repeat every window, so a stale goliathDefeated would fell a new raider.
        lastProcessedMicros = nowBucket * GOLIATH_BATCH_WINDOW_MICROS;
      }

      // Edge-triggered: each raid event fires exactly once, at the same shared
      // instant on every client, so duplicate payouts collapse server-side.
      for (const event of goliathRaidEventsInWindow(campSites, lastProcessedMicros, nowMicros)) {
        handleRaidEvent(event);
      }
      lastProcessedMicros = nowMicros;

      for (const state of goliathStatesAtTime(campSites, nowMicros)) {
        const goliath = goliaths.get(state.slotId);
        if (!goliath) continue;
        if (state.isDefeated && !goliath.isDefeated) {
          if (goliath.observedAlive) markDefeated(goliath);
          else snapToFinishedDeath(goliath);
        }
        if (goliath.isDefeated) {
          animateDeath(goliath);
          continue;
        }
        goliath.observedAlive = true;
        goliath.scheduleHealthFraction = state.healthFraction;
        placeAndAnimate(goliath, state.position, state.currentTargetCampIndex, gemField);
      }
    },
    syncGoliathCarry(next) {
      carriedBySlotId.clear();
      for (const [slotId, carried] of next) carriedBySlotId.set(slotId, carried);
    },
    applyDamageInRadius(center, radius, damage, element, kind) {
      let hitSomething = false;
      for (const goliath of goliaths.values()) {
        if (goliath.isDefeated) continue;
        const position = goliath.model.group.position;
        if (Math.abs(position.y + 0.9 - center.y) > VERTICAL_HIT_GATE) continue;
        const distance = Math.hypot(position.x - center.x, position.z - center.z);
        if (distance > radius + goliath.collisionBody.radius) continue;
        hitSomething = true;
        goliath.provoked = true;
        goliath.localDamageTaken += damage;
        reportDamage?.(
          position.clone().setY(position.y + goliath.archetype.modelScale * 3),
          damage,
          kind,
          ELEMENTS[element].color
        );
        // Plain damage only — the elemental reaction engine is not factored out
        // of the enemy system, so per YAGNI a goliath just takes flat hits.
        const remaining = goliath.maxHealth * goliath.scheduleHealthFraction - goliath.localDamageTaken;
        if (remaining > 0) continue;
        network.sendKillEnemy(
          goliath.slotId,
          position.x,
          position.z,
          0,
          getComboCount(),
          false,
          true,
          goliath.archetype.sizeIndex
        );
        locallyKilledSlots.add(goliath.slotId);
        markDefeated(goliath);
      }
      return hitSomething;
    },
    getAlivePositions() {
      const positions: THREE.Vector3[] = [];
      for (const goliath of goliaths.values()) {
        if (!goliath.isDefeated) positions.push(goliath.model.group.position);
      }
      return positions;
    },
    collectCollisionBodies(target) {
      for (const goliath of goliaths.values()) {
        if (!goliath.isDefeated) target.push(goliath.collisionBody);
      }
    },
    dispose() {
      tearDownAll();
    },
  };
}
