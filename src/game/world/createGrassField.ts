import * as THREE from 'three';
import type { GroundInfluenceUniforms } from '../systems/createGroundInfluence';
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
  update(deltaSeconds: number): void;
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
  timeUniform: { value: number }
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
    shader.uniforms.uTime = timeUniform;
    shader.uniforms.uInfluenceMap = influence.textureUniform;
    shader.uniforms.uInfluenceBounds = influence.boundsUniform;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        uniform float uTime;
        uniform sampler2D uInfluenceMap;
        uniform vec4 uInfluenceBounds;
        `
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        vec3 transformed = vec3(position);
        vec4 bladeOrigin = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float heightFactor = position.y * ${(1 / BLADE_HEIGHT).toFixed(4)};
        // Wind: two-octave sway, phase from world position so gusts roll across the field.
        float sway = sin(uTime * 1.7 + bladeOrigin.x * 0.35 + bladeOrigin.z * 0.25)
                   + 0.4 * sin(uTime * 3.3 + bladeOrigin.z * 0.7);
        transformed.xz += vec2(0.85, 0.55) * sway * 0.09 * heightFactor;
        // Ground influence: bend tips along the recorded push, squash by flatten.
        // A = accumulated wear (trampled trails / strike destruction): squashes
        // the whole blade toward the sod and regrows as the channel decays.
        vec2 influenceUv = (bladeOrigin.xz - uInfluenceBounds.xy) * uInfluenceBounds.zw;
        vec4 influence = texture2D(uInfluenceMap, influenceUv);
        vec2 bendDirection = influence.rg * 2.0 - 1.0;
        transformed.xz += bendDirection * influence.b * heightFactor * 0.55;
        transformed.y *= (1.0 - influence.b * 0.9 * heightFactor) * (1.0 - influence.a * 0.92);
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
}): GrassField {
  const group = new THREE.Group();
  const timeUniform = { value: 0 };
  const material = createGrassMaterial(options.influence, timeUniform);
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
    mesh.receiveShadow = false; // skip per-fragment shadow sampling over the whole field
    group.add(mesh);
  });

  return {
    group,
    update(deltaSeconds) {
      timeUniform.value += deltaSeconds;
    },
    dispose() {
      for (const child of group.children) {
        if (child instanceof THREE.InstancedMesh) child.geometry.dispose();
      }
      material.dispose();
      group.removeFromParent();
    },
  };
}
