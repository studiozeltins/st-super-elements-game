import * as THREE from 'three';
import type { SeededRandom } from './types';

export function lambert(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color });
}

export function randomBetween(random: SeededRandom, min: number, max: number): number {
  return min + random() * (max - min);
}

export function randomIntBetween(random: SeededRandom, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

export function pickRandom<T>(random: SeededRandom, items: readonly T[]): T {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}

export function tiltRandomly(
  object: THREE.Object3D,
  random: SeededRandom,
  maxRadians: number
): void {
  object.rotation.x = randomBetween(random, -maxRadians, maxRadians);
  object.rotation.z = randomBetween(random, -maxRadians, maxRadians);
  object.rotation.y = random() * Math.PI * 2;
}
