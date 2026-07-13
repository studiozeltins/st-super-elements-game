import * as THREE from 'three';
import { gustAt, gustEnvelope, sampleWind, windAngle } from './windMath';

/**
 * The shared wind clock — the ONE wind time source in the client. Every wind
 * consumer (grass, canopies, flags, smoke, Phase 10 audio, Phase 12
 * butterflies) reads these uniforms; `createGame.frame()` is the only caller
 * of `update()`. All math delegates to windMath, so shader GLSL (generated
 * from the same constants) and CPU sampling can never drift.
 *
 * IMPORTANT: consumers must hold the uniform OBJECTS (`timeUniform`,
 * `directionUniform`, `strengthUniform`) — their `.value` is mutated in place
 * every frame, so caching `.value` reads a stale frame forever. Wire them into
 * shaders as `shader.uniforms.uTime = wind.timeUniform` (by reference), never
 * `{ value: wind.timeUniform.value }`.
 */
export interface WindUniforms {
  /** Wind clock in seconds — advances only via update(). */
  timeUniform: { value: number };
  /** Unit wind direction (x, z) — the SAME Vector2 forever, set() in place. */
  directionUniform: { value: THREE.Vector2 };
  /** Global gust strength: 1 enabled, 0 = `?nowind` kill (D-12, no recompile). */
  strengthUniform: { value: number };
}

export interface Wind extends WindUniforms {
  /** Advance the clock + wander direction. Called ONCE per frame by createGame. */
  update(deltaSeconds: number): void;
  /** Base two-octave sway at a world position (JS mirror of the grass GLSL). */
  sampleWind(x: number, z: number): number;
  /** Traveling gust envelope 0..1 at a world position (retarded time). */
  sampleGust(x: number, z: number): number;
  /**
   * Global (un-retarded) gust envelope, 0..1 — the Phase 10 audio sidechain
   * contract: audio has no spatial position, so it reads the world-wide peak.
   */
  getGustEnvelope(): number;
}

export function createWind(enabled: boolean): Wind {
  const timeUniform = { value: 0 };
  const initialAngle = windAngle(0);
  // Constructed ONCE — update() mutates via .set(), zero per-frame allocs (D-13).
  const directionUniform = {
    value: new THREE.Vector2(Math.cos(initialAngle), Math.sin(initialAngle)),
  };
  const strengthUniform = { value: enabled ? 1 : 0 };

  return {
    timeUniform,
    directionUniform,
    strengthUniform,
    update(deltaSeconds) {
      timeUniform.value += deltaSeconds;
      const theta = windAngle(timeUniform.value);
      directionUniform.value.set(Math.cos(theta), Math.sin(theta));
    },
    sampleWind(x, z) {
      return sampleWind(timeUniform.value, x, z);
    },
    sampleGust(x, z) {
      return gustAt(timeUniform.value, x, z, directionUniform.value.x, directionUniform.value.y);
    },
    getGustEnvelope() {
      return gustEnvelope(timeUniform.value);
    },
  };
}
