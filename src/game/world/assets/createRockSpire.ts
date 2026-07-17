import * as THREE from 'three';
import type { AssetObstacle, SeededRandom, WorldAsset } from './types';
import { randomBetween, randomIntBetween } from './assetHelpers';
import { buildRock } from './createRockMesh';

const TAU = Math.PI * 2;

/**
 * A cluster of 2–4 tall rock pillars. Each pillar is a TAPERING STACK of shard
 * chunks (see createRockMesh) rather than one stretched mesh — stacking keeps the
 * facets roughly equant so the spire reads as a craggy pile of angular rock, not
 * a smooth vertical prism. One solid footprint per spire so none is walk-through.
 */
export function createRockSpire(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();
  const spireCount = randomIntBetween(random, 2, 4);
  const obstacles: AssetObstacle[] = [];

  for (let index = 0; index < spireCount; index += 1) {
    const baseRadius = randomBetween(random, 0.7, 1.4);
    const anchorX = randomBetween(random, -1.2, 1.2);
    const anchorZ = randomBetween(random, -1.2, 1.2);

    let y = 0;
    let radius = baseRadius;
    let guard = 0;
    // Stack shard chunks upward, shrinking, until the pillar tapers to a tip.
    while (radius > 0.3 && guard < 8) {
      guard += 1;
      const halfHeight = radius * randomBetween(random, 1.0, 1.5); // ~equant chunk
      const { mesh } = buildRock(random, radius, halfHeight, radius);
      mesh.position.set(
        anchorX + randomBetween(random, -0.2, 0.2) * baseRadius,
        y + halfHeight * 0.9,
        anchorZ + randomBetween(random, -0.2, 0.2) * baseRadius
      );
      mesh.rotation.y = random() * TAU;
      group.add(mesh);
      y += halfHeight * 1.7; // slight overlap between stacked chunks
      radius *= randomBetween(random, 0.7, 0.88);
    }

    // One solid circle at the base footprint, spanning the pillar's full height.
    obstacles.push({ x: anchorX, z: anchorZ, radius: baseRadius * 0.8, height: y });
  }

  return { group, obstacles };
}
