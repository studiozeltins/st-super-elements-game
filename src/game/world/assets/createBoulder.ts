import * as THREE from 'three';
import type { AssetObstacle, AssetPlatform, SeededRandom, WorldAsset } from './types';
import { randomBetween, randomIntBetween } from './assetHelpers';
import { buildVoxelCluster, sphereVoxelCells, voxelClusterTopY, voxelSizeFor } from './voxelHelpers';

const SLATE_DARK = 0x3d4654;
const SLATE_MID = 0x5a6678;
const SLATE_LIGHT = 0x8a94a4;

const BOULDER_Y_SCALE = 0.7;
/**
 * A boulder's side wall is solid at most this high — a jump (apex ≈ 2.4)
 * always clears it near the top, so boulders stay climbable while walking
 * straight through the base is no longer possible.
 */
const BOULDER_MAX_WALL_HEIGHT = 2.2;

export function createBoulder(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();
  const chunkCount = randomIntBetween(random, 1, 3);
  const baseRadius = randomBetween(random, 1.2, 2.4);

  let stackTopHeight = 0;
  let radius = baseRadius;
  const platforms: AssetPlatform[] = [];
  const obstacles: AssetObstacle[] = [];
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
    // EVERY chunk is standable at its own top, centered where the chunk
    // actually sits — landing on the wide base of a stacked boulder used to
    // fall through to the terrain (only the summit was registered).
    platforms.push({
      x: chunk.position.x,
      z: chunk.position.z,
      radius: radius * 0.8,
      topHeight: stackTopHeight,
    });
    // The base chunk is a solid wall up to (near) its own top: walking into a
    // boulder no longer clips inside it, but a jump still lands on the platform.
    if (index === 0) {
      obstacles.push({
        x: chunk.position.x,
        z: chunk.position.z,
        radius: radius * 0.8,
        height: Math.min(stackTopHeight, BOULDER_MAX_WALL_HEIGHT),
      });
    }
    radius *= randomBetween(random, 0.6, 0.8);
  }

  return { group, platforms, obstacles };
}
