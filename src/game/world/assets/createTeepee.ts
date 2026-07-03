import * as THREE from 'three';
import type { SeededRandom, WorldAsset } from './types';
import { lambert, pickRandom, randomBetween, randomIntBetween } from './assetHelpers';

const CANVAS_COLOR = 0xe8dcc8;
const POLE_COLOR = 0x6b4a2f;
const DOORWAY_COLOR = 0x2a2420;
const TRIM_COLORS = [0xd84a3a, 0x4a7ab0, 0xe8722f] as const;

export function createTeepee(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();
  const teepeeHeight = randomBetween(random, 3, 3.8);
  const baseRadius = teepeeHeight * 0.55;

  const canvas = new THREE.Mesh(
    new THREE.ConeGeometry(baseRadius, teepeeHeight, 6),
    lambert(CANVAS_COLOR)
  );
  canvas.position.y = teepeeHeight / 2;
  canvas.castShadow = true;
  group.add(canvas);

  const trimHeight = teepeeHeight * 0.14;
  const trimBottomY = 0.25;
  const coneRadiusAt = (height: number): number => baseRadius * (1 - height / teepeeHeight);
  const trim = new THREE.Mesh(
    new THREE.CylinderGeometry(
      coneRadiusAt(trimBottomY + trimHeight) + 0.05,
      coneRadiusAt(trimBottomY) + 0.05,
      trimHeight,
      6,
      1,
      true
    ),
    lambert(pickRandom(random, TRIM_COLORS))
  );
  trim.position.y = trimBottomY + trimHeight / 2;
  group.add(trim);

  const poleCount = randomIntBetween(random, 2, 3);
  const poleMaterial = lambert(POLE_COLOR);
  for (let index = 0; index < poleCount; index += 1) {
    const poleAngle = (index / poleCount) * Math.PI * 2 + random() * 0.8;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 5), poleMaterial);
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
