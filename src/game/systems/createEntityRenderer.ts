import * as THREE from 'three';
import type { CollisionBody } from '../physics/resolveCollisions';
import { disposeEnemyModel, type EnemyModel } from '../entities/createEnemyModel';

export type GetGroundHeight = (x: number, z: number, maxSurfaceY?: number) => number;

/** Floats the amount a row's health just fell — the number is server-driven. */
export type HealthDropReporter = (worldPosition: THREE.Vector3, amount: number) => void;

/**
 * One unit's live attack, as the client sees it: the phase comes straight from
 * the unit_attack row state and the progress is re-derived from the ROW's micros
 * (arrival-anchored, same model as the telegraph) — never a client-local timer.
 */
export interface AttackAnimationView {
  attackId: string;
  phase: 'windup' | 'strike' | 'recovery';
  /** 0..1 within the current phase, client-derived from the row's micros. */
  phaseProgress: number;
  /** Where the unit was rooted when it cast (the leap's launch point). */
  castX: number;
  castZ: number;
  /** The LOCKED landing the strike resolves at — immutable once cast. */
  landingX: number;
  landingZ: number;
}

/** Per-entity locomotion + death animation, closed over its own model and parts. */
export interface EntityAnimation {
  /** One alive frame: limb swing / body bob for the given motion state. */
  animateMovement(elapsedSeconds: number, isMoving: boolean): void;
  /** Death pose for progress 0 (just died) → 1 (fully toppled and hidden). */
  animateDeath(progress: number): void;
  /**
   * OPTIONAL per-phase attack pose (ANIM-03), applied AFTER animateMovement each
   * frame while the unit has a live attack view. Kinds without attacks (camp
   * enemies today) simply omit it and compile unchanged; implementers must leave
   * the rig neutral when no view arrives (restore inside animateMovement/Death).
   */
  animateAttack?(view: AttackAnimationView): void;
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
  /**
   * Replaces the live attack views wholesale (keyed by the same id string
   * syncRows keys entities by). Entities with a view get animateAttack each
   * update; during windup they face the locked landing instead of their target.
   */
  setAttackViews(views: Map<string, AttackAnimationView>): void;
  /** Interpolates each model toward its server target and animates it. */
  update(deltaSeconds: number, getGroundHeight: GetGroundHeight): void;
  getAlivePositions(): THREE.Vector3[];
  /**
   * Visits each live entity at its DISPLAY (lerped mesh) position — for effects
   * that must track what the eye sees (footstep audio), unlike getAlivePositions'
   * authoritative aim targets. The Vector3 is the live mesh position: read, don't keep.
   */
  forEachAliveUnit(visit: (key: string, worldPosition: THREE.Vector3, row: Row) => void): void;
  /** Appends live pushable bodies (position refs) into the shared, reused array. */
  collectCollisionBodies(target: CollisionBody[]): void;
  dispose(): void;
}

/** Horizontal jump beyond which we snap instead of lerp (respawn/teleport). */
const SNAP_DISTANCE = 8;
const LERP_RATE = 10;
/** Below this per-frame move the entity reads as idle (no facing / bob). */
const MOTION_EPSILON = 0.02;
/**
 * The health bar + info overlay stays hidden until an enemy is hit, then shows
 * for this long after the LAST hit. Repeated hits during a fight keep refreshing
 * it; once the enemy disengages or drifts back to its camp (no more hits) it
 * fades out. Alive enemies never regen server-side, so a "health < max" rule
 * would keep a wounded idle enemy's bar up forever — this recency rule matches
 * the intent instead.
 */
const OVERLAY_VISIBLE_SECONDS = 4;

interface RenderedEntity<Row> {
  model: EnemyModel;
  animation: EntityAnimation;
  collisionBody: CollisionBody;
  /** Latest synced table row — exposed through forEachAliveUnit for kind lookups. */
  row: Row;
  displayBaseGems: number;
  targetX: number;
  targetZ: number;
  lastHealth: number;
  maxHealth: number;
  carriedGems: number;
  alive: boolean;
  /** Elapsed time of the last observed health drop; drives overlay visibility. */
  lastDamagedAt: number;
  /** Elapsed time the death animation began, or null when never observed alive. */
  deathStartedAt: number | null;
}

