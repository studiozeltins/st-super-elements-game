import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createSeededRandom } from '../../rng';
import {
  createBoulder,
  createBush,
  createCampfire,
  createCanopyTree,
  createFlower,
  createMushroom,
  createPalmTree,
  createRockSpire,
  createSpikes,
  createTeepee,
  createTotem,
  createWoodenArch,
  type SeededRandom,
  type WorldAsset,
} from '../index';

type AssetFactory = (random: SeededRandom) => WorldAsset;

/** Every factory exported from assets/index.ts. Only the boulder is climbable. */
const FACTORIES: Record<string, { create: AssetFactory; climbable: boolean }> = {
  createBoulder: { create: createBoulder, climbable: true },
  createRockSpire: { create: createRockSpire, climbable: false },
  createCanopyTree: { create: createCanopyTree, climbable: false },
  createPalmTree: { create: createPalmTree, climbable: false },
  createBush: { create: createBush, climbable: false },
  createFlower: { create: createFlower, climbable: false },
  createMushroom: { create: createMushroom, climbable: false },
  createTeepee: { create: createTeepee, climbable: false },
  createTotem: { create: createTotem, climbable: false },
  createCampfire: { create: createCampfire, climbable: false },
  createSpikes: { create: createSpikes, climbable: false },
  createWoodenArch: { create: createWoodenArch, climbable: false },
};

const FACTORY_ENTRIES = Object.entries(FACTORIES).map(
  ([name, { create, climbable }]) => [name, create, climbable] as const
);

describe.each(FACTORY_ENTRIES)('%s', (_name, create, climbable) => {
  it('returns a THREE.Group with at least one child', () => {
    const asset = create(createSeededRandom(1));
    expect(asset.group).toBeInstanceOf(THREE.Group);
    expect(asset.group.children.length).toBeGreaterThanOrEqual(1);
  });

  it('is deterministic: two builds with the same fresh seed match', () => {
    const first = create(createSeededRandom(1));
    const second = create(createSeededRandom(1));
    expect(first.group.children.length).toBe(second.group.children.length);
    expect(first.group.children[0].position.toArray()).toEqual(
      second.group.children[0].position.toArray()
    );
  });

  if (climbable) {
    it('exposes a standable platform (positive radius and top height)', () => {
      const asset = create(createSeededRandom(1));
      expect(asset.platformRadius).toBeGreaterThan(0);
      expect(asset.platformTopHeight).toBeGreaterThan(0);
    });
  } else {
    it('is not climbable: platform fields stay undefined', () => {
      const asset = create(createSeededRandom(1));
      expect(asset.platformRadius).toBeUndefined();
      expect(asset.platformTopHeight).toBeUndefined();
    });
  }
});
