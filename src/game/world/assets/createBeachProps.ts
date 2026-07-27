import * as THREE from 'three';
import type { SeededRandom, WorldAsset } from './types';
import { randomBetween, randomIntBetween, pickRandom } from './assetHelpers';

/**
 * Small smooth beach clutter — shells, starfish, driftwood, pebbles. Deliberately
 * SMOOTH-shaded (rounded low-poly, no flatShading) so the shoreline reads soft and
 * organic rather than blocky/voxel. All are lightweight walk-through decor.
 */

/** Smooth (not flat-shaded) lambert — the rounded look. */
function smooth(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color });
}

/**
 * A SMOOTH-shaded lambert given a chunky PIXEL-ART clod texture: per object-space
 * cell it jitters brightness and drops the odd dark grain, so beach boulders read
 * as pixel-textured sandy stone — rounded (smooth normals), never jagged/sharp.
 */
function pixelRockMaterial(color: number): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ color });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRockPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRockPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec3 vRockPos;
        float rockHash(vec2 c) { return fract(sin(dot(c, vec2(41.3, 289.1))) * 43758.5453); }
        `
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
        #include <color_fragment>
        {
          vec3 cell = floor(vRockPos * 7.0);
          float h = rockHash(cell.xy + cell.z * 3.7);
          diffuseColor.rgb *= 0.82 + h * 0.34;                                  // per-clod brightness
          if (rockHash(cell.xy + cell.z * 7.1 + 2.0) < 0.10) diffuseColor.rgb *= 0.72; // dark grain
        }
        `
      );
  };
  material.customProgramCacheKey = () => `pixelRock${color}`;
  return material;
}

const SHELL_TINTS = [0xf3e8d6, 0xf0d9c0, 0xe9c9b8, 0xf6ede0];

/** A little clam shell: a flattened half-dome, smooth. */
export function createSeashell(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();
  const size = randomBetween(random, 0.12, 0.2);
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(size, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    smooth(pickRandom(random, SHELL_TINTS))
  );
  shell.scale.y = randomBetween(random, 0.35, 0.5);
  shell.rotation.y = random() * Math.PI * 2;
  shell.castShadow = true;
  group.add(shell);
  return { group };
}

/** Five smooth arms radiating from a low body — a starfish resting flat on the sand. */
export function createStarfish(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();
  const material = smooth(pickRandom(random, [0xe08a4a, 0xd7563a, 0xdb7b52]));
  const armLength = randomBetween(random, 0.16, 0.24);
  for (let index = 0; index < 5; index += 1) {
    const angle = (index / 5) * Math.PI * 2;
    const arm = new THREE.Mesh(new THREE.ConeGeometry(0.07, armLength, 6), material);
    // Lay the cone flat, pointing outward along its arm angle.
    arm.rotation.z = Math.PI / 2;
    arm.rotation.y = -angle;
    arm.position.set(Math.cos(angle) * armLength * 0.5, 0.03, Math.sin(angle) * armLength * 0.5);
    arm.castShadow = true;
    group.add(arm);
  }
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), material);
  body.scale.y = 0.4;
  body.position.y = 0.03;
  group.add(body);
  group.rotation.y = random() * Math.PI * 2;
  return { group };
}

/** A bleached driftwood log lying on its side, with an optional stub branch. */
export function createDriftwood(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();
  const material = smooth(pickRandom(random, [0xb7a488, 0xc7b79a, 0xa89a80]));
  const length = randomBetween(random, 0.9, 1.6);
  const radius = randomBetween(random, 0.1, 0.16);
  const log = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.85, radius, length, 8), material);
  log.rotation.z = Math.PI / 2;
  log.position.y = radius;
  log.castShadow = true;
  group.add(log);
  if (random() < 0.5) {
    const stub = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.4, radius * 0.5, length * 0.35, 6),
      material
    );
    stub.rotation.set(Math.PI / 2, 0, randomBetween(random, 0.4, 0.9));
    stub.position.set(randomBetween(random, -length * 0.2, length * 0.2), radius, radius * 1.2);
    stub.castShadow = true;
    group.add(stub);
  }
  group.rotation.y = random() * Math.PI * 2;
  return { group };
}

const BEACH_ROCK_TINTS = [0xc2b092, 0xb3a488, 0xad9e82, 0xc7b79a];

/** A rounded, smooth beach boulder (warm sandy tone — not a jagged gray crag). */
export function createBeachRock(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();
  const material = pixelRockMaterial(pickRandom(random, BEACH_ROCK_TINTS));
  const lumps = randomIntBetween(random, 1, 3);
  let widest = 0.6;
  for (let index = 0; index < lumps; index += 1) {
    const size = randomBetween(random, 0.45, 0.85) * (index === 0 ? 1 : 0.7);
    // Smooth rounded stone: an icosphere squashed and gently jittered, never faceted-sharp.
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 1), material);
    rock.scale.set(
      randomBetween(random, 0.9, 1.2),
      randomBetween(random, 0.6, 0.85),
      randomBetween(random, 0.9, 1.2)
    );
    rock.position.set(
      randomBetween(random, -0.4, 0.4),
      size * 0.4,
      randomBetween(random, -0.4, 0.4)
    );
    rock.rotation.set(random() * 0.4, random() * Math.PI * 2, random() * 0.4);
    rock.castShadow = true;
    group.add(rock);
    widest = Math.max(widest, size);
  }
  return { group, obstacles: [{ x: 0, z: 0, radius: widest * 0.7 }] };
}

/** A little cluster of smooth rounded pebbles. */
export function createBeachPebbles(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();
  const material = smooth(pickRandom(random, [0x9a9488, 0x8b8578, 0xa8a294, 0x7f7a70]));
  const count = randomIntBetween(random, 2, 4);
  for (let index = 0; index < count; index += 1) {
    const size = randomBetween(random, 0.1, 0.22);
    const pebble = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 6), material);
    pebble.scale.set(1, randomBetween(random, 0.55, 0.8), randomBetween(random, 0.85, 1.1));
    pebble.position.set(
      randomBetween(random, -0.3, 0.3),
      size * 0.35,
      randomBetween(random, -0.3, 0.3)
    );
    pebble.rotation.y = random() * Math.PI * 2;
    pebble.castShadow = true;
    group.add(pebble);
  }
  return { group };
}
