import * as THREE from 'three';
import type { SeededRandom, WorldAsset } from './types';
import { lambert, randomBetween, randomIntBetween } from './assetHelpers';

const TRUNK_COLOR = 0x8a5a3a;
const LEAF_COLOR = 0x4fa83d;

export function createPalmTree(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();
  const segmentCount = 3;
  const segmentHeight = randomBetween(random, 1.3, 1.7);
  const curveDirection = random() * Math.PI * 2;
  const curveStrength = randomBetween(random, 0.1, 0.22);

  const trunkMaterial = lambert(TRUNK_COLOR);
  const crownPosition = new THREE.Vector3(0, 0, 0);
  for (let index = 0; index < segmentCount; index += 1) {
    const tilt = curveStrength * (index + 1);
    const segment = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16 - index * 0.02, 0.2 - index * 0.02, segmentHeight, 5),
      trunkMaterial
    );
    segment.position.set(
      crownPosition.x + Math.cos(curveDirection) * Math.sin(tilt) * segmentHeight * 0.5,
      crownPosition.y + Math.cos(tilt) * segmentHeight * 0.5,
      crownPosition.z + Math.sin(curveDirection) * Math.sin(tilt) * segmentHeight * 0.5
    );
    segment.rotation.set(Math.sin(curveDirection) * tilt, 0, -Math.cos(curveDirection) * tilt);
    segment.castShadow = true;
    group.add(segment);

    crownPosition.set(
      crownPosition.x + Math.cos(curveDirection) * Math.sin(tilt) * segmentHeight,
      crownPosition.y + Math.cos(tilt) * segmentHeight,
      crownPosition.z + Math.sin(curveDirection) * Math.sin(tilt) * segmentHeight
    );
  }

  const leafCount = randomIntBetween(random, 5, 6);
  const leafMaterial = lambert(LEAF_COLOR);
  for (let index = 0; index < leafCount; index += 1) {
    const leafAngle = (index / leafCount) * Math.PI * 2 + random() * 0.5;
    const leafLength = randomBetween(random, 1.6, 2.2);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(leafLength, 0.06, 0.42), leafMaterial);
    leaf.position.set(
      crownPosition.x + Math.cos(leafAngle) * leafLength * 0.45,
      crownPosition.y + 0.1,
      crownPosition.z + Math.sin(leafAngle) * leafLength * 0.45
    );
    leaf.rotation.y = -leafAngle;
    leaf.rotation.z = randomBetween(random, -0.5, -0.25);
    leaf.castShadow = true;
    group.add(leaf);
  }

  return { group };
}
