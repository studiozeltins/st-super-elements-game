import * as THREE from 'three';
import type { WindUniforms } from '../../systems/createWind';
import { FLAG, gustGlsl } from '../../systems/windMath';
import type { SeededRandom, WorldAsset } from './types';
import { lambert, pickRandom } from './assetHelpers';

const POLE_COLOR = 0x6b4a2f;
const BANNER_RED = 0xb8433a;
const BANNER_BLUE = 0x3a6ea8;
const BANNER_GOLD = 0xd9a441;
const BANNER_COLORS = [BANNER_RED, BANNER_BLUE, BANNER_GOLD] as const;

const POLE_HEIGHT = 2.2;
const POLE_RADIUS = 0.04;

/** GLSL float literal — raw ints break the shader compile (grass precedent). */
const f = (n: number): string => n.toFixed(4);

// ONE pooled material for every flag's pole and every flag's cloth. The cloth
// carries per-flag banner color via a vertex color attribute, so a single
// patched material serves all flags (pool-materials rule, D-08).
const poleMaterial = lambert(POLE_COLOR);
let clothMaterial: THREE.MeshLambertMaterial | null = null;

/**
 * Lazy singleton cloth material, created with the shared wind uniforms on the
 * first flag build. The ripple is pure vertex-shader displacement: a wave
 * traveling from the pole toward the free end (which whips more), amplitude
 * driven by the SAME idle + traveling-gust phase every consumer reads
 * (WIND-01), at 2.5× grass frequency (WIND-03 — flags flap faster).
 *
 * Known assumption A2: the double-sided Lambert cloth may read dark on the
 * back face — checked in the Plan 08-05 playtest; only then borrow the grass
 * normal-fragment replacement.
 */
function getClothMaterial(wind: WindUniforms): THREE.MeshLambertMaterial {
  if (clothMaterial) return clothMaterial;
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  material.onBeforeCompile = shader => {
    // Wind uniforms wired by OBJECT reference — .value mutates in place each frame.
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
        // 0 at the pole edge -> 1 at the free end (fixed edge never moves).
        float along = position.x * ${f(FLAG.invLength)};
        vec4 flagWorld = modelMatrix * vec4(position, 1.0);
        float gust = ${gustGlsl('uTime', 'dot(flagWorld.xz, uWindDir)')};
        float flap = sin(uTime * ${f(FLAG.freq)} - along * ${f(FLAG.waveK)})
                   * along * along
                   * (${f(FLAG.idleAmp)} + gust * ${f(FLAG.gustAmp)});
        transformed.z += flap * uWindStrength;
        // Cloth shortens as it lifts — snaps taut at the gust peak (D-04).
        transformed.x -= abs(flap) * ${f(FLAG.tautPull)} * along;
        `
      );
  };
  // Distinct cache key — must not collide with grassField/canopySway programs.
  material.customProgramCacheKey = () => 'campFlag';
  clothMaterial = material;
  return material;
}

/** Subdivided cloth with the x=0 edge at the pole and a per-flag banner color. */
function createClothGeometry(color: number): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(FLAG.width, FLAG.height, 8, 3);
  // The plane is centered on the origin — shift so x spans [0, width].
  geometry.translate(FLAG.width / 2, 0, 0);
  const banner = new THREE.Color(color);
  const vertexCount = geometry.getAttribute('position').count;
  const colors = new Float32Array(vertexCount * 3);
  for (let index = 0; index < vertexCount; index += 1) {
    colors.set([banner.r, banner.g, banner.b], index * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

export function createCampFlag(random: SeededRandom, wind: WindUniforms): WorldAsset {
  const group = new THREE.Group();

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(POLE_RADIUS, POLE_RADIUS * 1.4, POLE_HEIGHT, 5),
    poleMaterial
  );
  pole.position.y = POLE_HEIGHT / 2;
  pole.castShadow = true;
  group.add(pole);

  const cloth = new THREE.Mesh(
    createClothGeometry(pickRandom(random, BANNER_COLORS)),
    getClothMaterial(wind)
  );
  cloth.position.y = POLE_HEIGHT - FLAG.height / 2 - 0.06;
  cloth.castShadow = false; // the depth pass cannot follow the vertex patch
  group.add(cloth);

  // Static build-time orientation — the cloth answers the wind in-shader,
  // so the frozen-matrix rule is never touched.
  group.rotation.y = random() * Math.PI * 2;

  return { group }; // no obstacles: thin pole, matches flowers/bushes
}
