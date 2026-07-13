import * as THREE from 'three';
import type { SeededRandom, WorldAsset } from './types';
import { lambert, randomBetween } from './assetHelpers';

const POST_COLOR = 0x6b4a2f;
const BEAM_COLOR = 0x8a5a3a;

export function createWoodenArch(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();
  const archHeight = randomBetween(random, 3.2, 4);
  const archHalfWidth = randomBetween(random, 1.4, 1.8);

  const postMaterial = lambert(POST_COLOR);
  for (const postSide of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, archHeight, 0.3), postMaterial);
    post.position.set(postSide * archHalfWidth, archHeight / 2, 0);
    post.rotation.z = -postSide * randomBetween(random, 0.02, 0.06);
    post.castShadow = true;
    group.add(post);
  }

  const beamMaterial = lambert(BEAM_COLOR);
  const beamLength = archHalfWidth * 0.85;
  const beamTilts = [0.4, 0, -0.4];
  for (let index = 0; index < beamTilts.length; index += 1) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(beamLength, 0.18, 0.24), beamMaterial);
    beam.position.set(
      (index - 1) * archHalfWidth * 0.68,
      archHeight + Math.cos(beamTilts[index]) * 0.22 - 0.1,
      0
    );
    beam.rotation.z = beamTilts[index];
    beam.castShadow = true;
    group.add(beam);
  }

  group.rotation.y = random() * Math.PI * 2;

  return { group };
}
