import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { SeededRandom } from './types';
import { pickRandom } from './assetHelpers';

/**
 * Voxel-look building blocks: pure cell math (unit-testable) that approximates
 * spheres/cones/cylinders as hollow shells of grid cells, plus a mesh builder
 * that merges those cells into ONE geometry (one draw call per cluster).
 * Interior cells are skipped — they are never visible and would triple verts.
 */
export interface VoxelCell {
  x: number;
  y: number;
  z: number;
}

/**
 * Chunky-but-readable voxel size for a shape's largest dimension. Coarser than
 * the first cut (dim/6, cap 0.6): every shell cell is 24 verts redrawn into the
 * per-frame sun shadow map, and the finer grid tanked low-end GPUs.
 */
export function voxelSizeFor(largestDimension: number): number {
  return Math.min(0.75, Math.max(0.35, largestDimension / 4.5));
}

/** Generic shell scan: keep inside-cells that touch the outside via a 6-neighbor. */
function shellCells(
  inside: (x: number, y: number, z: number) => boolean,
  bounds: { minY: number; maxY: number; radius: number },
  voxelSize: number
): VoxelCell[] {
  const cells: VoxelCell[] = [];
  const half = voxelSize / 2;
  const start = -Math.ceil(bounds.radius / voxelSize) * voxelSize + half;
  for (let y = Math.floor(bounds.minY / voxelSize) * voxelSize + half; y <= bounds.maxY; y += voxelSize) {
    for (let x = start; x <= bounds.radius; x += voxelSize) {
      for (let z = start; z <= bounds.radius; z += voxelSize) {
        if (!inside(x, y, z)) continue;
        const isShell =
          !inside(x + voxelSize, y, z) ||
          !inside(x - voxelSize, y, z) ||
          !inside(x, y + voxelSize, z) ||
          !inside(x, y - voxelSize, z) ||
          !inside(x, y, z + voxelSize) ||
          !inside(x, y, z - voxelSize);
        if (isShell) cells.push({ x, y, z });
      }
    }
  }
  return cells;
}

/** Ellipsoid shell around the origin (yScale squashes vertically). */
export function sphereVoxelCells(radius: number, voxelSize: number, yScale = 1): VoxelCell[] {
  const inside = (x: number, y: number, z: number) =>
    x * x + z * z + (y / yScale) * (y / yScale) <= radius * radius;
  return shellCells(
    inside,
    { minY: -radius * yScale, maxY: radius * yScale, radius },
    voxelSize
  );
}

/** Axis-aligned box shell centered on the origin. */
export function boxVoxelCells(
  width: number,
  height: number,
  depth: number,
  voxelSize: number
): VoxelCell[] {
  const inside = (x: number, y: number, z: number) =>
    Math.abs(x) <= width / 2 && Math.abs(y) <= height / 2 && Math.abs(z) <= depth / 2;
  const radius = Math.max(width, depth) / 2;
  return shellCells(inside, { minY: -height / 2, maxY: height / 2, radius }, voxelSize);
}

/** Upright cone shell: base (radius) at y=0, apex at y=height. */
export function coneVoxelCells(baseRadius: number, height: number, voxelSize: number): VoxelCell[] {
  const inside = (x: number, y: number, z: number) => {
    if (y < 0 || y > height) return false;
    const layerRadius = baseRadius * (1 - y / height);
    return x * x + z * z <= layerRadius * layerRadius;
  };
  return shellCells(inside, { minY: 0, maxY: height, radius: baseRadius }, voxelSize);
}

/** Upright (tapered) cylinder shell: radiusBottom at y=0 → radiusTop at y=height. */
export function cylinderVoxelCells(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  voxelSize: number
): VoxelCell[] {
  const widest = Math.max(radiusTop, radiusBottom);
  const inside = (x: number, y: number, z: number) => {
    if (y < 0 || y > height) return false;
    const layerRadius = radiusBottom + (radiusTop - radiusBottom) * (y / height);
    return x * x + z * z <= layerRadius * layerRadius;
  };
  return shellCells(inside, { minY: 0, maxY: height, radius: widest }, voxelSize);
}

/** Highest cell top face — where a player standing on the cluster actually rests. */
export function voxelClusterTopY(cells: readonly VoxelCell[], voxelSize: number): number {
  let top = 0;
  for (const cell of cells) top = Math.max(top, cell.y + voxelSize / 2);
  return top;
}

// One material for every voxel cluster in the world — shades live in vertex colors.
const voxelMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

/**
 * Merge cells into a single mesh, dithering each cube across 2–3 palette
 * shades — that per-cube shade jitter is what reads as "voxel" without textures.
 */
export function buildVoxelCluster(
  cells: readonly VoxelCell[],
  voxelSize: number,
  colors: readonly number[],
  random: SeededRandom
): THREE.Mesh {
  const shade = new THREE.Color();
  const boxes = cells.map(cell => {
    const box = new THREE.BoxGeometry(voxelSize, voxelSize, voxelSize);
    box.translate(cell.x, cell.y, cell.z);
    shade.setHex(pickRandom(random, colors));
    const vertexCount = box.getAttribute('position').count;
    const channels = new Float32Array(vertexCount * 3);
    for (let index = 0; index < vertexCount; index += 1) {
      channels[index * 3] = shade.r;
      channels[index * 3 + 1] = shade.g;
      channels[index * 3 + 2] = shade.b;
    }
    box.setAttribute('color', new THREE.BufferAttribute(channels, 3));
    return box;
  });
  const merged = mergeGeometries(boxes, false);
  for (const box of boxes) box.dispose();
  return new THREE.Mesh(merged, voxelMaterial);
}
