import * as THREE from 'three';
import type { SeededRandom, WorldAsset } from './types';
import { lambert, randomBetween, randomIntBetween } from './assetHelpers';

const GRASS_COLOR = 0x67b35a;

export function createGrassTuft(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();
  const bladeCount = randomIntBetween(random, 3, 5);
  const bladeMaterial = lambert(GRASS_COLOR);

  for (let index = 0; index < bladeCount; index += 1) {
    const bladeHeight = randomBetween(random, 0.25, 0.5);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, bladeHeight, 0.05), bladeMaterial);
    blade.position.set(
      randomBetween(random, -0.15, 0.15),
      bladeHeight / 2,
      randomBetween(random, -0.15, 0.15)
    );
    blade.rotation.set(
      randomBetween(random, -0.35, 0.35),
      random() * Math.PI * 2,
      randomBetween(random, -0.35, 0.35)
    );
    group.add(blade);
  }

  return { group };
}
