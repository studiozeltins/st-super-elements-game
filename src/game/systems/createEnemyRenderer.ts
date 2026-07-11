import * as THREE from 'three';
import type { EffectSystem } from './createEffectSystem';
import {
  BOSS_MASS_MULTIPLIER,
  BOSS_SCALE,
  ENEMY_ARCHETYPES,
  type EnemyArchetype,
  type EnemyArchetypeId,
} from '../data/enemyArchetypes';
import { regularEnemyBaseGems } from '../data/gemRewards';
import { hopProgress, isAirborne, isSlimeArchetype } from '../data/slimeHop';
import { createEnemyModel, type EnemyModel } from '../entities/createEnemyModel';
import type { Enemy } from '../../module_bindings/types';
import {
  createEntityRenderer,
  type EntityAnimation,
  type EntityKindAdapter,
  type EntityRenderer,
} from './createEntityRenderer';

// Camp enemies wink out instantly on death (the burst is the only flourish), so
// the death animation is effectively a single hidden frame.
const ENEMY_DEATH_DURATION_SECONDS = 0.001;

// Slime hop bounce (render-only; TIMING comes from the row's hop micros via the
// slimeHop parity mirror — never a free-running client timer).
/** Peak of the hop's parabolic arc, in world units. */
const HOP_ARC_HEIGHT = 0.9;
/** Airborne squash-and-stretch: tall/thin while launching and falling fast. */
const HOP_STRETCH_SCALE_Y = 1.15;
const HOP_STRETCH_SCALE_XZ = 0.9;
/** Landing squash: flat/wide pancake held briefly, then eased back to neutral. */
const HOP_SQUASH_SCALE_Y = 0.75;
const HOP_SQUASH_SCALE_XZ = 1.2;
const HOP_SQUASH_HOLD_MS = 120;
const HOP_SQUASH_EASE_MS = 160;

/** Vertical bob per archetype locomotion, matching the pre-server enemy feel. */
function locomotionBob(
  archetype: EnemyArchetype,
  elapsedSeconds: number,
  isMoving: boolean
): number {
  if (archetype.locomotion === 'float') return Math.sin(elapsedSeconds * 3) * 0.25;
  // Hoppers (slimes) get NO walk bob: their only vertical motion is the real
  // server hop arc (animateFromRow) — a grounded slime sits perfectly still.
  if (!isMoving || archetype.locomotion === 'hop') return 0;
  return Math.abs(Math.sin(elapsedSeconds * 4)) * 0.08; // stomp
}

function resolveArchetype(archetypeId: string): EnemyArchetype {
  return ENEMY_ARCHETYPES[archetypeId as EnemyArchetypeId] ?? ENEMY_ARCHETYPES.slime;
}

/**
 * Slime hop bounce riding the row's hop columns. The server clock is anchored
 * the first frame a NEW hop is observed (same arrival-anchoring model as
 * createAttackViewClock: the row is written at hop start, so its arrival pins
 * serverNow ≈ hopStartedAt); each frame re-derives serverNow from that anchor +
 * performance.now(), never a free-running timer.
 */
function createSlimeHopPose(rig: THREE.Group) {
  let anchoredHopStart = -1n;
  let anchorPerfMs = 0;
  let wasAirborne = false;
  let landedAtPerfMs = -Infinity;

  function applyScale(scaleY: number, scaleXZ: number) {
    rig.scale.set(scaleXZ, scaleY, scaleXZ);
  }

  return (row: Enemy) => {
    const perfNow = performance.now();
    if (row.hopDurationMicros !== 0n && row.hopStartedAtMicros !== anchoredHopStart) {
      anchoredHopStart = row.hopStartedAtMicros;
      anchorPerfMs = perfNow;
    }
    const nowMicros = anchoredHopStart + BigInt(Math.round((perfNow - anchorPerfMs) * 1000));
    if (isAirborne(nowMicros, row.hopStartedAtMicros, row.hopDurationMicros)) {
      const progress = hopProgress(nowMicros, row.hopStartedAtMicros, row.hopDurationMicros);
      rig.position.y = Math.sin(progress * Math.PI) * HOP_ARC_HEIGHT;
      // |cos| = vertical speed: full stretch at launch and right before landing,
      // round at the apex — the classic bounce silhouette.
      const stretch = Math.abs(Math.cos(progress * Math.PI));
      applyScale(
        THREE.MathUtils.lerp(1, HOP_STRETCH_SCALE_Y, stretch),
        THREE.MathUtils.lerp(1, HOP_STRETCH_SCALE_XZ, stretch)
      );
      wasAirborne = true;
      return;
    }
    rig.position.y = 0;
    if (wasAirborne) {
      wasAirborne = false;
      landedAtPerfMs = perfNow;
    }
    // Landing squash: held flat for a beat, then eased back up to neutral.
    const sinceLanding = perfNow - landedAtPerfMs;
    const squash =
      sinceLanding < HOP_SQUASH_HOLD_MS
        ? 1
        : Math.max(0, 1 - (sinceLanding - HOP_SQUASH_HOLD_MS) / HOP_SQUASH_EASE_MS);
    applyScale(
      THREE.MathUtils.lerp(1, HOP_SQUASH_SCALE_Y, squash),
      THREE.MathUtils.lerp(1, HOP_SQUASH_SCALE_XZ, squash)
    );
  };
}

function createEnemyAnimation(
  model: EnemyModel,
  archetype: EnemyArchetype
): EntityAnimation<Enemy> {
  const baseBodyY = model.body.position.y;
  return {
    animateMovement(elapsedSeconds, isMoving) {
      model.body.position.y = baseBodyY + locomotionBob(archetype, elapsedSeconds, isMoving);
    },
    // Slimes bounce on the REAL server hop; other archetypes have no row pose,
    // so they skip the per-frame hop math entirely.
    animateFromRow:
      isSlimeArchetype(archetype.id) && model.rig ? createSlimeHopPose(model.rig) : undefined,
    animateDeath() {
      model.group.visible = false;
    },
  };
}

/** Renders the server-authoritative camp enemies from the `enemy` table rows. */
export function createEnemyRenderer(
  scene: THREE.Scene,
  effectSystem: EffectSystem
): EntityRenderer<Enemy> {
  const adapter: EntityKindAdapter<Enemy> = {
    deathDurationSeconds: ENEMY_DEATH_DURATION_SECONDS,
    readId: row => row.enemyId,
    readPositionX: row => row.positionX,
    readPositionZ: row => row.positionZ,
    readHealth: row => row.health,
    readMaxHealth: row => row.maxHealth,
    readCarriedGems: row => row.carriedGems,
    readIsAlive: row => row.alive,
    displayBaseGems: row => regularEnemyBaseGems(row.rewardTier, row.isBoss),
    spawn: row => {
      const archetype = resolveArchetype(row.archetypeId);
      const scale = row.isBoss ? BOSS_SCALE : 1;
      const model = createEnemyModel(archetype, scale);
      return {
        model,
        collisionRadius: archetype.collisionRadius * scale,
        collisionMass: archetype.mass * (row.isBoss ? BOSS_MASS_MULTIPLIER : 1),
        animation: createEnemyAnimation(model, archetype),
      };
    },
    onKilled: worldPosition => effectSystem.spawnBurst(worldPosition, 0xffffff, 26),
  };
  return createEntityRenderer({ scene, adapter });
}
