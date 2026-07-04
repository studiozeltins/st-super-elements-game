import * as THREE from 'three';
import { GOLIATH_ARCHETYPES_BY_SIZE, type GoliathArchetype } from '../data/goliathArchetypes';
import { createGoliathModel } from '../entities/createGoliathModel';
import type { EnemyModel } from '../entities/createEnemyModel';
import type { Goliath } from '../../module_bindings/types';
import {
  createEntityRenderer,
  type EntityAnimation,
  type EntityKindAdapter,
  type EntityRenderer,
  type HealthDropReporter,
} from './createEntityRenderer';

// A goliath topples sideways over this window before it stays hidden.
const GOLIATH_DEATH_DURATION_SECONDS = 1.1;
const GOLIATH_MASS = 9;

function resolveArchetype(sizeIndex: number): GoliathArchetype {
  return GOLIATH_ARCHETYPES_BY_SIZE[sizeIndex] ?? GOLIATH_ARCHETYPES_BY_SIZE[0];
}

function createGoliathAnimation(model: EnemyModel): EntityAnimation {
  const baseBodyY = model.body.position.y;
  const leftLeg = model.group.getObjectByName('leftLeg') ?? null;
  const rightLeg = model.group.getObjectByName('rightLeg') ?? null;
  const leftArm = model.group.getObjectByName('leftArm') ?? null;
  const rightArm = model.group.getObjectByName('rightArm') ?? null;
  return {
    animateMovement(elapsedSeconds, isMoving) {
      const walk = elapsedSeconds * 6;
      const legSwing = isMoving ? Math.sin(walk) * 0.5 : 0;
      if (leftLeg) leftLeg.rotation.x = legSwing;
      if (rightLeg) rightLeg.rotation.x = -legSwing;
      // Arms counter-swing the legs so the stride reads as a heavy march.
      if (rightArm) rightArm.rotation.x = -legSwing;
      if (leftArm) leftArm.rotation.x = legSwing;
      model.body.position.y = baseBodyY + (isMoving ? Math.abs(Math.sin(walk)) * 0.12 : 0);
    },
    animateDeath(progress) {
      model.group.rotation.z = progress * (Math.PI / 2); // topple sideways
      model.group.visible = progress < 1;
    },
  };
}

/** Renders the server-authoritative goliath raiders from the `goliath` table rows. */
export function createGoliathRenderer(
  scene: THREE.Scene,
  onHealthDrop: HealthDropReporter
): EntityRenderer<Goliath> {
  const adapter: EntityKindAdapter<Goliath> = {
    deathDurationSeconds: GOLIATH_DEATH_DURATION_SECONDS,
    readId: row => row.goliathId,
    readPositionX: row => row.positionX,
    readPositionZ: row => row.positionZ,
    readHealth: row => row.health,
    readMaxHealth: row => row.maxHealth,
    readCarriedGems: row => row.carriedGems,
    readIsAlive: row => row.alive,
    displayBaseGems: row => resolveArchetype(row.sizeIndex).baseGems,
    spawn: row => {
      const archetype = resolveArchetype(row.sizeIndex);
      const model = createGoliathModel(archetype);
      return {
        model,
        collisionRadius: archetype.collisionRadius,
        collisionMass: GOLIATH_MASS * archetype.modelScale,
        animation: createGoliathAnimation(model),
      };
    },
  };
  return createEntityRenderer({ scene, adapter, onHealthDrop });
}
