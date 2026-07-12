import * as THREE from 'three';
import type { SeededRandom, WorldAsset } from './types';
import { lambert, pickRandom, randomBetween, randomIntBetween } from './assetHelpers';
import { buildVoxelCluster, coneVoxelCells, voxelSizeFor } from './voxelHelpers';

const CANVAS_COLOR = 0xe8dcc8;
const CANVAS_SHADE = 0xd8ccb8;
const POLE_COLOR = 0x6b4a2f;
const DOORWAY_COLOR = 0x2a2420;
const TRIM_COLORS = [0xd84a3a, 0x4a7ab0, 0xe8722f] as const;

export function createTeepee(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();
  const teepeeHeight = randomBetween(random, 3, 3.8);
  const baseRadius = teepeeHeight * 0.55;

  const voxelSize = voxelSizeFor(teepeeHeight);
  const canvas = buildVoxelCluster(
    coneVoxelCells(baseRadius, teepeeHeight, voxelSize),
    voxelSize,
    [CANVAS_COLOR, CANVAS_SHADE],
    random
  );
  canvas.castShadow = true;
  group.add(canvas);

  // Trim band: a ring of small boxes hugging the cone near the base.
  const trimMaterial = lambert(pickRandom(random, TRIM_COLORS));
  const trimY = 0.45;
  const trimRadius = baseRadius * (1 - trimY / teepeeHeight) + voxelSize * 0.35;
  const trimSegments = 8;
  for (let index = 0; index < trimSegments; index += 1) {
    const angle = (index / trimSegments) * Math.PI * 2;
    const segment = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 0.18), trimMaterial);
    segment.position.set(Math.cos(angle) * trimRadius, trimY, Math.sin(angle) * trimRadius);
    segment.rotation.y = -angle + Math.PI / 2;
    group.add(segment);
  }

  const poleCount = randomIntBetween(random, 2, 3);
  const poleMaterial = lambert(POLE_COLOR);
  for (let index = 0; index < poleCount; index += 1) {
    const poleAngle = (index / poleCount) * Math.PI * 2 + random() * 0.8;
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.4, 0.08), poleMaterial);
    pole.position.set(
      Math.cos(poleAngle) * 0.18,
      teepeeHeight + 0.25,
      Math.sin(poleAngle) * 0.18
    );
    pole.rotation.set(Math.sin(poleAngle) * 0.28, 0, -Math.cos(poleAngle) * 0.28);
    group.add(pole);
  }

  const doorway = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 1.1, 0.1),
    lambert(DOORWAY_COLOR)
  );
  doorway.position.set(0, 0.55, baseRadius * 0.82);
  group.add(doorway);

  group.rotation.y = random() * Math.PI * 2;

  return { group };
}