export function createEntityRenderer<Row>(
  options: EntityRendererOptions<Row>
): EntityRenderer<Row> {
  const { scene, adapter, onHealthDrop } = options;
  const entities = new Map<string, RenderedEntity<Row>>();
  // Live attack views keyed by entity id string; replaced wholesale each refresh.
  let attackViews: Map<string, AttackAnimationView> = new Map();
  let elapsedSeconds = 0;

  function insert(row: Row): RenderedEntity<Row> {
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
      row,
      displayBaseGems: adapter.displayBaseGems(row),
      targetX,
      targetZ,
      lastHealth: adapter.readHealth(row),
      maxHealth: adapter.readMaxHealth(row),
      carriedGems: adapter.readCarriedGems(row),
      alive,
      // A freshly spawned enemy shows no bar until it is actually hit.
      lastDamagedAt: -Infinity,
      // A row first seen already dead never toppled here: backdate the start so
      // the first frame reports progress 1 — it lands finished and hidden.
      deathStartedAt: alive ? null : elapsedSeconds - adapter.deathDurationSeconds,
    };
  }

  function revive(entity: RenderedEntity<Row>) {
    entity.deathStartedAt = null;
    entity.lastDamagedAt = -Infinity; // a full-health revived enemy shows no bar
    const group = entity.model.group;
    group.visible = true;
    group.rotation.set(0, group.rotation.y, 0); // clear any death topple
    group.position.set(entity.targetX, group.position.y, entity.targetZ);
  }

  function kill(entity: RenderedEntity<Row>) {
    entity.deathStartedAt = elapsedSeconds;
    if (!adapter.onKilled) return;
    const position = entity.model.group.position;
    adapter.onKilled(position.clone().setY(position.y + 0.8));
  }

  function remove(key: string, entity: RenderedEntity<Row>) {
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
      existing.row = row;
      existing.targetX = adapter.readPositionX(row);
      existing.targetZ = adapter.readPositionZ(row);
      existing.maxHealth = adapter.readMaxHealth(row);
      existing.carriedGems = adapter.readCarriedGems(row);
      const nextHealth = adapter.readHealth(row);
      const nowAlive = adapter.readIsAlive(row);
      // A falling health bar means a hit landed — reveal the overlay and float
      // the exact server-driven drop, but only while the entity stays alive
      // (death has its own flourish).
      if (nowAlive && nextHealth < existing.lastHealth) {
        existing.lastDamagedAt = elapsedSeconds;
        if (onHealthDrop) {
          const position = existing.model.group.position;
          onHealthDrop(position.clone().setY(position.y + 1), existing.lastHealth - nextHealth);
        }
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

  function refreshOverlay(entity: RenderedEntity<Row>) {
    // Hidden until hit, then shown for a short window after the last hit.
    const recentlyHit = elapsedSeconds - entity.lastDamagedAt < OVERLAY_VISIBLE_SECONDS;
    entity.model.overlay.sprite.visible = entity.alive && recentlyHit;
    if (!entity.model.overlay.sprite.visible) return;
    entity.model.overlay.update({
      healthFraction: entity.maxHealth > 0 ? entity.lastHealth / entity.maxHealth : 0,
      carriedGems: entity.displayBaseGems + entity.carriedGems,
      aura: null,
      reaction: null,
    });
  }

  function deathProgress(entity: RenderedEntity<Row>): number {
    if (entity.deathStartedAt === null) return 1;
    return Math.min(1, (elapsedSeconds - entity.deathStartedAt) / adapter.deathDurationSeconds);
  }

  function update(deltaSeconds: number, getGroundHeight: GetGroundHeight) {
    elapsedSeconds += deltaSeconds;
    const lerpFactor = Math.min(1, deltaSeconds * LERP_RATE);
    for (const [key, entity] of entities) {
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
      const view = attackViews.get(key);
      // A winding-up unit is rooted at its cast point: instead of lerp-chasing a
      // movement target, the crouch faces the LOCKED landing it will leap to
      // (D4-12 — the aim read). Strike/recovery keep the normal travel facing.
      if (view?.phase === 'windup') {
        group.lookAt(view.landingX, group.position.y, view.landingZ);
      } else if (isMoving) {
        group.lookAt(entity.targetX, group.position.y, entity.targetZ);
      }
      entity.animation.animateMovement(elapsedSeconds, isMoving);
      if (view) entity.animation.animateAttack?.(view);
    }
  }

  return {
    syncRows,
    setAttackViews(views) {
      attackViews = views;
    },
    update,
    getAlivePositions() {
      // Return the AUTHORITATIVE server position (targetX/Z), not the lerped
      // display mesh, so the player's aim and client hit-detection agree with the
      // server's damage check. The mesh lags a moving enemy, which made shots
      // land visually but miss server-side ("hitting them but no damage").
      const positions: THREE.Vector3[] = [];
      for (const entity of entities.values()) {
        if (entity.alive) {
          positions.push(new THREE.Vector3(entity.targetX, entity.model.group.position.y, entity.targetZ));
        }
      }
      return positions;
    },
    forEachAliveUnit(visit) {
      for (const [key, entity] of entities) {
        if (entity.alive) visit(key, entity.model.group.position, entity.row);
      }
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
