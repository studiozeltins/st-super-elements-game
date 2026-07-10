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

// swordSwing clip seeds (D5-16) — playtest-tune at the 05-05 checkpoint.
/** Sword-arm wind-back angle at full swing windup (radians, arm swept behind). */
const SWING_WINDBACK = 1.1;
/** Sword-arm follow-through past vertical at the end of the slash (radians). */
const SWING_FOLLOWTHROUGH = -1.4;
/** Torso forward lean while the slash lands (radians). */
const SWING_LEAN = 0.3;
/** Crouch depth at full swing windup (light — the swing is the quick opener). */
const SWING_CROUCH = 0.25;

// swordSwirl clip seeds (D5-16).
/** Torso counter-coil at full swirl windup (radians, wound AGAINST the spin). */
const SWIRL_COIL = 0.9;
/** Arm flare-out while the swirl spins (radians, both arms raised sideways). */
const SWIRL_ARM_FLARE = 1.15;
/** Crouch depth at full swirl windup. */
const SWIRL_CROUCH = 0.35;
/** Exhausted squash depth at the start of the swirl's long recovery. */
const SWIRL_SETTLE_SQUASH = 0.3;

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

  /**
   * Zeroes every clip transform the per-frame movement pose does NOT already
   * re-write: torso lean/yaw and the arm axes beyond the walk's rotation.x.
   * Called from BOTH animateMovement and animateDeath (Pitfall 10 / 04-05
   * contract) so an ended chain or a death mid-spin leaves a neutral rig.
   */
  function resetAttackPose() {
    model.body.rotation.x = 0;
    model.body.rotation.y = 0;
    if (leftArm) {
      leftArm.rotation.x = 0;
      leftArm.rotation.z = 0;
    }
    if (rightArm) {
      rightArm.rotation.x = 0;
      rightArm.rotation.z = 0;
    }
  }

  /** Raises both arms sideways by the given angle — the swirl's flared spin pose. */
  function setArmFlare(amount: number) {
    if (leftArm) leftArm.rotation.z = -amount;
    if (rightArm) rightArm.rotation.z = amount;
  }

  /** swordSwing (D5-16): wind-back → fast forward slash → brief settle. */
  function animateSwing(view: AttackAnimationView) {
    if (view.phase === 'windup') {
      // The sword arm winds back and up while the body sinks into a light
      // crouch — progress² ease-in mirrors the slam's telegraphed deepening.
      const wind = view.phaseProgress * view.phaseProgress;
      if (rightArm) rightArm.rotation.x = SWING_WINDBACK * wind;
      applyCrouch(SWING_CROUCH * wind);
      return;
    }
    if (view.phase === 'strike') {
      // Fast forward slash: the arm sweeps wind-back → follow-through across
      // the (short) strike phase, with a slight torso lean selling the weight.
      if (rightArm) {
        rightArm.rotation.x = THREE.MathUtils.lerp(
          SWING_WINDBACK,
          SWING_FOLLOWTHROUGH,
          view.phaseProgress
        );
      }
      model.body.rotation.x = SWING_LEAN * view.phaseProgress;
      return;
    }
    // Recovery (rarely seen — the swing chains into the swirl) eases the arm
    // and lean back to neutral so progress 1 is exactly the rest pose.
    const settle = 1 - (1 - view.phaseProgress) * (1 - view.phaseProgress);
    if (rightArm) rightArm.rotation.x = SWING_FOLLOWTHROUGH * (1 - settle);
    model.body.rotation.x = SWING_LEAN * (1 - settle);
  }

  /** swordSwirl (D5-16): torso coil → one full 360° spin → exhausted settle. */
  function animateSwirl(view: AttackAnimationView) {
    if (view.phase === 'windup') {
      // The torso coils AGAINST the coming spin while the arms flare out and
      // the body loads into a crouch. Spins model.body, NEVER the outer group
      // — the entity renderer owns group rotation via lookAt.
      const wind = view.phaseProgress * view.phaseProgress;
      model.body.rotation.y = -SWIRL_COIL * wind;
      setArmFlare(SWIRL_ARM_FLARE * wind);
      applyCrouch(SWIRL_CROUCH * wind);
      return;
    }
    if (view.phase === 'strike') {
      // One full revolution: the coil releases through 2π, so the strike ends
      // visually neutral (2π ≡ 0) and recovery never spins backwards.
      model.body.rotation.y = THREE.MathUtils.lerp(
        -SWIRL_COIL,
        Math.PI * 2,
        view.phaseProgress
      );
      setArmFlare(SWIRL_ARM_FLARE);
      return;
    }
    // Recovery: a heavy eased settle — the chain's long punish window reads
    // as exhaustion (arms drop, body sags back up from a squash).
    const settle = 1 - (1 - view.phaseProgress) * (1 - view.phaseProgress);
    model.body.rotation.y = 0;
    setArmFlare(SWIRL_ARM_FLARE * (1 - settle));
    applyCrouch(SWIRL_SETTLE_SQUASH * (1 - settle));
  }

  /** leapSlam: rooted crouch → parabolic lunge → landing squash (04-05). */
  function animateLeapSlam(view: AttackAnimationView) {
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
  }

  return {
    animateMovement(elapsedSeconds, isMoving) {
      // Neutral attack-pose restore: animateAttack (when a view is live) runs
      // AFTER this each frame and re-poses, so a vanished view (idle row, row
      // removed) can never leave a squashed silhouette behind.
      applyCrouch(0);
      resetAttackPose();
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
      resetAttackPose(); // …nor a wound-up arm / mid-spin torso (Pitfall 10)
      model.group.rotation.z = progress * (Math.PI / 2); // topple sideways
      model.group.visible = progress < 1;
    },
    animateAttack(view) {
      // Per-attack clip dispatch (ANIM-03): the view's attackId comes straight
      // from the unit_attack row; unknown ids fall back to the slam clip.
      if (view.attackId === 'swordSwing') return animateSwing(view);
      if (view.attackId === 'swordSwirl') return animateSwirl(view);
      animateLeapSlam(view);
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
