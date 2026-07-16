import * as THREE from 'three';
import type { AssetObstacle, SeededRandom, WorldAsset } from './types';
import { randomBetween, randomIntBetween } from './assetHelpers';
import { buildRock } from './createRockMesh';

/**
 * A cluster of 2–4 tall irregular rock pillars (see createRockMesh — faceted or
 * smooth per ?rock). Each is an elongated craggy rock, tilted slightly, with its
 * own solid footprint so none is walk-through.
 */
export function createRockSpire(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();
  const spireCount = randomIntBetween(random, 2, 4);
  const obstacles: AssetObstacle[] = [];

  for (let index = 0; index < spireCount; index += 1) {
    const height = randomBetween(random, 4, 9);
    const baseRadius = randomBetween(random, 0.7, 1.4);
    const { mesh, topY, radiusXZ } = buildRock(random, baseRadius, height / 2, baseRadius);
    mesh.position.set(
      randomBetween(random, -1.2, 1.2),
      height / 2,
      randomBetween(random, -1.2, 1.2)
    );
    mesh.rotation.set(
      randomBetween(random, -0.09, 0.09),
      random() * Math.PI * 2,
      randomBetween(random, -0.09, 0.09)
    );
    group.add(mesh);
    // One solid circle PER spire at its real footprint.
    obstacles.push({
      x: mesh.position.x,
      z: mesh.position.z,
      radius: radiusXZ * 0.8,
      height: mesh.position.y + topY,
    });
  }

  return { group, obstacles };
}
