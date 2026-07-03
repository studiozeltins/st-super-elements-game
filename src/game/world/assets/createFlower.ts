import * as THREE from 'three';
import type { SeededRandom, WorldAsset } from './types';
import { lambert, pickRandom, randomBetween } from './assetHelpers';

const STEM_COLOR = 0x4f9147;
const PETAL_COLORS = [0xffe066, 0xff6b9d, 0xb06bff, 0xffffff] as const;

export function createFlower(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();
  const stemHeight = randomBetween(random, 0.3, 0.5);

  const stem = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, stemHeight, 0.04),
    lambert(STEM_COLOR)
  );
  stem.position.y = stemHeight / 2;

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.12, 0.16),
    lambert(pickRandom(random, PETAL_COLORS))
  );
  head.position.y = stemHeight + 0.05;
  head.rotation.y = random() * Math.PI * 2;

  group.add(stem, head);
  group.rotation.z = randomBetween(random, -0.15, 0.15);

  return { group };
}
