import * as THREE from 'three';
import type { SeededRandom, WorldAsset } from './types';
import { lambert, pickRandom, randomBetween, randomIntBetween } from './assetHelpers';

const BUSH_GREENS = [0x58a24f, 0x4f9147, 0x67b35a] as const;

export function createBush(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();
  const clumpCount = randomIntBetween(random, 2, 3);

  for (let index = 0; index < clumpCount; index += 1) {
    const radius = randomBetween(random, 0.45, 0.8);
    const clump = new THREE.Mesh(
      new THREE.IcosahedronGeometry(radius, 0),
      lambert(pickRandom(random, BUSH_GREENS))
    );
    clump.scale.y = 0.65;
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
