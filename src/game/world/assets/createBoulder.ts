import * as THREE from 'three';
import type { AssetObstacle, AssetPlatform, SeededRandom, WorldAsset } from './types';
import { randomBetween, randomIntBetween } from './assetHelpers';
import { buildRock } from './createRockMesh';

const BOULDER_Y_SCALE = 0.7;
/**
 * A boulder's side wall is solid at most this high — a jump (apex ≈ 2.4)
 * always clears it near the top, so boulders stay climbable while walking
 * straight through the base is no longer possible.
 */
const BOULDER_MAX_WALL_HEIGHT = 2.2;

/**
 * A stack of 1–3 irregular rock chunks (see createRockMesh — faceted or smooth
 * per ?rock). Each chunk is its own standable platform; the base chunk is a
 * solid wall up to (near) its top so you can't walk through it but a jump lands.
 */
export function createBoulder(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();
  const chunkCount = randomIntBetween(random, 1, 3);
  const baseRadius = randomBetween(random, 1.2, 2.4);

  let stackTopHeight = 0;
  let radius = baseRadius;
  const platforms: AssetPlatform[] = [];
  const obstacles: AssetObstacle[] = [];
  for (let index = 0; index < chunkCount; index += 1) {
    const halfHeight = radius * BOULDER_Y_SCALE;
    const { mesh, topY, radiusXZ } = buildRock(random, radius, halfHeight, radius);
    mesh.position.set(
      randomBetween(random, -0.15, 0.15) * baseRadius,
      stackTopHeight + halfHeight * 0.75,
      randomBetween(random, -0.15, 0.15) * baseRadius
    );
    mesh.rotation.y = random() * Math.PI * 2;
    group.add(mesh);

    // Standing height = the actual top of this chunk, so players rest flush.
    stackTopHeight = mesh.position.y + topY;
    const footprint = radiusXZ * 0.8;
    // EVERY chunk is standable at its own top, centered where it actually sits.
    platforms.push({ x: mesh.position.x, z: mesh.position.z, radius: footprint, topHeight: stackTopHeight });
    // The base chunk is a solid wall up to (near) its own top.
    if (index === 0) {
      obstacles.push({
        x: mesh.position.x,
        z: mesh.position.z,
        radius: footprint,
        height: Math.min(stackTopHeight, BOULDER_MAX_WALL_HEIGHT),
      });
    }
    radius *= randomBetween(random, 0.6, 0.8);
  }

  return { group, platforms, obstacles };
}
