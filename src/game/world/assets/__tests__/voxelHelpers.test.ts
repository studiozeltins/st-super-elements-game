import { describe, expect, it } from 'vitest';
import {
  coneVoxelCells,
  cylinderVoxelCells,
  sphereVoxelCells,
  voxelClusterTopY,
  voxelSizeFor,
  type VoxelCell,
} from '../voxelHelpers';

function expectShellProperty(
  cells: VoxelCell[],
  inside: (x: number, y: number, z: number) => boolean,
  voxelSize: number
) {
  for (const cell of cells) {
    expect(inside(cell.x, cell.y, cell.z)).toBe(true);
    const hasOutsideNeighbor =
      !inside(cell.x + voxelSize, cell.y, cell.z) ||
      !inside(cell.x - voxelSize, cell.y, cell.z) ||
      !inside(cell.x, cell.y + voxelSize, cell.z) ||
      !inside(cell.x, cell.y - voxelSize, cell.z) ||
      !inside(cell.x, cell.y, cell.z + voxelSize) ||
      !inside(cell.x, cell.y, cell.z - voxelSize);
    expect(hasOutsideNeighbor).toBe(true);
  }
}

describe('voxelSizeFor', () => {
  it('clamps to [0.3, 0.6]', () => {
    expect(voxelSizeFor(0.5)).toBe(0.3);
    expect(voxelSizeFor(3)).toBe(0.5);
    expect(voxelSizeFor(20)).toBe(0.6);
  });
});

describe('sphereVoxelCells', () => {
  const radius = 1.5;
  const voxelSize = 0.4;
  const yScale = 0.7;
  const cells = sphereVoxelCells(radius, voxelSize, yScale);
  const inside = (x: number, y: number, z: number) =>
    x * x + z * z + (y / yScale) * (y / yScale) <= radius * radius;

  it('produces a non-empty hollow shell inside the ellipsoid', () => {
    expect(cells.length).toBeGreaterThan(0);
    expectShellProperty(cells, inside, voxelSize);
  });

  it('stays within the squashed vertical bound', () => {
    for (const cell of cells) {
      expect(Math.abs(cell.y)).toBeLessThanOrEqual(radius * yScale);
      expect(Math.hypot(cell.x, cell.z)).toBeLessThanOrEqual(radius);
    }
  });

  it('is symmetric across the x axis', () => {
    const key = (cell: VoxelCell) => `${cell.x.toFixed(3)},${cell.y.toFixed(3)},${cell.z.toFixed(3)}`;
    const keys = new Set(cells.map(key));
    for (const cell of cells) {
      expect(keys.has(key({ x: -cell.x, y: cell.y, z: cell.z }))).toBe(true);
    }
  });
});

describe('coneVoxelCells', () => {
  const cells = coneVoxelCells(1.2, 3, 0.4);

  it('is non-empty, wider at the base than the top', () => {
    expect(cells.length).toBeGreaterThan(0);
    const bottom = cells.filter(cell => cell.y < 0.5);
    const top = cells.filter(cell => cell.y > 2.2);
    const maxSpread = (list: VoxelCell[]) =>
      Math.max(...list.map(cell => Math.hypot(cell.x, cell.z)));
    expect(maxSpread(bottom)).toBeGreaterThan(maxSpread(top));
  });

  it('keeps every cell inside the cone bounds', () => {
    for (const cell of cells) {
      expect(cell.y).toBeGreaterThanOrEqual(0);
      expect(cell.y).toBeLessThanOrEqual(3);
      expect(Math.hypot(cell.x, cell.z)).toBeLessThanOrEqual(1.2);
    }
  });
});

describe('cylinderVoxelCells', () => {
  it('respects the taper between bottom and top radius', () => {
    const cells = cylinderVoxelCells(0.4, 1, 2, 0.3);
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      const layerRadius = 1 + (0.4 - 1) * (cell.y / 2);
      expect(Math.hypot(cell.x, cell.z)).toBeLessThanOrEqual(layerRadius + 1e-9);
    }
  });
});

describe('voxelClusterTopY', () => {
  it('returns the top face of the highest cell', () => {
    const cells: VoxelCell[] = [
      { x: 0, y: 0.2, z: 0 },
      { x: 0, y: 1, z: 0 },
    ];
    expect(voxelClusterTopY(cells, 0.4)).toBeCloseTo(1.2);
  });
});
