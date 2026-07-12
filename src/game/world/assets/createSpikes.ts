import * as THREE from 'three';
import type { SeededRandom, WorldAsset } from './types';
import { lambert, pickRandom, randomBetween, randomIntBetween } from './assetHelpers';

const SPIKE_COLORS = [0xe8dcc8, 0x8a5a3a] as const;

export function createSpikes(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();
  const spikeCount = randomIntBetween(random, 4, 6);

  for (let index = 0; index < spikeCount; index += 1) {
    const spikeHeight = randomBetween(random, 0.6, 1.1);
    const material = lambert(pickRandom(random, SPIKE_COLORS));
    // Two-box mini pyramid: fat base, thin tip.
    const spike = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, spikeHeight * 0.6, 0.16),
      material
    );
    base.position.y = spikeHeight * 0.3;
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.08, spikeHeight * 0.4, 0.08), material);
    tip.position.y = spikeHeight * 0.8;
    spike.add(base, tip);
    spike.position.set(
      randomBetween(random, -0.6, 0.6),
      -spikeHeight * 0.08,
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
