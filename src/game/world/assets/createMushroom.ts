import * as THREE from 'three';
import type { SeededRandom, WorldAsset } from './types';
import { lambert, randomBetween, randomIntBetween } from './assetHelpers';

const STEM_COLOR = 0xe8dcc8;
const CAP_RED = 0xd84a3a;
const CAP_TAN = 0xd8b48a;

export function createMushroom(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();
  const stemHeight = randomBetween(random, 0.18, 0.32);
  const capRadius = randomBetween(random, 0.16, 0.3);

  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.09, stemHeight, 6),
    lambert(STEM_COLOR)
  );
  stem.position.y = stemHeight / 2;
  group.add(stem);

  const isRedCap = random() < 0.5;
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(capRadius, 7, 5),
    lambert(isRedCap ? CAP_RED : CAP_TAN)
  );
  cap.scale.y = 0.55;
  cap.position.y = stemHeight + capRadius * 0.25;
  group.add(cap);

  if (isRedCap && random() < 0.7) {
    const dotCount = randomIntBetween(random, 2, 4);
    const dotMaterial = lambert(0xffffff);
    for (let index = 0; index < dotCount; index += 1) {
      const dotAngle = random() * Math.PI * 2;
      const dot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.05), dotMaterial);
      dot.position.set(
        Math.cos(dotAngle) * capRadius * 0.5,
        cap.position.y + capRadius * 0.42,
        Math.sin(dotAngle) * capRadius * 0.5
      );
      group.add(dot);
    }
  }

  return { group };
}
