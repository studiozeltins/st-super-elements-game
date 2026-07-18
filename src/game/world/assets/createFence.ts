import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { AssetObstacle, SeededRandom, WorldAsset } from './types';
import { edgeLit, randomBetween, randomIntBetween } from './assetHelpers';

/**
 * Voxel fence RUN — the WHOLE run (N posts + two horizontal rails between them)
 * built in ONE factory and merged into a single draw call (the lantern
 * multi-part single-group pattern). A frozen-matrix static prop: NO PointLight
 * (D-10 light-pool discipline) and one small collision footprint PER POST so
 * players path around each upright (honored by placeAsset in Plan 07).
 * Deterministic under the passed SeededRandom — identical on every client. The
 * run is centered on the local origin along +x.
 */

const FENCE_WOOD = 0x6d4c2c; // warm weathered fence wood

/** A box geometry pre-translated to (x,y,z) — for merging same-material parts. */
function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

/** Merge same-material box parts into one mesh (one draw call). */
function mergedMesh(geos: THREE.BufferGeometry[], material: THREE.Material): THREE.Mesh {
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  return new THREE.Mesh(merged, material);
}

export function createFence(random: SeededRandom): WorldAsset {
  const postCount = randomIntBetween(random, 3, 5);
  const spacing = 1.1; // gap between posts along +x
  const postW = 0.16;
  const postH = randomBetween(random, 0.95, 1.15);
  const railH = 0.1;
  const railD = 0.08;
  const totalLen = (postCount - 1) * spacing;
  const startX = -totalLen / 2; // center the run on local origin

  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const obstacles: AssetObstacle[] = [];

  // Posts — one box + one collision footprint each.
  const postX: number[] = [];
  for (let i = 0; i < postCount; i += 1) {
    const jitter = randomBetween(random, -0.04, 0.04);
    const x = startX + i * spacing + jitter;
    postX.push(x);
    geos.push(box(postW, postH, postW, x, postH / 2, 0));
    obstacles.push({ x, z: 0, radius: 0.2, height: postH });
  }

  // Two horizontal rails spanning each gap between adjacent posts.
  for (let i = 0; i < postCount - 1; i += 1) {
    const midX = (postX[i] + postX[i + 1]) / 2;
    const railLen = postX[i + 1] - postX[i] + postW;
    for (const railY of [postH * 0.35, postH * 0.72]) {
      geos.push(box(railLen, railH, railD, midX, railY, 0));
    }
  }

  group.add(mergedMesh(geos, edgeLit(FENCE_WOOD)));

  return { group, obstacles };
}
