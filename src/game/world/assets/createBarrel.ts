import * as THREE from 'three';
import type { SeededRandom, WorldAsset } from './types';
import { box, edgeLit, mergedMesh, randomBetween } from './assetHelpers';

/**
 * Voxel barrel — a bulging staved silhouette faked with stacked boxes (narrow
 * caps + a wider mid-band) wearing two dark iron hoops, each material merged to
 * one draw call (the lantern merged-box pattern). A frozen-matrix static prop:
 * NO PointLight (D-10 light-pool discipline) and a single circular collision
 * footprint so players path around it. Deterministic under the passed
 * SeededRandom — identical on every client.
 */

const BARREL_WOOD = 0x7a5230; // staved wood tone
const HOOP_METAL = 0x2e2118; // dark iron hoops

export function createBarrel(random: SeededRandom): WorldAsset {
  const s = randomBetween(random, 0.7, 0.95);
  const barrelH = s * 1.15; // taller than a crate
  const cap = s * 0.62; // narrow top/bottom
  const mid = s * 0.78; // bulging mid-band
  const capH = barrelH * 0.22;
  const midH = barrelH * 0.56;
  const group = new THREE.Group();

  // Wood body: two narrow caps around a wider mid-band (one merged mesh).
  group.add(
    mergedMesh(
      [
        box(cap, capH, cap, 0, capH / 2, 0),
        box(mid, midH, mid, 0, capH + midH / 2, 0),
        box(cap, capH, cap, 0, capH + midH + capH / 2, 0),
      ],
      edgeLit(BARREL_WOOD)
    )
  );

  // Two iron hoops girdling the mid-band (one merged dark-metal mesh).
  const hoopH = barrelH * 0.09;
  const hoopW = mid + 0.05;
  group.add(
    mergedMesh(
      [
        box(hoopW, hoopH, hoopW, 0, capH + midH * 0.25, 0),
        box(hoopW, hoopH, hoopW, 0, capH + midH * 0.75, 0),
      ],
      edgeLit(HOOP_METAL, 0.55)
    )
  );

  group.rotation.y = randomBetween(random, -0.15, 0.15);

  return { group, obstacles: [{ x: 0, z: 0, radius: s * 0.5, height: barrelH }] };
}
