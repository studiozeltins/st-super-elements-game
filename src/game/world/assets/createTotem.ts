import * as THREE from 'three';
import type { SeededRandom, WorldAsset } from './types';
import { lambert, pickRandom, randomBetween, randomIntBetween } from './assetHelpers';

const WOOD_SHADES = [0x6b4a2f, 0x8a5a3a, 0x7a5233] as const;
const EYE_COLOR = 0x2a2420;
const HORN_COLOR = 0xe8dcc8;

export function createTotem(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();
  const blockCount = randomIntBetween(random, 3, 4);
  const blockSize = randomBetween(random, 0.7, 0.9);

  let stackHeight = 0;
  let topBlockSize = blockSize;
  for (let index = 0; index < blockCount; index += 1) {
    const blockHeight = blockSize * randomBetween(random, 0.7, 1);
    const blockWidth = blockSize * randomBetween(random, 0.85, 1.05);
    topBlockSize = blockWidth;
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(blockWidth, blockHeight, blockWidth),
      lambert(pickRandom(random, WOOD_SHADES))
    );
    block.position.y = stackHeight + blockHeight / 2;
    block.rotation.y = randomBetween(random, -0.12, 0.12);
    block.castShadow = true;
    group.add(block);

    const eyeMaterial = lambert(EYE_COLOR);
    const eyeOffset = blockWidth * 0.22;
    for (const eyeSide of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.06), eyeMaterial);
      eye.position.set(
        eyeSide * eyeOffset,
        stackHeight + blockHeight * 0.62,
        blockWidth / 2 + 0.02
      );
      eye.rotation.y = block.rotation.y;
      group.add(eye);
    }

    stackHeight += blockHeight;
  }

  const hornMaterial = lambert(HORN_COLOR);
  for (const hornSide of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.12), hornMaterial);
    horn.position.set(hornSide * topBlockSize * 0.4, stackHeight + 0.16, 0);
    horn.rotation.z = -hornSide * 0.35;
    group.add(horn);
  }

  group.rotation.y = random() * Math.PI * 2;

  return { group };
}
