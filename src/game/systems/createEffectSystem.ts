import * as THREE from 'three';
import { ELEMENTS, type ElementId } from '../data/elements';
import type { SkillDefinition } from '../data/characters';
import type { DamageKind } from '../combat/damageKind';
import type { LightPool } from './createLightPool';

/** Applies damage around a point; returns true when something was hit. */
export type DamageApplier = (
  center: { x: number; y: number; z: number },
  radius: number,
  damage: number,
  element: ElementId,
  kind: DamageKind
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
  /** Combo-scaled damage boost applied to every tick of the skill. */
  damageMultiplier?: number;
  followPosition?: () => THREE.Vector3;
}

const SKILL_DAMAGE_KIND: DamageKind = 'skill';

function skillDamage(options: SkillEffectOptions): number {
  return options.skill.damage * (options.damageMultiplier ?? 1);
}

export interface EffectSystem {
  update(deltaSeconds: number): void;
  spawnBurst(position: THREE.Vector3, color: number, particleCount?: number): void;
  /** A few pixel motes that drift up slowly and fade — a gentle, slow-burn glint. */
  spawnSparkle(position: THREE.Vector3, color: number, particleCount?: number): void;
  spawnProjectile(options: {
    origin: THREE.Vector3;
    direction: { x: number; z: number };
    speed: number;
    damage: number;
    element: ElementId;
    hitRadius: number;
    applyDamage: DamageApplier | null;
    damageKind: DamageKind;
  }): void;
  spawnMeleeSlash(position: THREE.Vector3, facingAngle: number, color: number): void;
  /** Ground shockwave: a flat ring expanding from the point out to radius. */
  spawnShockwave(position: THREE.Vector3, radius: number, color: number): void;
  spawnSkillEffect(options: SkillEffectOptions): void;
  dispose(): void;
}

// Seconds a visual projectile flies before it despawns. Exported so the ranged
// hitscan reducer can be fired with the projectile's real max travel distance.
export const PROJECTILE_LIFETIME_SECONDS = 2.5;
const RING_TICK_SECONDS = 0.5;

const BURST_POINT_SIZE = 0.28;
const SPARKLE_POINT_SIZE = 0.22;

