import * as THREE from 'three';
import type { CollisionBody } from '../physics/resolveCollisions';
import { disposeEnemyModel, type EnemyModel } from '../entities/createEnemyModel';

export type GetGroundHeight = (x: number, z: number, maxSurfaceY?: number) => number;

/** Floats the amount a row's health just fell — the number is server-driven. */
export type HealthDropReporter = (worldPosition: THREE.Vector3, amount: number) => void;

/** Per-entity locomotion + death animation, closed over its own model and parts. */
export interface EntityAnimation {
  /** One alive frame: limb swing / body bob for the given motion state. */
  animateMovement(elapsedSeconds: number, isMoving: boolean): void;
  /** Death pose for progress 0 (just died) → 1 (fully toppled and hidden). */
  animateDeath(progress: number): void;
}

export interface SpawnedEntity {
  model: EnemyModel;
  collisionRadius: number;
  collisionMass: number;
  animation: EntityAnimation;
}

/**
 * Maps one server table row onto a rendered model. Thin and kind-specific: the
 * generic renderer owns all the reconciliation, interpolation, and death timing,
 * so enemies and goliaths share everything but these accessors and the model.
 */
export interface EntityKindAdapter<Row> {
  /** Seconds the death animation plays before the model stays hidden. */
  readonly deathDurationSeconds: number;
  readId(row: Row): bigint;
  readPositionX(row: Row): number;
  readPositionZ(row: Row): number;
  readHealth(row: Row): number;
  readMaxHealth(row: Row): number;
  readCarriedGems(row: Row): number;
  readIsAlive(row: Row): boolean;
  /** Client-computed base stipend shown in the gem pill (server owns payout). */
  displayBaseGems(row: Row): number;
  spawn(row: Row): SpawnedEntity;
  /** One-shot effect when an entity watched alive dies (e.g. a death burst). */
  onKilled?(worldPosition: THREE.Vector3): void;
}

export interface EntityRendererOptions<Row> {
  scene: THREE.Scene;
  adapter: EntityKindAdapter<Row>;
  onHealthDrop?: HealthDropReporter;
}

export interface EntityRenderer<Row> {
  /** Reconciles the live set against the latest table rows (insert/update/remove). */
  syncRows(rows: readonly Row[]): void;
  /** Interpolates each model toward its server target and animates it. */
  update(deltaSeconds: number, getGroundHeight: GetGroundHeight): void;
  getAlivePositions(): THREE.Vector3[];
  /** Appends live pushable bodies (position refs) into the shared, reused array. */
  collectCollisionBodies(target: CollisionBody[]): void;
  dispose(): void;
}

/** Horizontal jump beyond which we snap instead of lerp (respawn/teleport). */
const SNAP_DISTANCE = 8;
const LERP_RATE = 10;
/** Below this per-frame move the entity reads as idle (no facing / bob). */
const MOTION_EPSILON = 0.02;

interface RenderedEntity {
  model: EnemyModel;
  animation: EntityAnimation;
  collisionBody: CollisionBody;
  displayBaseGems: number;
  targetX: number;
  targetZ: number;
  lastHealth: number;
  maxHealth: number;
  carriedGems: number;
  alive: boolean;
  /** Elapsed time the death animation began, or null when never observed alive. */
  deathStartedAt: number | null;
}

