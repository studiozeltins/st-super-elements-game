import * as THREE from 'three';

export type SeededRandom = () => number; // [0,1)

/** One standable disc, in asset-local coordinates (offset from the anchor). */
export interface AssetPlatform {
  x: number;
  z: number;
  radius: number;
  topHeight: number;
}

/** One solid circle, in asset-local coordinates (offset from the anchor). */
export interface AssetObstacle {
  x: number;
  z: number;
  radius: number;
  /** Solid span above the ground — see ObstacleCircle.height. */
  height?: number;
}

export interface WorldAsset {
  group: THREE.Group;
  /**
   * Present when players can stand on top (climbable). One entry per standable
   * level — a stacked boulder lists EVERY chunk top, not just the summit,
   * otherwise landing on a lower chunk falls straight through to the terrain.
   */
  platforms?: AssetPlatform[];
  /**
   * Solid footprints matching where the asset ACTUALLY stands. A rock-spire
   * cluster spreads spires off-anchor — one center circle left walk-through
   * gaps, so assets with sprawl declare a circle per solid piece.
   */
  obstacles?: AssetObstacle[];
}
