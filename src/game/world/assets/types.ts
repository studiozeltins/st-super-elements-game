import * as THREE from 'three';

export type SeededRandom = () => number; // [0,1)

export interface WorldAsset {
  group: THREE.Group;
  /** Present when players can stand on top (climbable). */
  platformRadius?: number;
  platformTopHeight?: number;
}
