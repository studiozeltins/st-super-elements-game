import * as THREE from 'three';

/**
 * Pooled dynamic point lights for projectiles.
 *
 * IMPORTANT: all lights are added to the scene at startup with intensity 0 and
 * are NEVER removed — three.js recompiles every lit material's shader whenever
 * the scene's light COUNT changes, so acquire/release only toggles intensity.
 * Do not add/remove pool lights dynamically.
 */
export interface PooledLight {
  readonly light: THREE.PointLight;
}

export interface LightPool {
  /** Null when every light is busy — callers degrade gracefully (no glow). */
  acquire(color: number): PooledLight | null;
  release(pooled: PooledLight): void;
  dispose(): void;
}

const POOL_SIZE = 4;
const LIGHT_INTENSITY = 2.2;
const LIGHT_DISTANCE = 7;

export function createLightPool(scene: THREE.Scene, size = POOL_SIZE): LightPool {
  const entries = Array.from({ length: size }, () => {
    const light = new THREE.PointLight(0xffffff, 0, LIGHT_DISTANCE, 2);
    light.castShadow = false;
    // All camera layers: a pass that culls lights flips the lights-state hash
    // and re-inits every lit material per frame (see createLighting).
    light.layers.enableAll();
    scene.add(light);
    return { pooled: { light } as PooledLight, busy: false };
  });

  return {
    acquire(color) {
      const free = entries.find(entry => !entry.busy);
      if (!free) return null;
      free.busy = true;
      free.pooled.light.color.setHex(color);
      free.pooled.light.intensity = LIGHT_INTENSITY;
      return free.pooled;
    },
    release(pooled) {
      const entry = entries.find(candidate => candidate.pooled === pooled);
      if (!entry) return;
      entry.busy = false;
      entry.pooled.light.intensity = 0;
    },
    dispose() {
      for (const entry of entries) {
        scene.remove(entry.pooled.light);
        entry.pooled.light.dispose();
      }
    },
  };
}