export function createEntityRenderer<Row>(
  options: EntityRendererOptions<Row>
): EntityRenderer<Row> {
  const { scene, adapter, onHealthDrop } = options;
  const entities = new Map<string, RenderedEntity>();
  let elapsedSeconds = 0;

  function insert(row: Row): RenderedEntity {
    const spawned = adapter.spawn(row);
    scene.add(spawned.model.group);
    const targetX = adapter.readPositionX(row);
    const targetZ = adapter.readPositionZ(row);
    const alive = adapter.readIsAlive(row);
    spawned.model.group.position.set(targetX, 0, targetZ); // y placed on first update
    spawned.model.group.visible = alive;
    return {
      model: spawned.model,
      animation: spawned.animation,
      collisionBody: {
        position: spawned.model.group.position,
        radius: spawned.collisionRadius,
        mass: spawned.collisionMass,
      },
      displayBaseGems: adapter.displayBaseGems(row),
      targetX,
      targetZ,
      lastHealth: adapter.readHealth(row),
      maxHealth: adapter.readMaxHealth(row),
      carriedGems: adapter.readCarriedGems(row),
      alive,
      // A row first seen already dead never toppled here: backdate the start so
      // the first frame reports progress 1 — it lands finished and hidden.
      deathStartedAt: alive ? null : elapsedSeconds - adapter.deathDurationSeconds,
    };
  }

  function revive(entity: RenderedEntity) {
    entity.deathStartedAt = null;
    const group = entity.model.group;
    group.visible = true;
    group.rotation.set(0, group.rotation.y, 0); // clear any death topple
    group.position.set(entity.targetX, group.position.y, entity.targetZ);
  }

  function kill(entity: RenderedEntity) {
    entity.deathStartedAt = elapsedSeconds;
    if (!adapter.onKilled) return;
    const position = entity.model.group.position;
    adapter.onKilled(position.clone().setY(position.y + 0.8));
  }

  function remove(key: string, entity: RenderedEntity) {
    disposeEnemyModel(entity.model);
    scene.remove(entity.model.group);
    entities.delete(key);
  }

  function syncRows(rows: readonly Row[]) {
    const seen = new Set<string>();
    for (const row of rows) {
      const key = adapter.readId(row).toString();
      seen.add(key);
      const existing = entities.get(key);
      if (!existing) {
        entities.set(key, insert(row));
        continue;
      }
      existing.targetX = adapter.readPositionX(row);
      existing.targetZ = adapter.readPositionZ(row);
      existing.maxHealth = adapter.readMaxHealth(row);
      existing.carriedGems = adapter.readCarriedGems(row);
      const nextHealth = adapter.readHealth(row);
      const nowAlive = adapter.readIsAlive(row);
      // A falling health bar means a hit landed — float the exact server-driven
      // drop, but only while the entity stays alive (death has its own flourish).
      if (nowAlive && onHealthDrop && nextHealth < existing.lastHealth) {
        const position = existing.model.group.position;
        onHealthDrop(position.clone().setY(position.y + 1), existing.lastHealth - nextHealth);
      }
      existing.lastHealth = nextHealth;
      if (nowAlive && !existing.alive) revive(existing);
      else if (!nowAlive && existing.alive) kill(existing);
      existing.alive = nowAlive;
    }
    for (const [key, entity] of entities) {
      if (!seen.has(key)) remove(key, entity);
    }
  }

  function refreshOverlay(entity: RenderedEntity) {
    entity.model.overlay.update({
      healthFraction: entity.maxHealth > 0 ? entity.lastHealth / entity.maxHealth : 0,
      carriedGems: entity.displayBaseGems + entity.carriedGems,
      aura: null,
      reaction: null,
    });
  }

  function deathProgress(entity: RenderedEntity): number {
    if (entity.deathStartedAt === null) return 1;
    return Math.min(1, (elapsedSeconds - entity.deathStartedAt) / adapter.deathDurationSeconds);
  }

  function update(deltaSeconds: number, getGroundHeight: GetGroundHeight) {
    elapsedSeconds += deltaSeconds;
    const lerpFactor = Math.min(1, deltaSeconds * LERP_RATE);
    for (const entity of entities.values()) {
      refreshOverlay(entity);
      if (!entity.alive) {
        entity.animation.animateDeath(deathProgress(entity));
        continue;
      }
      const group = entity.model.group;
      const deltaX = entity.targetX - group.position.x;
      const deltaZ = entity.targetZ - group.position.z;
      const horizontalGap = Math.hypot(deltaX, deltaZ);
      if (horizontalGap > SNAP_DISTANCE) {
        group.position.x = entity.targetX;
        group.position.z = entity.targetZ;
      } else {
        group.position.x += deltaX * lerpFactor;
        group.position.z += deltaZ * lerpFactor;
      }
      group.position.y = getGroundHeight(group.position.x, group.position.z);
      const isMoving = horizontalGap > MOTION_EPSILON;
      if (isMoving) group.lookAt(entity.targetX, group.position.y, entity.targetZ);
      entity.animation.animateMovement(elapsedSeconds, isMoving);
    }
  }

  return {
    syncRows,
    update,
    getAlivePositions() {
      const positions: THREE.Vector3[] = [];
      for (const entity of entities.values()) {
        if (entity.alive) positions.push(entity.model.group.position);
      }
      return positions;
    },
    collectCollisionBodies(target) {
      for (const entity of entities.values()) {
        if (entity.alive) target.push(entity.collisionBody);
      }
    },
    dispose() {
      for (const entity of entities.values()) {
        disposeEnemyModel(entity.model);
        scene.remove(entity.model.group);
      }
      entities.clear();
    },
  };
}
