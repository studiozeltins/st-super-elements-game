import * as THREE from 'three';
import type { SeededRandom, WorldAsset } from './types';
import { lambert, pickRandom, randomBetween, randomIntBetween } from './assetHelpers';

const SPIRE_COLORS = [0x3d4654, 0x5a6678, 0x8a94a4] as const;

export function createRockSpire(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();
  const spireCount = randomIntBetween(random, 2, 4);

  for (let index = 0; index < spireCount; index += 1) {
    const height = randomBetween(random, 4, 9);
    const baseRadius = randomBetween(random, 0.7, 1.4);
    const radialSegments = randomIntBetween(random, 5, 6);
    const spire = new THREE.Mesh(
      new THREE.CylinderGeometry(baseRadius * 0.15, baseRadius, height, radialSegments),
      lambert(pickRandom(random, SPIRE_COLORS))
    );
    spire.position.set(
      randomBetween(random, -1.2, 1.2),
      height / 2,
      randomBetween(random, -1.2, 1.2)
    );
    spire.rotation.set(
      randomBetween(random, -0.09, 0.09),
      random() * Math.PI * 2,
      randomBetween(random, -0.09, 0.09)
    );
    spire.castShadow = true;
    group.add(spire);
  }

  return { group };
}
