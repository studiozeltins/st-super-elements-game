import * as THREE from 'three';
import type { SeededRandom, WorldAsset } from './types';
import { box, edgeLit, mergedMesh, randomBetween } from './assetHelpers';

/**
 * Voxel crate — a slatted wooden cube built from six face panels framing a
 * hollow box plus four corner edge battens, all merged into ONE draw call (the
 * lantern merged-box pattern). A frozen-matrix static prop: NO PointLight
 * (D-10 light-pool discipline) and a single circular collision footprint so
 * players path around it (honored by placeAsset in Plan 07). Deterministic
 * under the passed SeededRandom — identical on every client.
 */

const CRATE_WOOD = 0x8a6a3f; // warm crate wood, pops off the grey cobble

export function createCrate(random: SeededRandom): WorldAsset {
  const s = randomBetween(random, 0.7, 0.95);
  const half = s / 2;
  const t = s * 0.12; // plank thickness
  const group = new THREE.Group();

  // Six face panels framing a hollow cube.
  const geos: THREE.BufferGeometry[] = [
    box(s, t, s, 0, t / 2, 0), // bottom
    box(s, t, s, 0, s - t / 2, 0), // top
    box(t, s, s, half - t / 2, half, 0), // +x wall
    box(t, s, s, -half + t / 2, half, 0), // -x wall
    box(s, s, t, 0, half, half - t / 2), // +z wall
    box(s, s, t, 0, half, -half + t / 2), // -z wall
  ];

  // Four vertical corner edge battens — crisp voxel corners.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      geos.push(box(t * 1.1, s, t * 1.1, sx * (half - t * 0.4), half, sz * (half - t * 0.4)));
    }
  }

  group.add(mergedMesh(geos, edgeLit(CRATE_WOOD)));
  group.rotation.y = randomBetween(random, -0.15, 0.15);

  return { group, obstacles: [{ x: 0, z: 0, radius: s * 0.6, height: s }] };
}
