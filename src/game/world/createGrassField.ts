import * as THREE from 'three';
import type { GroundInfluenceUniforms } from '../systems/createGroundInfluence';
import type { ScorchMapUniforms } from '../systems/createScorchMap';
import type { WindUniforms } from '../systems/createWind';
import { GUST, SWAY, gustGlsl, swayGlsl } from '../systems/windMath';
import { sunDirUniform } from '../systems/sunUniform';
import { ISLANDS } from './terrain';
import { generateGrassBlades } from './grassPlacement';

/**
 * Dense instanced grass. One InstancedMesh per island (so off-screen islands
 * frustum-cull as a unit), single shared Lambert material patched with a wind
 * sway + ground-influence bend in the vertex stage.
 *
 * Blades are single tapered triangles with normals hard-set to +Y: Lambert
 * then shades each blade exactly like the terrain beneath it, which is what
 * makes 28k flat triangles read as "grass on the ground" instead of noise.
 */
export interface GrassField {
  group: THREE.Group;
  dispose(): void;
}

const BLADE_HEIGHT = 0.6;

/**
 * A real grass blade, not a spike: a tapering two-segment strip that arcs
 * forward (root → mid → tip), 3 triangles. Rendered DoubleSide with the
 * backface normal flip disabled in the shader (see createGrassMaterial) so
 * both faces shade like the ground beneath — no doubled geometry, no black
 * backface needles.
 */
function createBladeGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  // x = width taper, y = height, z = forward arc.
  const rootHalf = 0.055;
  const midHalf = 0.032;
  const positions = [
    [-rootHalf, 0, 0],
    [rootHalf, 0, 0],
    [-midHalf, BLADE_HEIGHT * 0.55, 0.06],
    [midHalf, BLADE_HEIGHT * 0.55, 0.06],
    [0, BLADE_HEIGHT, 0.16],
  ].flat();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex([0, 1, 3, 0, 3, 2, 2, 3, 4]);
  // Up-facing normals on every vertex — blades inherit the ground's lighting.
  geometry.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(Array.from({ length: 5 }, () => [0, 1, 0]).flat(), 3)
  );
  // Root→tip brightness gradient, multiplied with the per-instance color:
  // dark in the sod, bright at the waving tip.
  const shades = [0.72, 0.72, 0.98, 0.98, 1.18];
  geometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(shades.flatMap(shade => [shade, shade, shade]), 3)
  );
  return geometry;
}

