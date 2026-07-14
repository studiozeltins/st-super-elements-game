import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createSeededRandom } from '../../rng';
import { createWind } from '../../../systems/createWind';
import { createCampFlag, createCanopyTree, initCanopyWind } from '../index';

/**
 * Wind-scoped material lifetime (CR-01/CR-02 regression suite).
 *
 * Flag and canopy materials are pooled per WIND INSTANCE, never per module:
 * a second game (StrictMode remount, prod reconnect) constructs a NEW wind,
 * and every pooled material must be rebuilt against the new uniform objects —
 * otherwise flags/canopies render on the dead first game's clock forever.
 * Within one wind lifetime the D-13 pooling win must survive: same wind in,
 * same material objects out.
 */

const capMaterial = (tree: { group: THREE.Group }): THREE.Material =>
  (tree.group.children[1] as THREE.Mesh).material as THREE.Material;

const flagMaterials = (flag: { group: THREE.Group }) => ({
  pole: (flag.group.children[0] as THREE.Mesh).material as THREE.Material,
  cloth: (flag.group.children[1] as THREE.Mesh).material as THREE.Material,
});

describe('canopy material pool lifetime', () => {
  it('re-injecting a DIFFERENT wind yields fresh cap materials', () => {
    const windA = createWind(true);
    initCanopyWind(windA);
    const first = capMaterial(createCanopyTree(createSeededRandom(1)));

    const windB = createWind(true);
    initCanopyWind(windB);
    const second = capMaterial(createCanopyTree(createSeededRandom(1)));

    expect(second).not.toBe(first);
  });

  it('re-injecting a different wind DISPOSES the orphaned pool materials', () => {
    const windA = createWind(true);
    initCanopyWind(windA);
    const first = capMaterial(createCanopyTree(createSeededRandom(1)));

    let disposed = false;
    first.addEventListener('dispose', () => {
      disposed = true;
    });

    initCanopyWind(createWind(true));
    expect(disposed).toBe(true);
  });

  it('re-injecting the SAME wind keeps the pool (D-13 pooling preserved)', () => {
    const wind = createWind(true);
    initCanopyWind(wind);
    const first = capMaterial(createCanopyTree(createSeededRandom(1)));

    initCanopyWind(wind);
    const second = capMaterial(createCanopyTree(createSeededRandom(1)));

    expect(second).toBe(first);
  });
});

describe('flag material cache lifetime', () => {
  it('a DIFFERENT wind yields fresh cloth AND pole materials', () => {
    const windA = createWind(true);
    const first = flagMaterials(createCampFlag(createSeededRandom(1), windA));

    const windB = createWind(true);
    const second = flagMaterials(createCampFlag(createSeededRandom(1), windB));

    expect(second.cloth).not.toBe(first.cloth);
    expect(second.pole).not.toBe(first.pole);
  });

  it('a different wind DISPOSES the previous cached materials', () => {
    const windA = createWind(true);
    const first = flagMaterials(createCampFlag(createSeededRandom(1), windA));

    let clothDisposed = false;
    let poleDisposed = false;
    first.cloth.addEventListener('dispose', () => {
      clothDisposed = true;
    });
    first.pole.addEventListener('dispose', () => {
      poleDisposed = true;
    });

    createCampFlag(createSeededRandom(1), createWind(true));
    expect(clothDisposed).toBe(true);
    expect(poleDisposed).toBe(true);
  });

  it('two flags built with the same wind share ONE cloth and ONE pole material', () => {
    const wind = createWind(true);
    const first = flagMaterials(createCampFlag(createSeededRandom(1), wind));
    const second = flagMaterials(createCampFlag(createSeededRandom(2), wind));

    expect(second.cloth).toBe(first.cloth);
    expect(second.pole).toBe(first.pole);
  });
});

describe('canopy aTreeHeight attribute (WR-02 — sway ramps on height above the TREE BASE)', () => {
  const capMeshes = (tree: { group: THREE.Group }): THREE.Mesh[] =>
    tree.group.children.slice(1) as THREE.Mesh[];

  it('every cap carries an aTreeHeight attribute matching the position count', () => {
    initCanopyWind(createWind(true));
    const caps = capMeshes(createCanopyTree(createSeededRandom(1)));
    expect(caps.length).toBeGreaterThanOrEqual(1);
    for (const cap of caps) {
      const heights = cap.geometry.getAttribute('aTreeHeight');
      expect(heights).toBeDefined();
      expect(heights.itemSize).toBe(1);
      expect(heights.count).toBe(cap.geometry.getAttribute('position').count);
    }
  });

  it('heights vary within one tree and are all finite — the ramp has span', () => {
    initCanopyWind(createWind(true));
    const caps = capMeshes(createCanopyTree(createSeededRandom(1)));
    let min = Infinity;
    let max = -Infinity;
    for (const cap of caps) {
      const heights = cap.geometry.getAttribute('aTreeHeight');
      for (let index = 0; index < heights.count; index += 1) {
        const value = heights.getX(index);
        expect(Number.isFinite(value)).toBe(true);
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    }
    expect(max - min).toBeGreaterThan(1);
  });

  it('the highest cap layer reaches higher above the base than the lowest', () => {
    initCanopyWind(createWind(true));
    const caps = capMeshes(createCanopyTree(createSeededRandom(1)));
    const maxHeight = (cap: THREE.Mesh): number => {
      const heights = cap.geometry.getAttribute('aTreeHeight');
      let max = -Infinity;
      for (let index = 0; index < heights.count; index += 1) {
        max = Math.max(max, heights.getX(index));
      }
      return max;
    };
    expect(maxHeight(caps[caps.length - 1])).toBeGreaterThan(maxHeight(caps[0]));
  });

  it('is deterministic: two trees from the same seed bake identical heights', () => {
    initCanopyWind(createWind(true));
    const first = capMeshes(createCanopyTree(createSeededRandom(1)));
    const second = capMeshes(createCanopyTree(createSeededRandom(1)));
    expect(first.length).toBe(second.length);
    for (let cap = 0; cap < first.length; cap += 1) {
      const a = first[cap].geometry.getAttribute('aTreeHeight');
      const b = second[cap].geometry.getAttribute('aTreeHeight');
      expect(Array.from(a.array as Float32Array)).toEqual(Array.from(b.array as Float32Array));
    }
  });
});
