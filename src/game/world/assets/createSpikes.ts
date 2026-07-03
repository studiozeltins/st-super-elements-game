import * as THREE from 'three';
import type { SeededRandom, WorldAsset } from './types';
import { lambert, pickRandom, randomBetween, randomIntBetween } from './assetHelpers';

const SPIKE_COLORS = [0xe8dcc8, 0x8a5a3a] as const;

export function createSpikes(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();
  const spikeCount = randomIntBetween(random, 4, 6);

  for (let index = 0; index < spikeCount; index += 1) {
    const spikeHeight = randomBetween(random, 0.6, 1.1);
    const spike = new THREE.Mesh(
      new THREE.ConeGeometry(0.1, spikeHeight, 4),
      lambert(pickRandom(random, SPIKE_COLORS))
    );
    spike.position.set(
      randomBetween(random, -0.6, 0.6),
      spikeHeight * 0.42,
      randomBetween(random, -0.6, 0.6)
    );
    spike.rotation.set(
      randomBetween(random, -0.4, 0.4),
      random() * Math.PI * 2,
      randomBetween(random, -0.4, 0.4)
    );
    spike.castShadow = true;
    group.add(spike);
  }

  return { group };
}
