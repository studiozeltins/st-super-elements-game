import * as THREE from 'three';
import type { SeededRandom, WorldAsset } from './types';
import { randomBetween, randomIntBetween } from './assetHelpers';
import { buildVoxelCluster, sphereVoxelCells } from './voxelHelpers';

const BUSH_GREENS = [0x58a24f, 0x4f9147, 0x67b35a] as const;

const BUSH_Y_SCALE = 0.65;
const BUSH_VOXEL_SIZE = 0.3;

export function createBush(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();
  const clumpCount = randomIntBetween(random, 2, 3);

  for (let index = 0; index < clumpCount; index += 1) {
    const radius = randomBetween(random, 0.45, 0.8);
    const clump = buildVoxelCluster(
      sphereVoxelCells(radius, BUSH_VOXEL_SIZE, BUSH_Y_SCALE),
      BUSH_VOXEL_SIZE,
      BUSH_GREENS,
      random
    );
    clump.position.set(
      randomBetween(random, -0.5, 0.5),
      radius * 0.55,
      randomBetween(random, -0.5, 0.5)
    );
    clump.rotation.y = random() * Math.PI * 2;
    clump.castShadow = true;
    group.add(clump);
  }

  return { group };
}
