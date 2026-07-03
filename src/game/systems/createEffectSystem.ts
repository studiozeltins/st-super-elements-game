import * as THREE from 'three';
import { ELEMENTS, type ElementId } from '../data/elements';
import type { SkillDefinition } from '../data/characters';
import { disposeObject } from '../engine/disposeObject';

/** Applies damage around a point; returns true when something was hit. */
export type DamageApplier = (
  center: { x: number; y: number; z: number },
  radius: number,
  damage: number,
  element: ElementId
) => boolean;

interface ActiveEffect {
  update(deltaSeconds: number): boolean;
  object: THREE.Object3D;
}

export interface SkillEffectOptions {
  skill: SkillDefinition;
  element: ElementId;
  origin: THREE.Vector3;
  direction: { x: number; z: number };
  applyDamage: DamageApplier | null;
  followPosition?: () => THREE.Vector3;
}

export interface EffectSystem {
  update(deltaSeconds: number): void;
  spawnBurst(position: THREE.Vector3, color: number, particleCount?: number): void;
  spawnProjectile(options: {
    origin: THREE.Vector3;
    direction: { x: number; z: number };
    speed: number;
    damage: number;
    element: ElementId;
    hitRadius: number;
    applyDamage: DamageApplier | null;
  }): void;
  spawnMeleeSlash(position: THREE.Vector3, facingAngle: number, color: number): void;
  spawnSkillEffect(options: SkillEffectOptions): void;
  dispose(): void;
}

const PROJECTILE_LIFETIME_SECONDS = 2.5;
const RING_TICK_SECONDS = 0.5;

