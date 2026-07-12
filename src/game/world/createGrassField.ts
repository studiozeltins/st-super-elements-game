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

const BLADE_HALF_WIDTH = 0.07;
const BLADE_HEIGHT = 0.5;

function createBladeGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [-BLADE_HALF_WIDTH, 0, 0, BLADE_HALF_WIDTH, 0, 0, 0, BLADE_HEIGHT, 0],
      3
    )
  );
  // Up-facing normals on every vertex — blades inherit the ground's lighting.
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  return geometry;
}

function createGrassMaterial(
  influence: GroundInfluenceUniforms,
  timeUniform: { value: number }
): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  material.onBeforeCompile = shader => {
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
        float heightFactor = position.y * ${(1 / BLADE_HEIGHT).toFixed(1)};
        // Wind: two-octave sway, phase from world position so gusts roll across the field.
        float sway = sin(uTime * 1.7 + bladeOrigin.x * 0.35 + bladeOrigin.z * 0.25)
                   + 0.4 * sin(uTime * 3.3 + bladeOrigin.z * 0.7);
        transformed.xz += vec2(0.85, 0.55) * sway * 0.06 * heightFactor;
        // Ground influence: bend tips along the recorded push, squash by flatten.
        vec2 influenceUv = (bladeOrigin.xz - uInfluenceBounds.xy) * uInfluenceBounds.zw;
        vec4 influence = texture2D(uInfluenceMap, influenceUv);
        vec2 bendDirection = influence.rg * 2.0 - 1.0;
        transformed.xz += bendDirection * influence.b * heightFactor * 0.45;
        transformed.y *= 1.0 - influence.b * 0.75 * heightFactor;
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
    mesh.castShadow = false; // 28k casters would rebuild the sun map every frame
    mesh.receiveShadow = true;
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
