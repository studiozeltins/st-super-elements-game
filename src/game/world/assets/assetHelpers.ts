import * as THREE from 'three';
import type { SeededRandom } from './types';

export function lambert(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color });
}

/**
 * Glossy material — a MeshPhongMaterial with a modest specular highlight that
 * tracks the moving sun (bright glint on the lit side, sweeping right→left across
 * the day) and catches warm lantern glints at night. For wood/metal/fabric props
 * that should not read dead-matte (benches, lantern posts, parasols, awnings).
 */
export function shiny(color: number, shininess = 34, specular = 0x5a5a5a): THREE.MeshPhongMaterial {
  return new THREE.MeshPhongMaterial({ color, shininess, specular, flatShading: true });
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
