import * as THREE from 'three';
import type { SeededRandom, WorldAsset } from './types';
import { lambert, randomBetween, randomIntBetween } from './assetHelpers';

const TRUNK_COLOR = 0x6b4a2f;
const CANOPY_ORANGE = 0xe8722f;
const CANOPY_ORANGE_DEEP = 0xd8621f;
const CANOPY_GREEN = 0x4f9147;
const CANOPY_GREEN_LIGHT = 0x58a24f;

export function createCanopyTree(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();
  const totalHeight = randomBetween(random, 5, 7);
  const trunkHeight = totalHeight * 0.55;

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.55, trunkHeight, 5),
    lambert(TRUNK_COLOR)
  );
  trunk.position.y = trunkHeight / 2;
  trunk.rotation.y = random() * Math.PI * 2;
  trunk.castShadow = true;
  group.add(trunk);

  const isOrange = random() < 0.3;
  const canopyColors = isOrange
    ? [CANOPY_ORANGE_DEEP, CANOPY_ORANGE]
    : [CANOPY_GREEN, CANOPY_GREEN_LIGHT];
  const canopyLayers = randomIntBetween(random, 2, 3);

  let layerHeight = trunkHeight * 0.9;
  let layerRadius = randomBetween(random, 2.2, 3);
  for (let index = 0; index < canopyLayers; index += 1) {
    const cap = new THREE.Mesh(
      new THREE.IcosahedronGeometry(layerRadius, 0),
      lambert(canopyColors[index % canopyColors.length])
    );
    cap.scale.y = 0.55;
    cap.position.set(
      randomBetween(random, -0.2, 0.2),
      layerHeight,
      randomBetween(random, -0.2, 0.2)
    );
    cap.rotation.y = random() * Math.PI * 2;
    cap.castShadow = true;
    group.add(cap);

    layerHeight += layerRadius * 0.45;
    layerRadius *= 0.72;
  }

  return { group };
}
