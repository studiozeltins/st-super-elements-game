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
    new THREE.BoxGeometry(0.14, stemHeight, 0.14),
    lambert(STEM_COLOR)
  );
  stem.position.y = stemHeight / 2;
  group.add(stem);

  // Stepped two-box cap — the voxel read at this tiny scale.
  const isRedCap = random() < 0.5;
  const capMaterial = lambert(isRedCap ? CAP_RED : CAP_TAN);
  const capHeight = capRadius * 0.55;
  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(capRadius * 2, capHeight, capRadius * 2),
    capMaterial
  );
  cap.position.y = stemHeight + capHeight / 2;
  cap.rotation.y = random() * Math.PI * 2;
  group.add(cap);
  const capTop = new THREE.Mesh(
    new THREE.BoxGeometry(capRadius * 1.2, capHeight * 0.7, capRadius * 1.2),
    capMaterial
  );
  capTop.position.y = stemHeight + capHeight + capHeight * 0.35;
  capTop.rotation.y = cap.rotation.y;
  group.add(capTop);

  if (isRedCap && random() < 0.7) {
    const dotCount = randomIntBetween(random, 2, 4);
    const dotMaterial = lambert(0xffffff);
    for (let index = 0; index < dotCount; index += 1) {
      const dotAngle = random() * Math.PI * 2;
      const dot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.05), dotMaterial);
      dot.position.set(
        Math.cos(dotAngle) * capRadius * 0.5,
        stemHeight + capHeight + 0.02,
        Math.sin(dotAngle) * capRadius * 0.5
      );
      group.add(dot);
    }
  }

  return { group };
}
