import * as THREE from 'three';
import type { WindUniforms } from '../../systems/createWind';
import { CANOPY, gustGlsl } from '../../systems/windMath';
import type { SeededRandom, WorldAsset } from './types';
import { lambert, randomBetween, randomIntBetween } from './assetHelpers';

const TRUNK_COLOR = 0x6b4a2f;
const CANOPY_ORANGE = 0xe8722f;
const CANOPY_ORANGE_DEEP = 0xd8621f;
const CANOPY_GREEN = 0x4f9147;
const CANOPY_GREEN_LIGHT = 0x58a24f;

/** GLSL float literal — raw ints break the shader compile (grass precedent). */
const f = (n: number): string => n.toFixed(4);

// The canopy factory is invoked through the world scatter table with only a
// seeded random, so wind reaches the cap materials via module-level injection:
// the world calls initCanopyWind(options.wind) once before scattering trees.
let canopyWind: WindUniforms | null = null;

// ONE patched material per canopy color (4 total) shared by every cap of every
// tree — replaces the old per-cap lambert() allocation (pool-materials rule).
// Lifetime contract: the pool belongs to the CURRENTLY injected wind. Cached
// materials may also be disposed by world.dispose() at game teardown; that is
// safe because the next game constructs a NEW wind, which forces the rebuild
// path below — the pool never hands a disposed material to a live world.
const canopyMaterials = new Map<number, THREE.MeshLambertMaterial>();

/**
 * Inject the shared wind uniforms. Must run before any canopy tree is built.
 * One pool per injected wind: re-injection with a DIFFERENT wind disposes the
 * orphaned materials and clears the pool, so the next getCanopyMaterial call
 * rebuilds against the new uniform objects (CR-02 — the world injects once per
 * game instance, so this is exactly one rebuild per game re-creation).
 * Re-injecting the SAME wind is a no-op: D-13 pooling is preserved.
 */
export function initCanopyWind(wind: WindUniforms): void {
  if (canopyWind !== wind) {
    for (const material of canopyMaterials.values()) material.dispose();
    canopyMaterials.clear();
  }
  canopyWind = wind;
}

/**
 * Lazily builds the pooled wind-patched material for a canopy color. The sway
 * is pure vertex-shader displacement (D-07/D-13): height-weighted so tops move
 * most, low-frequency idle lean plus the shared traveling-gust envelope, all on
 * the SAME uniform objects grass holds (WIND-01 — one wind phase).
 *
 * Accepted trade: the shadow depth pass ignores onBeforeCompile surface
 * patches, so canopy shadows stay static — invisible at D-07 amplitude; no
 * depth-material escalation (cost without payoff).
 */
function getCanopyMaterial(color: number): THREE.MeshLambertMaterial {
  const wind = canopyWind;
  if (!wind) {
    throw new Error(
      'createCanopyTree: initCanopyWind(wind) must be called before building canopy trees'
    );
  }
  const pooled = canopyMaterials.get(color);
  if (pooled) return pooled;

  const material = new THREE.MeshLambertMaterial({ color });
  material.onBeforeCompile = shader => {
    // Wind uniforms wired by OBJECT reference (the shared-clock contract):
    // createWind mutates .value in place every frame; never copy the value.
    shader.uniforms.uTime = wind.timeUniform;
    shader.uniforms.uWindDir = wind.directionUniform;
    shader.uniforms.uWindStrength = wind.strengthUniform;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        uniform float uTime;
        uniform vec2 uWindDir;
        uniform float uWindStrength;
        `
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        vec3 transformed = vec3(position);
        // modelMatrix is valid under the frozen-matrix rule: build-time
        // matrices never change, so world height/position are constants here.
        vec4 canopyWorld = modelMatrix * vec4(position, 1.0);
        float heightWeight = clamp((canopyWorld.y - ${f(CANOPY.swayBaseY)}) * ${f(CANOPY.invSwaySpan)}, 0.0, 1.0);
        float proj = dot(canopyWorld.xz, uWindDir);
        float gust = ${gustGlsl('uTime', 'proj')};
        float lean = sin(uTime * ${f(CANOPY.freq)} + proj * ${f(CANOPY.phase)}) * ${f(CANOPY.idleAmp)};
        transformed.xz += uWindDir * (lean + gust * ${f(CANOPY.gustAmp)}) * heightWeight * uWindStrength;
        `
      );
  };
  // Distinct cache key — colliding with 'grassField' would serve the wrong program.
  material.customProgramCacheKey = () => 'canopySway';
  canopyMaterials.set(color, material);
  return material;
}

export function createCanopyTree(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();
  const totalHeight = randomBetween(random, 5, 7);
  const trunkHeight = totalHeight * 0.55;

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.55, trunkHeight, 5),
    lambert(TRUNK_COLOR)
  );
  trunk.position.y = trunkHeight / 2;
  trunk.rotation.y = random() * Math.PI * 2;
  trunk.castShadow = true;
  group.add(trunk);

  const isOrange = random() < 0.3;
  const canopyColors = isOrange
    ? [CANOPY_ORANGE_DEEP, CANOPY_ORANGE]
    : [CANOPY_GREEN, CANOPY_GREEN_LIGHT];
  const canopyLayers = randomIntBetween(random, 2, 3);

  let layerHeight = trunkHeight * 0.9;
  let layerRadius = randomBetween(random, 2.2, 3);
  for (let index = 0; index < canopyLayers; index += 1) {
    const cap = new THREE.Mesh(
      new THREE.IcosahedronGeometry(layerRadius, 0),
      getCanopyMaterial(canopyColors[index % canopyColors.length])
    );
    cap.scale.y = 0.55;
    cap.position.set(
      randomBetween(random, -0.2, 0.2),
      layerHeight,
      randomBetween(random, -0.2, 0.2)
    );
    cap.rotation.y = random() * Math.PI * 2;
    cap.castShadow = true;
    group.add(cap);

    layerHeight += layerRadius * 0.45;
    layerRadius *= 0.72;
  }

  return { group };
}