function createGrassMaterial(
  influence: GroundInfluenceUniforms,
  scorch: ScorchMapUniforms,
  wind: WindUniforms
): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  material.onBeforeCompile = shader => {
    // Kill the DoubleSide backface normal flip: flipped normals face the dark
    // ground hemisphere and render blades near-black from behind. Every blade
    // face shades with the ground's up-normal instead.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      /* glsl */ `
      float faceDirection = 1.0;
      vec3 normal = normalize( vNormal );
      vec3 nonPerturbedNormal = normal;
      `
    );
    // Blades over scorched soil dry out to brown instead of staying green on
    // a burnt patch — tint tracks the scorch map, so it heals back with it.
    shader.uniforms.uSunDir = sunDirUniform; // by reference — game loop updates it
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying float vScorch;
        varying float vHeightFactor;
        varying vec3 vWorldPosG;
        varying vec3 vSparkleN;
        varying float vTwinkle;
        uniform vec3 uSunDir;
        `
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
        #include <color_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.30, 0.16), min(vScorch * 1.5, 0.85));
        `
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `
        #include <opaque_fragment>
        // Sun SPARKLE: a sharp Blinn glint off each blade's own randomly-tilted
        // normal (Lambert has none), concentrated at the tip and twinkling over
        // time, so lit grass catches the light as a shimmer of individual points
        // instead of flat fake turf. Scaled by the fragment's own lit luminance so
        // it glints by day and stays calm at night — never a glow in the dark.
        vec3 sheenV = normalize(cameraPosition - vWorldPosG);
        vec3 sheenH = normalize(normalize(uSunDir) + sheenV);
        float sheen = pow(max(dot(normalize(vSparkleN), sheenH), 0.0), 34.0);
        float sheenLum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
        sheen *= vTwinkle * vHeightFactor * (1.0 - min(vScorch * 1.5, 0.85)) * sheenLum;
        gl_FragColor.rgb += sheen * vec3(0.75, 0.82, 0.55);
        `
      );
    // Wind uniforms wired by OBJECT reference (the shared-clock contract):
    // createWind mutates .value in place every frame; never copy the value.
    shader.uniforms.uTime = wind.timeUniform;
    shader.uniforms.uWindDir = wind.directionUniform;
    shader.uniforms.uWindStrength = wind.strengthUniform;
    shader.uniforms.uInfluenceMap = influence.textureUniform;
    shader.uniforms.uInfluenceBounds = influence.boundsUniform;
    shader.uniforms.uScorchMap = scorch.textureUniform;
    shader.uniforms.uScorchBounds = scorch.boundsUniform;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        uniform float uTime;
        uniform vec2 uWindDir;
        uniform float uWindStrength;
        uniform sampler2D uInfluenceMap;
        uniform vec4 uInfluenceBounds;
        uniform sampler2D uScorchMap;
        uniform vec4 uScorchBounds;
        varying float vScorch;
        varying float vHeightFactor;
        varying vec3 vWorldPosG;
        varying vec3 vSparkleN;
        varying float vTwinkle;
        `
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        vec3 transformed = vec3(position);
        vec4 bladeOrigin = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float heightFactor = position.y * ${(1 / BLADE_HEIGHT).toFixed(4)};
        // Wind: two-octave base sway (constants single-sourced from windMath),
        // phase from world position. The gust factor is a retarded-time envelope
        // traveling along uWindDir; it rests at 0, so between gusts the
        // displacement is arithmetically identical to the base formula, and
        // uWindStrength = 0 (?nowind) kills gusts without any recompile.
        float sway = ${swayGlsl('uTime', 'bladeOrigin.x', 'bladeOrigin.z')};
        float gust = ${gustGlsl('uTime', 'dot(bladeOrigin.xz, uWindDir)')};
        transformed.xz += vec2(${SWAY.ampX.toFixed(4)}, ${SWAY.ampZ.toFixed(4)}) * sway * ${SWAY.scale.toFixed(4)} * heightFactor
                        * (1.0 + uWindStrength * ${GUST.gain.toFixed(4)} * gust);
        // Ground influence: bend tips along the recorded push, squash by flatten.
        // A = accumulated wear (trampled trails / strike destruction): squashes
        // the whole blade toward the sod and regrows as the channel decays.
        vec2 influenceUv = (bladeOrigin.xz - uInfluenceBounds.xy) * uInfluenceBounds.zw;
        vec4 influence = texture2D(uInfluenceMap, influenceUv);
        vec2 bendDirection = influence.rg * 2.0 - 1.0;
        transformed.xz += bendDirection * influence.b * heightFactor * 0.55;
        transformed.y *= (1.0 - influence.b * 0.9 * heightFactor) * (1.0 - influence.a * 0.92);
        vec2 scorchUv = (bladeOrigin.xz - uScorchBounds.xy) * uScorchBounds.zw;
        vScorch = texture2D(uScorchMap, scorchUv).r;
        // Tip factor + final world position for the fragment sun-glisten.
        vHeightFactor = heightFactor;
        vWorldPosG = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        // Per-blade SPARKLE: a random tilted normal (per blade) + a time twinkle,
        // so only some blades hit the sun specular at once and the set shimmers as
        // the wind/camera moves — a real catch-light glint, not a flat sheen band.
        float sSeed = fract(sin(dot(bladeOrigin.xz, vec2(12.9898, 78.233))) * 43758.5453);
        vTwinkle = 0.5 + 0.5 * sin(uTime * 3.5 + sSeed * 6.2831);
        vec3 tiltN = normalize(vec3((sSeed - 0.5) * 1.2, 1.0, (fract(sSeed * 7.3) - 0.5) * 1.2));
        vSparkleN = normalize(mat3(modelMatrix * instanceMatrix) * tiltN);
        `
      );
  };
  // Distinct cache key — the patched program must not collide with plain Lambert.
  material.customProgramCacheKey = () => 'grassField';
  return material;
}

export function createGrassField(options: {
  bladeCount: number;
  influence: GroundInfluenceUniforms;
  scorch: ScorchMapUniforms;
  /** Shared wind clock + gust uniforms — the game loop advances them. */
  wind: WindUniforms;
}): GrassField {
  const group = new THREE.Group();
  const material = createGrassMaterial(options.influence, options.scorch, options.wind);
  const islandChunks = generateGrassBlades(options.bladeCount);

  const transform = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const upAxis = new THREE.Vector3(0, 1, 0);
  const bladeColor = new THREE.Color();

  islandChunks.forEach((blades, islandIndex) => {
    if (blades.length === 0) return;
    const geometry = createBladeGeometry();
    const mesh = new THREE.InstancedMesh(geometry, material, blades.length);
    blades.forEach((blade, index) => {
      rotation.setFromAxisAngle(upAxis, blade.rotationY);
      transform.compose(
        new THREE.Vector3(blade.x, blade.y, blade.z),
        rotation,
        new THREE.Vector3(blade.scale, blade.scale, blade.scale)
      );
      mesh.setMatrixAt(index, transform);
      mesh.setColorAt(index, bladeColor.setRGB(blade.color.r, blade.color.g, blade.color.b));
    });
    // Island-sized bounds: instance matrices hold world positions, so the
    // auto-computed (tiny) blade bounds would cull the whole field wrongly.
    const island = ISLANDS[islandIndex];
    geometry.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(island.centerX, 0, island.centerZ),
      island.radius + BLADE_HEIGHT + 8
    );
    mesh.castShadow = false; // thousands of casters would rebuild the sun map every frame
    mesh.receiveShadow = true; // grass darkens under building/tree shadows (not flat-lit fake turf)
    group.add(mesh);
  });

  return {
    group,
    dispose() {
      for (const child of group.children) {
        if (child instanceof THREE.InstancedMesh) child.geometry.dispose();
      }
      material.dispose();
      group.removeFromParent();
    },
  };
}
