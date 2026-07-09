import * as THREE from 'three';
import { GOLIATH_ARCHETYPES_BY_SIZE, type GoliathArchetype } from '../data/goliathArchetypes';
import { createGoliathModel } from '../entities/createGoliathModel';
import type { EnemyModel } from '../entities/createEnemyModel';
import type { Goliath } from '../../module_bindings/types';
import {
  createEntityRenderer,
  type AttackAnimationView,
  type EntityAnimation,
  type EntityKindAdapter,
  type EntityRenderer,
} from './createEntityRenderer';

// A goliath topples sideways over this window before it stays hidden.
const GOLIATH_DEATH_DURATION_SECONDS = 1.1;
const GOLIATH_MASS = 9;

// Attack pose tuning (D4-16) — aesthetic rig proportions only; every TIMING
// input (phase + progress) arrives via the AttackAnimationView, which createGame
// derives from the unit_attack row's own micros (never a client-local clock).
/** Peak of the leap's parabolic arc, in world units. */
const LEAP_HEIGHT = 1.5;
/** Torso Y scale at full crouch (silhouette compress). */
const CROUCH_SCALE_Y = 0.6;
/** Local height of the torso box in createGoliathModel — drives planted compress. */
const TORSO_HEIGHT = 1.5;
/** Landing-impact squash depth at the start of recovery (fraction of full crouch). */
const SETTLE_SQUASH = 0.35;
/** Travel fraction past which the leap counts as landed (impact squash gate). */
const LANDED_TRAVEL_FRACTION = 0.97;

function resolveArchetype(sizeIndex: number): GoliathArchetype {
  return GOLIATH_ARCHETYPES_BY_SIZE[sizeIndex] ?? GOLIATH_ARCHETYPES_BY_SIZE[0];
}

function createGoliathAnimation(model: EnemyModel): EntityAnimation {
  const baseBodyY = model.body.position.y;
  const leftLeg = model.group.getObjectByName('leftLeg') ?? null;
  const rightLeg = model.group.getObjectByName('rightLeg') ?? null;
  const leftArm = model.group.getObjectByName('leftArm') ?? null;
  const rightArm = model.group.getObjectByName('rightArm') ?? null;
  const head = model.group.getObjectByName('head') ?? null;
  const baseHeadY = head?.position.y ?? 0;
  const baseArmY = leftArm?.position.y ?? 0;

  /**
   * Poses the whole rig at a crouch depth 0..1: the torso compresses (scale.y)
   * with its bottom kept planted, and the head + shoulders ride the compression
   * down so the silhouette reads as one crouching body, not a squashed box.
   * Depth 0 restores every attack transform to neutral.
   */
  function applyCrouch(amount: number) {
    const scaleY = THREE.MathUtils.lerp(1, CROUCH_SCALE_Y, amount);
    const drop = TORSO_HEIGHT * (1 - scaleY); // how far the torso top came down
    model.body.scale.y = scaleY;
    model.body.position.y = baseBodyY - drop / 2; // bottom stays planted
    if (head) head.position.y = baseHeadY - drop;
    if (leftArm) leftArm.position.y = baseArmY - drop;
    if (rightArm) rightArm.position.y = baseArmY - drop;
  }

  /**
   * How far the mesh has ACTUALLY travelled from the cast point toward the
   * LOCKED landing (0 at launch, 1 on arrival). The server teleports the row to
   * the landing at strike; the mesh's existing position lerp is the horizontal
   * lunge (maxBand <= 8u keeps it under SNAP_DISTANCE), so riding this fraction
   * keeps the parabola in perfect sync with the visible travel — the arc peaks
   * mid-flight and returns to the ground exactly on arrival.
   */
  function travelFraction(view: AttackAnimationView): number {
    const total = Math.hypot(view.landingX - view.castX, view.landingZ - view.castZ);
    if (total < 0.01) return 1; // point-blank slam: nothing to travel, no arc
    const remaining = Math.hypot(
      view.landingX - model.group.position.x,
      view.landingZ - model.group.position.z
    );
    return THREE.MathUtils.clamp(1 - remaining / total, 0, 1);
  }

  return {
    animateMovement(elapsedSeconds, isMoving) {
      // Neutral attack-pose restore: animateAttack (when a view is live) runs
      // AFTER this each frame and re-poses, so a vanished view (idle row, row
      // removed) can never leave a squashed silhouette behind.
      applyCrouch(0);
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
      applyCrouch(0); // a death mid-attack must not topple a squashed mesh
      model.group.rotation.z = progress * (Math.PI / 2); // topple sideways
      model.group.visible = progress < 1;
    },
    animateAttack(view) {
      if (view.phase === 'windup') {
        // Rooted crouch, deepening as the strike nears (progress² ease-in);
        // progress is derived from the row's startedAt→strikeAt micros.
        applyCrouch(view.phaseProgress * view.phaseProgress);
        return;
      }
      const travel = travelFraction(view);
      if (view.phase === 'strike') {
        // Spring out of the crouch at launch, arc over the actual lunge. The
        // group's Y was set to ground height this frame before animations ran,
        // so the offset never accumulates across frames.
        applyCrouch(1 - THREE.MathUtils.clamp(travel * 3, 0, 1));
        model.group.position.y += Math.sin(travel * Math.PI) * LEAP_HEIGHT;
        return;
      }
      // Recovery: finish any airborne remainder of the arc (it fades with the
      // settle so progress 1 is exactly neutral), then a heavy impact squash
      // eases back out over the phase (recovery-arrival → recoveryEndsAtMicros).
      const settle = 1 - (1 - view.phaseProgress) * (1 - view.phaseProgress);
      model.group.position.y += Math.sin(travel * Math.PI) * LEAP_HEIGHT * (1 - settle);
      const landed = travel >= LANDED_TRAVEL_FRACTION;
      applyCrouch(landed ? SETTLE_SQUASH * (1 - settle) : 0);
    },
  };
}

/** Renders the server-authoritative goliath raiders from the `goliath` table rows. */
export function createGoliathRenderer(scene: THREE.Scene): EntityRenderer<Goliath> {
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
  return createEntityRenderer({ scene, adapter });
}