export function createEffectSystem(
  scene: THREE.Scene,
  /** Ground-influence stamp — flying projectiles part the grass beneath them. */
  stampGround?: (x: number, z: number, radius: number, strength: number, dirX?: number, dirZ?: number) => void,
  /** Pooled point lights — projectiles glow and light the world around them. */
  lightPool?: LightPool
): EffectSystem {
  const activeEffects: ActiveEffect[] = [];

  // Pooled materials + shared static geometries: creating fresh ones per
  // burst/ring/slash made three re-resolve shader programs constantly —
  // getParameters/getProgramCacheKey were ~15% of combat frame time.
  const materialPools = new Map<string, THREE.Material[]>();
  function acquireMaterial<T extends THREE.Material>(key: string, create: () => T): T {
    const reused = materialPools.get(key)?.pop() as T | undefined;
    if (reused) return reused;
    const material = create();
    material.userData.poolKey = key;
    return material;
  }
  function releaseMaterial(material: THREE.Material) {
    const key = material.userData.poolKey as string | undefined;
    if (!key) {
      material.dispose();
      return;
    }
    let pool = materialPools.get(key);
    if (!pool) {
      pool = [];
      materialPools.set(key, pool);
    }
    if (pool.length < 24) pool.push(material);
    else material.dispose();
  }
  function markShared(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    geometry.userData.shared = true;
    return geometry;
  }

  // Static geometries reused across every spawn of their effect type.
  const ringGeometry = markShared(new THREE.RingGeometry(0.4, 0.9, 32));
  const slashGeometry = markShared(new THREE.RingGeometry(0.9, 1.5, 16, 1, 0, Math.PI * 0.8));
  const projectileGeometry = markShared(new THREE.OctahedronGeometry(0.22));
  const torusGeometries = new Map<number, THREE.BufferGeometry>();
  function torusGeometryFor(radius: number): THREE.BufferGeometry {
    let geometry = torusGeometries.get(radius);
    if (!geometry) {
      geometry = markShared(new THREE.TorusGeometry(radius, 0.12, 8, 32));
      torusGeometries.set(radius, geometry);
    }
    return geometry;
  }

  function createBurstPoints(color: number, particleCount: number, size: number): THREE.Points {
    const positions = new Float32Array(particleCount * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = acquireMaterial(
      `points:${color}:${size}`,
      () =>
        new THREE.PointsMaterial({
          color,
          size,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
    );
    material.opacity = 1;
    return new THREE.Points(geometry, material);
  }

  function addEffect(effect: ActiveEffect) {
    scene.add(effect.object);
    activeEffects.push(effect);
  }

  function removeEffect(effect: ActiveEffect) {
    scene.remove(effect.object);
    effect.object.traverse(node => {
      const renderable = node as THREE.Mesh;
      if (!renderable.geometry) return;
      if (!renderable.geometry.userData.shared) renderable.geometry.dispose();
      releaseMaterial(renderable.material as THREE.Material);
    });
  }

  function spawnBurst(position: THREE.Vector3, color: number, particleCount = 18) {
    const points = createBurstPoints(color, particleCount, BURST_POINT_SIZE);
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

  // A slow, gentle sparkle: a handful of pixel motes that rise a little and fade
  // over ~1.4s. Chunky point size keeps it reading as pixels, not smoke.
  function spawnSparkle(position: THREE.Vector3, color: number, particleCount = 5) {
    const points = createBurstPoints(color, particleCount, SPARKLE_POINT_SIZE);
    points.position.copy(position);
    const velocities = Array.from({ length: particleCount }, () =>
      new THREE.Vector3(
        (Math.random() - 0.5) * 0.9,
        0.4 + Math.random() * 0.7,
        (Math.random() - 0.5) * 0.9
      )
    );
    const lifetimeSeconds = 1.4;
    let ageSeconds = 0;
    addEffect({
      object: points,
      update(deltaSeconds) {
        ageSeconds += deltaSeconds;
        const positionAttribute = points.geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let particleIndex = 0; particleIndex < particleCount; particleIndex++) {
          const velocity = velocities[particleIndex];
          velocity.y -= 0.4 * deltaSeconds; // faint gravity so motes hang, then settle
          positionAttribute.setXYZ(
            particleIndex,
            positionAttribute.getX(particleIndex) + velocity.x * deltaSeconds,
            positionAttribute.getY(particleIndex) + velocity.y * deltaSeconds,
            positionAttribute.getZ(particleIndex) + velocity.z * deltaSeconds
          );
        }
        positionAttribute.needsUpdate = true;
        // Ease-out fade so it lingers dim near the end (the "slow burn").
        const progress = ageSeconds / lifetimeSeconds;
        (points.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - progress * progress);
        return ageSeconds < lifetimeSeconds;
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
    damageKind: DamageKind;
  }) {
    const elementColor = ELEMENTS[options.element].color;
    const projectile = new THREE.Mesh(
      projectileGeometry,
      acquireMaterial(
        `projectile:${elementColor}`,
        () => new THREE.MeshBasicMaterial({ color: elementColor })
      )
    );
    projectile.position.copy(options.origin);
    projectile.position.y = Math.max(projectile.position.y, 1.1);
    const velocity = new THREE.Vector3(options.direction.x, 0, options.direction.z)
      .normalize()
      .multiplyScalar(options.speed);
    let ageSeconds = 0;
    // First 4 concurrent projectiles glow; pool exhaustion degrades to no light.
    const pooledLight = lightPool?.acquire(elementColor) ?? null;
    addEffect({
      object: projectile,
      update(deltaSeconds) {
        ageSeconds += deltaSeconds;
        projectile.position.addScaledVector(velocity, deltaSeconds);
        projectile.rotation.y += deltaSeconds * 10;
        stampGround?.(projectile.position.x, projectile.position.z, 0.5, 0.35, velocity.x, velocity.z);
        pooledLight?.light.position.copy(projectile.position).setY(projectile.position.y + 0.4);
        const hitSomething = options.applyDamage?.(
          projectile.position,
          options.hitRadius,
          options.damage,
          options.element,
          options.damageKind
        );
        const alive = !hitSomething && ageSeconds < PROJECTILE_LIFETIME_SECONDS;
        if (!alive && pooledLight) lightPool?.release(pooledLight);
        if (hitSomething) spawnBurst(projectile.position, elementColor);
        return alive;
      },
    });
  }

  // Shared ground-ring visual: expands from the point out to radius, fading out.
  // Used by nova skills and the slam shockwave.
  function spawnExpandingRing(
    x: number,
    y: number,
    z: number,
    radius: number,
    color: number,
    expandSeconds: number
  ) {
    const ring = new THREE.Mesh(
      ringGeometry,
      acquireMaterial(
        `ring:${color}`,
        () =>
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
          })
      )
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, y, z);
    let ageSeconds = 0;
    addEffect({
      object: ring,
      update(deltaSeconds) {
        ageSeconds += deltaSeconds;
        const progress = Math.min(1, ageSeconds / expandSeconds);
        ring.scale.setScalar(1 + progress * radius);
        (ring.material as THREE.MeshBasicMaterial).opacity = 1 - progress;
        return progress < 1;
      },
    });
  }

  function spawnNova(options: SkillEffectOptions) {
    const elementColor = ELEMENTS[options.element].color;
    options.applyDamage?.(
      options.origin,
      options.skill.radius,
      skillDamage(options),
      options.element,
      SKILL_DAMAGE_KIND
    );
    spawnBurst(options.origin, elementColor, 26);
    spawnExpandingRing(
      options.origin.x,
      options.origin.y - 0.85,
      options.origin.z,
      options.skill.radius,
      elementColor,
      0.45
    );
  }

  // Slam impact shockwave (04-07 playtest ask): two staggered rings racing out
  // from the landing center read as a wave, not a fading circle.
  function spawnShockwave(position: THREE.Vector3, radius: number, color: number) {
    spawnExpandingRing(position.x, position.y, position.z, radius, color, 0.35);
    spawnExpandingRing(position.x, position.y, position.z, radius * 0.7, 0xffffff, 0.5);
  }

  function spawnDamageRing(options: SkillEffectOptions) {
    const elementColor = ELEMENTS[options.element].color;
    const torusMaterial = acquireMaterial(
      `torus:${elementColor}`,
      () => new THREE.MeshBasicMaterial({ color: elementColor, transparent: true })
    );
    torusMaterial.opacity = 0.85;
    const torus = new THREE.Mesh(torusGeometryFor(options.skill.radius), torusMaterial);
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
            skillDamage(options),
            options.element,
            SKILL_DAMAGE_KIND
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
        damage: skillDamage(options),
        element: options.element,
        hitRadius: options.skill.radius,
        applyDamage: options.applyDamage,
        damageKind: SKILL_DAMAGE_KIND,
      });
    }
  }

  function spawnMeleeSlash(position: THREE.Vector3, facingAngle: number, color: number) {
    const slash = new THREE.Mesh(
      slashGeometry,
      acquireMaterial(
        `slash:${color}`,
        () =>
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
          })
      )
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
        damage: skillDamage(options),
        element: options.element,
        hitRadius: options.skill.radius,
        applyDamage: options.applyDamage,
        damageKind: SKILL_DAMAGE_KIND,
      });
    }
    // 'dash' movement is handled by the caster; show the impact visuals here.
    spawnBurst(options.origin, ELEMENTS[options.element].color, 24);
    options.applyDamage?.(
      options.origin,
      options.skill.radius,
      skillDamage(options),
      options.element,
      SKILL_DAMAGE_KIND
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
    spawnSparkle,
    spawnProjectile,
    spawnMeleeSlash,
    spawnShockwave,
    spawnSkillEffect,
    dispose() {
      for (const effect of activeEffects) removeEffect(effect);
      activeEffects.length = 0;
      for (const pool of materialPools.values()) for (const material of pool) material.dispose();
      materialPools.clear();
      ringGeometry.dispose();
      slashGeometry.dispose();
      projectileGeometry.dispose();
      for (const geometry of torusGeometries.values()) geometry.dispose();
      torusGeometries.clear();
    },
  };
}
