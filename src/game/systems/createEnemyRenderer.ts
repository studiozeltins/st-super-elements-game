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

/** Vertical bob per archetype locomotion, matching the pre-server enemy feel. */
function locomotionBob(
  archetype: EnemyArchetype,
  elapsedSeconds: number,
  isMoving: boolean
): number {
  if (archetype.locomotion === 'float') return Math.sin(elapsedSeconds * 3) * 0.25;
  if (!isMoving) return 0;
  if (archetype.locomotion === 'stomp') return Math.abs(Math.sin(elapsedSeconds * 4)) * 0.08;
  return Math.abs(Math.sin(elapsedSeconds * 6)) * 0.35;
}

function resolveArchetype(archetypeId: string): EnemyArchetype {
  return ENEMY_ARCHETYPES[archetypeId as EnemyArchetypeId] ?? ENEMY_ARCHETYPES.slime;
}

function createEnemyAnimation(
  model: EnemyModel,
  archetype: EnemyArchetype
): EntityAnimation {
  const baseBodyY = model.body.position.y;
  return {
    animateMovement(elapsedSeconds, isMoving) {
      model.body.position.y = baseBodyY + locomotionBob(archetype, elapsedSeconds, isMoving);
    },
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
