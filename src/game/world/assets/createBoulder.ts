import * as THREE from 'three';
import type { SeededRandom, WorldAsset } from './types';
import { randomBetween, randomIntBetween } from './assetHelpers';
import { buildVoxelCluster, sphereVoxelCells, voxelClusterTopY, voxelSizeFor } from './voxelHelpers';

const SLATE_DARK = 0x3d4654;
const SLATE_MID = 0x5a6678;
const SLATE_LIGHT = 0x8a94a4;

const BOULDER_Y_SCALE = 0.7;

export function createBoulder(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();
  const chunkCount = randomIntBetween(random, 1, 3);
  const baseRadius = randomBetween(random, 1.2, 2.4);

  let stackTopHeight = 0;
  let radius = baseRadius;
  let topChunkRadius = baseRadius;
  for (let index = 0; index < chunkCount; index += 1) {
    const isTopChunk = index === chunkCount - 1;
    const shades = isTopChunk ? [SLATE_LIGHT, SLATE_MID] : [SLATE_DARK, SLATE_MID, SLATE_LIGHT];
    const voxelSize = voxelSizeFor(radius * 2);
    const cells = sphereVoxelCells(radius, voxelSize, BOULDER_Y_SCALE);
    const chunk = buildVoxelCluster(cells, voxelSize, shades, random);
    const halfHeight = radius * BOULDER_Y_SCALE;
    chunk.position.set(
      randomBetween(random, -0.15, 0.15) * baseRadius,
      stackTopHeight + halfHeight * 0.75,
      randomBetween(random, -0.15, 0.15) * baseRadius
    );
    chunk.rotation.y = random() * Math.PI * 2;
    chunk.castShadow = true;
    group.add(chunk);

    // Standing height = the actual top voxel face, so players rest flush.
    stackTopHeight = chunk.position.y + voxelClusterTopY(cells, voxelSize);
    topChunkRadius = radius;
    radius *= randomBetween(random, 0.6, 0.8);
  }

  return {
    group,
    // Standable area is the TOP chunk, not the base — otherwise players float.
    platformRadius: topChunkRadius * 0.8,
    platformTopHeight: stackTopHeight,
  };
}