function createBurstPoints(color: number, particleCount: number): THREE.Points {
  const positions = new Float32Array(particleCount * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color,
    size: 0.28,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  return new THREE.Points(geometry, material);
}

export function createEffectSystem(scene: THREE.Scene): EffectSystem {
  const activeEffects: ActiveEffect[] = [];

  function addEffect(effect: ActiveEffect) {
    scene.add(effect.object);
    activeEffects.push(effect);
  }

  function removeEffect(effect: ActiveEffect) {
    scene.remove(effect.object);
    disposeObject(effect.object);
  }

  function spawnBurst(position: THREE.Vector3, color: number, particleCount = 18) {
    const points = createBurstPoints(color, particleCount);
    points.position.copy(position);
    const velocities = Array.from({ length: particleCount }, () =>
      new THREE.Vector3(
        (Math.random() - 0.5) * 6,
        Math.random() * 5,
        (Math.random() - 0.5) * 6
      )
    );
    let ageSeconds = 0;
    addEffect({
      object: points,
      update(deltaSeconds) {
        ageSeconds += deltaSeconds;
        const positionAttribute = points.geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let particleIndex = 0; particleIndex < particleCount; particleIndex++) {
          const velocity = velocities[particleIndex];
          velocity.y -= 9 * deltaSeconds;
          positionAttribute.setXYZ(
            particleIndex,
            positionAttribute.getX(particleIndex) + velocity.x * deltaSeconds,
            positionAttribute.getY(particleIndex) + velocity.y * deltaSeconds,
            positionAttribute.getZ(particleIndex) + velocity.z * deltaSeconds
          );
        }
        positionAttribute.needsUpdate = true;
        (points.material as THREE.PointsMaterial).opacity = 1 - ageSeconds / 0.6;
        return ageSeconds < 0.6;
      },
    });
  }

  function spawnProjectile(options: {
    origin: THREE.Vector3;
    direction: { x: number; z: number };
    speed: number;
    damage: number;
    element: ElementId;
    hitRadius: number;
    applyDamage: DamageApplier | null;
  }) {
    const elementColor = ELEMENTS[options.element].color;
    const projectile = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.22),
      new THREE.MeshBasicMaterial({ color: elementColor })
    );
    projectile.position.copy(options.origin);
    projectile.position.y = Math.max(projectile.position.y, 1.1);
    const velocity = new THREE.Vector3(options.direction.x, 0, options.direction.z)
      .normalize()
      .multiplyScalar(options.speed);
    let ageSeconds = 0;
    addEffect({
      object: projectile,
      update(deltaSeconds) {
        ageSeconds += deltaSeconds;
        projectile.position.addScaledVector(velocity, deltaSeconds);
        projectile.rotation.y += deltaSeconds * 10;
        const hitSomething = options.applyDamage?.(
          projectile.position,
          options.hitRadius,
          options.damage,
          options.element
        );
        if (hitSomething) {
          spawnBurst(projectile.position, elementColor);
          return false;
        }
        return ageSeconds < PROJECTILE_LIFETIME_SECONDS;
      },
    });
  }

  function spawnNova(options: SkillEffectOptions) {
    const elementColor = ELEMENTS[options.element].color;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.9, 32),
      new THREE.MeshBasicMaterial({
        color: elementColor,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(options.origin.x, options.origin.y - 0.85, options.origin.z);
    options.applyDamage?.(
      options.origin,
      options.skill.radius,
      options.skill.damage,
      options.element
    );
    spawnBurst(options.origin, elementColor, 26);
    let ageSeconds = 0;
    const expandSeconds = 0.45;
    addEffect({
      object: ring,
      update(deltaSeconds) {
        ageSeconds += deltaSeconds;
        const progress = Math.min(1, ageSeconds / expandSeconds);
        ring.scale.setScalar(1 + progress * options.skill.radius);
        (ring.material as THREE.MeshBasicMaterial).opacity = 1 - progress;
        return progress < 1;
      },
    });
  }

  function spawnDamageRing(options: SkillEffectOptions) {
    const elementColor = ELEMENTS[options.element].color;
    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(options.skill.radius, 0.12, 8, 32),
      new THREE.MeshBasicMaterial({ color: elementColor, transparent: true, opacity: 0.85 })
    );
    torus.rotation.x = -Math.PI / 2;
    let ageSeconds = 0;
    let nextTickSeconds = 0;
    addEffect({
      object: torus,
      update(deltaSeconds) {
        ageSeconds += deltaSeconds;
        const center = options.followPosition?.() ?? options.origin;
        torus.position.set(
          center.x,
          center.y + 0.4 + Math.sin(ageSeconds * 4) * 0.15,
          center.z
        );
        if (ageSeconds >= nextTickSeconds) {
          nextTickSeconds += RING_TICK_SECONDS;
          options.applyDamage?.(
            { x: center.x, y: center.y + 1, z: center.z },
            options.skill.radius,
            options.skill.damage,
            options.element
          );
        }
        return ageSeconds < options.skill.durationSeconds;
      },
    });
  }

  function spawnVolley(options: SkillEffectOptions) {
    const spreadRadians = 0.5;
    const baseAngle = Math.atan2(options.direction.x, options.direction.z);
    const count = options.skill.projectileCount;
    for (let projectileIndex = 0; projectileIndex < count; projectileIndex++) {
      const angleOffset = count === 1 ? 0 : (projectileIndex / (count - 1) - 0.5) * spreadRadians * 2;
      const angle = baseAngle + angleOffset;
      spawnProjectile({
        origin: options.origin,
        direction: { x: Math.sin(angle), z: Math.cos(angle) },
        speed: options.skill.projectileSpeed,
        damage: options.skill.damage,
        element: options.element,
        hitRadius: options.skill.radius,
        applyDamage: options.applyDamage,
      });
    }
  }

  function spawnMeleeSlash(position: THREE.Vector3, facingAngle: number, color: number) {
    const slash = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.5, 16, 1, 0, Math.PI * 0.8),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    slash.rotation.x = -Math.PI / 2;
    slash.rotation.z = facingAngle - Math.PI * 0.4;
    slash.position.set(position.x, 1, position.z);
    let ageSeconds = 0;
    addEffect({
      object: slash,
      update(deltaSeconds) {
        ageSeconds += deltaSeconds;
        slash.scale.setScalar(1 + ageSeconds * 3);
        (slash.material as THREE.MeshBasicMaterial).opacity = 1 - ageSeconds / 0.25;
        return ageSeconds < 0.25;
      },
    });
  }

  function spawnSkillEffect(options: SkillEffectOptions) {
    if (options.skill.kind === 'nova') return spawnNova(options);
    if (options.skill.kind === 'ring') return spawnDamageRing(options);
    if (options.skill.kind === 'volley') return spawnVolley(options);
    if (options.skill.kind === 'projectile') {
      return spawnProjectile({
        origin: options.origin,
        direction: options.direction,
        speed: options.skill.projectileSpeed,
        damage: options.skill.damage,
        element: options.element,
        hitRadius: options.skill.radius,
        applyDamage: options.applyDamage,
      });
    }
    // 'dash' movement is handled by the caster; show the impact visuals here.
    spawnBurst(options.origin, ELEMENTS[options.element].color, 24);
    options.applyDamage?.(
      options.origin,
      options.skill.radius,
      options.skill.damage,
      options.element
    );
  }

  return {
    update(deltaSeconds) {
      for (let effectIndex = activeEffects.length - 1; effectIndex >= 0; effectIndex--) {
        const effect = activeEffects[effectIndex];
        if (effect.update(deltaSeconds)) continue;
        removeEffect(effect);
        activeEffects.splice(effectIndex, 1);
      }
    },
    spawnBurst,
    spawnProjectile,
    spawnMeleeSlash,
    spawnSkillEffect,
    dispose() {
      for (const effect of activeEffects) removeEffect(effect);
      activeEffects.length = 0;
    },
  };
}
