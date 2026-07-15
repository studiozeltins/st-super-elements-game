import * as THREE from 'three';
import type { SeededRandom } from './types';

export function lambert(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color });
}

/**
 * Adds a fresnel EDGE HIGHLIGHT to a lit material's shader: silhouette-facing
 * faces (normal grazing the view) get a bright rim, so the object pops off the
 * ground regardless of sun angle (view-based, not specular). Uses the view-space
 * normal's z — the camera looks down view -Z, so faces edge-on have normal.z≈0.
 * Call from a material's onBeforeCompile.
 */
export function addRimLight(
  shader: THREE.WebGLProgramParametersWithUniforms,
  strength = 0.45,
  power = 3
): void {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <opaque_fragment>',
    /* glsl */ `
    #include <opaque_fragment>
    {
      float _rim = pow(1.0 - clamp(normal.z, 0.0, 1.0), ${power.toFixed(1)});
      gl_FragColor.rgb += vec3(1.0) * _rim * ${strength.toFixed(2)};
    }
    `
  );
}

/**
 * Edge-lit material — a flat-shaded Lambert with the fresnel edge highlight above.
 * The rim program is shared (color is a uniform), so all edge-lit props batch to
 * one shader. For props that should read crisp against the ground (benches,
 * lantern posts, parasols).
 */
export function edgeLit(color: number, strength = 0.45): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ color, flatShading: true });
  material.onBeforeCompile = shader => addRimLight(shader, strength);
  material.customProgramCacheKey = () => `edgeLit_${strength.toFixed(2)}`;
  return material;
}

export function randomBetween(random: SeededRandom, min: number, max: number): number {
  return min + random() * (max - min);
}

export function randomIntBetween(random: SeededRandom, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

export function pickRandom<T>(random: SeededRandom, items: readonly T[]): T {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

export function tiltRandomly(
  object: THREE.Object3D,
  random: SeededRandom,
  maxRadians: number
): void {
  object.rotation.x = randomBetween(random, -maxRadians, maxRadians);
  object.rotation.z = randomBetween(random, -maxRadians, maxRadians);
  object.rotation.y = random() * Math.PI * 2;
}
