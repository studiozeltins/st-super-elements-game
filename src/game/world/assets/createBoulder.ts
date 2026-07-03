import * as THREE from 'three';
import type { SeededRandom, WorldAsset } from './types';
import { lambert, randomBetween, randomIntBetween } from './assetHelpers';

const SLATE_DARK = 0x3d4654;
const SLATE_MID = 0x5a6678;
const SLATE_LIGHT = 0x8a94a4;

export function createBoulder(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();
  const chunkCount = randomIntBetween(random, 1, 3);
  const baseRadius = randomBetween(random, 1.2, 2.4);
  const facetColors = [SLATE_DARK, SLATE_MID, SLATE_LIGHT];

  let stackTopHeight = 0;
  let radius = baseRadius;
  let topChunkRadius = baseRadius;
  for (let index = 0; index < chunkCount; index += 1) {
    const isTopChunk = index === chunkCount - 1;
    const color = isTopChunk ? SLATE_LIGHT : facetColors[index % facetColors.length];
    const chunk = new THREE.Mesh(new THREE.DodecahedronGeometry(radius, 0), lambert(color));
    chunk.scale.y = 0.7;
    const halfHeight = radius * 0.7;
    chunk.position.set(
      randomBetween(random, -0.15, 0.15) * baseRadius,
      stackTopHeight + halfHeight * 0.75,
      randomBetween(random, -0.15, 0.15) * baseRadius
    );
    chunk.rotation.y = random() * Math.PI * 2;
    chunk.castShadow = true;
    group.add(chunk);

    stackTopHeight = chunk.position.y + halfHeight * 0.8;
    topChunkRadius = radius;
    radius *= randomBetween(random, 0.6, 0.8);
  }

  return {
    group,
    // Standable area is the TOP chunk, not the base — otherwise players float.
    platformRadius: topChunkRadius * 0.8,
    platformTopHeight: stackTopHeight,
  };
}
