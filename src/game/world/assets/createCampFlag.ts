import * as THREE from 'three';
import type { WindUniforms } from '../../systems/createWind';
import { FLAG, flagDrapeGlsl, flagSwingGlsl, gustGlsl } from '../../systems/windMath';
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

// ONE pooled material for every flag's pole and every flag's cloth, cached
// per WIND INSTANCE (CR-01). The cloth carries per-flag banner color via a
// vertex color attribute, so a single patched material serves all flags
// within one wind lifetime (pool-materials rule, D-08). When a new game hands
// in a different wind, both materials are disposed and rebuilt so the cloth's
// shader closure captures the LIVE uniforms. The pole carries no wind but
// joins the cache anyway: disposeObject disposes it on world teardown, so its
// lifetime must match the world too. A cached material may be disposed by
// world.dispose() at game teardown — that is safe because the next game
// constructs a NEW wind, forcing the rebuild path; the cache never hands a
// disposed material to a live world.
let flagWind: WindUniforms | null = null;
let poleMaterial: THREE.MeshLambertMaterial | null = null;
let clothMaterial: THREE.MeshLambertMaterial | null = null;

/**
 * Wind-guarded lazy material pair, built with the shared wind uniforms on the
 * first flag build of each wind lifetime. The cloth pose is pure vertex-shader
 * work — three layered terms, all from the SAME wind clock every consumer
 * reads (WIND-01), at 2.5× grass frequency (WIND-03 — flags flap faster):
 *
 * 1. Ripple flap: a wave traveling from the pole toward the free end (which
 *    whips more), amplitude driven by the idle + traveling-gust envelope.
 * 2. Drape (D-12): a limp-hang pitch about the pole edge weighted by the
 *    windMath flagDrape blend — strength 0 hangs the cloth down the pole with
 *    only a drape-gated micro-sway; wind and gusts lift it back to the banner.
 * 3. Downwind yaw (UAT 4/5/9): the offset-from-the-pole is yawed from the
 *    baked heading (modelMatrix[0].xz) toward uWindDir by the windMath
 *    flagSwing blend — gusts visibly snap the cloth further downwind.
 *
 * Known assumption A2: the double-sided Lambert cloth may read dark on the
 * back face — checked in the Plan 08-05 playtest; only then borrow the grass
 * normal-fragment replacement.
 */
function getFlagMaterials(wind: WindUniforms): {
  pole: THREE.MeshLambertMaterial;
  cloth: THREE.MeshLambertMaterial;
} {
  if (wind !== flagWind) {
    poleMaterial?.dispose();
    clothMaterial?.dispose();
    poleMaterial = null;
    clothMaterial = null;
    flagWind = wind;
  }
  if (poleMaterial && clothMaterial) return { pole: poleMaterial, cloth: clothMaterial };

  poleMaterial = lambert(POLE_COLOR);
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
        // Ripple flap + taut pull — still x uWindStrength: both correctly die
        // at strength 0, where the drape below owns the pose (D-12).
        float flap = sin(uTime * ${f(FLAG.freq)} - along * ${f(FLAG.waveK)})
                   * along * along
                   * (${f(FLAG.idleAmp)} + gust * ${f(FLAG.gustAmp)});
        transformed.z += flap * uWindStrength;
        // Cloth shortens as it lifts — snaps taut at the gust peak (D-04).
        transformed.x -= abs(flap) * ${f(FLAG.tautPull)} * along;
        // Drape pitch about the horizontal pole-edge axis (flagDrape blend,
        // windMath): strength 0 evaluates to 1 -> the cloth falls limp down
        // the pole; wind + gusts lift it back toward the taut banner.
        float drape = ${flagDrapeGlsl('uWindStrength', 'gust')};
        float pitch = drape * ${f(FLAG.drapePitch)};
        transformed.y -= transformed.x * sin(pitch);
        transformed.x *= cos(pitch);
        // Limp micro-sway: gated on DRAPE, never uWindStrength — the one term
        // that survives ?nowind so a hanging flag keeps a breath of life
        // (mirror of gustGainFactor keeping grass alive, drape-gated here).
        transformed.z += sin(uTime * ${f(FLAG.limpFreq)}) * ${f(FLAG.limpAmp)} * drape * along;
        // Downwind yaw (UAT 4/5/9): signed angle from the baked world heading
        // to uWindDir. modelMatrix[0].xz is the local +x basis in world space
        // — the group's build-time bake is a pure y-rotation, so this IS the
        // cloth heading, and y-rotations commute so yawing the local offset
        // about the pole (the x=0 hinge) composes exactly. Zero new uniforms:
        // all per-flag variation comes from modelMatrix (pooled material).
        vec2 heading = normalize(modelMatrix[0].xz);
        float cosA = dot(heading, uWindDir);
        float sinA = heading.y * uWindDir.x - heading.x * uWindDir.y;
        // flagSwing blend (windMath) scales alignment; the (0.7 + 0.3*along)
        // ease lets the free end lead so the cloth streams, not pivots.
        float yaw = atan(sinA, cosA)
                  * ${flagSwingGlsl('uWindStrength', 'gust')}
                  * (0.7 + 0.3 * along);
        float yawSin = sin(yaw);
        float yawCos = cos(yaw);
        transformed.xz = vec2(
          transformed.x * yawCos + transformed.z * yawSin,
          -transformed.x * yawSin + transformed.z * yawCos
        );
        `
      );
  };
  // Distinct cache key — must not collide with grassField/canopySway programs.
  material.customProgramCacheKey = () => 'campFlag';
  clothMaterial = material;
  return { pole: poleMaterial, cloth: clothMaterial };
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
  const materials = getFlagMaterials(wind);

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(POLE_RADIUS, POLE_RADIUS * 1.4, POLE_HEIGHT, 5),
    materials.pole
  );
  pole.position.y = POLE_HEIGHT / 2;
  pole.castShadow = true;
  group.add(pole);

  const cloth = new THREE.Mesh(
    createClothGeometry(pickRandom(random, BANNER_COLORS)),
    materials.cloth
  );
  cloth.position.y = POLE_HEIGHT - FLAG.height / 2 - 0.06;
  cloth.castShadow = false; // the depth pass cannot follow the vertex patch
  group.add(cloth);

  // Static build-time orientation — the cloth answers the wind in-shader,
  // and since the begin_vertex yaw reads this bake back via modelMatrix[0].xz
  // that is now literally true for DIRECTION, not just amplitude: the shader
  // swings the cloth from this heading toward uWindDir. The frozen-matrix
  // rule is never touched — no per-frame CPU rotation exists.
  group.rotation.y = random() * Math.PI * 2;

  return { group }; // no obstacles: thin pole, matches flowers/bushes
}
