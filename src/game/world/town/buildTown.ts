import * as THREE from 'three';
import type { SeededRandom, WorldAsset } from '../assets/types';
import {
  createBarrel,
  createBench,
  createBush,
  createCafeTable,
  createCanopyTree,
  createCart,
  createCrate,
  createFlower,
  createGrassTuft,
  createMarketStall,
  createPlanter,
} from '../assets';
import { createCafeBuilding, createChurch, createHouse } from './createBuildings';
import { createTownGround } from './createTownGround';
import { TOWN_DISTRICTS, TOWN_HALF_EXTENT, type District } from './townPlan';

/**
 * Assembles the whole town from the TOWN_DISTRICTS data: lays each district's
 * paved ground, then populates it by kind (houses / market stalls / garden
 * greenery / cafe / church). New districts added to townPlan.ts flow through here
 * automatically; a new KIND just needs a branch in populate().
 *
 * All world mutation goes through the injected callbacks so this stays decoupled
 * from createMondstadtWorld's internal obstacle/platform bookkeeping.
 */
export interface TownBuildContext {
  group: THREE.Group;
  random: SeededRandom;
  /** Place a decor asset at (x,z) on the terrain, optional collision radius. */
  placeAsset: (asset: WorldAsset, x: number, z: number, collisionRadius?: number) => void;
  /** Add a self-positioned building object and register its footprint obstacle. */
  addBuilding: (object: THREE.Object3D, x: number, z: number, radius: number) => void;
  /** False where a prop/building must not go (e.g. on the road). */
  isClear: (x: number, z: number) => boolean;
}

export function buildTown(ctx: TownBuildContext): void {
  // One unified cobble ground; then populate each district by kind.
  ctx.group.add(createTownGround(TOWN_DISTRICTS));
  for (const district of TOWN_DISTRICTS) {
    populate(ctx, district);
  }
  seedSeamGrass(ctx);
}

/**
 * Grass tufts sprouting from cobble cracks — concentrated in the LESS-WALKED
 * outer town (probability grows with distance from the center), sparse near the
 * busy plaza. Skips the road. Small walk-through decor.
 */
function seedSeamGrass(ctx: TownBuildContext): void {
  const half = TOWN_HALF_EXTENT;
  let placed = 0;
  let attempts = 0;
  while (placed < 30 && attempts < 250) {
    attempts += 1;
    const x = (ctx.random() * 2 - 1) * half;
    const z = (ctx.random() * 2 - 1) * half;
    const edginess = Math.max(Math.abs(x), Math.abs(z)) / half; // 0 center → 1 edge
    if (ctx.random() > edginess * edginess) continue; // denser toward the edge
    if (!ctx.isClear(x, z)) continue;
    ctx.placeAsset(createGrassTuft(ctx.random), x, z);
    placed += 1;
  }
}

/** Random point inside a district, inset from its edge. */
function spot(random: SeededRandom, d: District, inset: number): { x: number; z: number } {
  const range = d.half - inset;
  return {
    x: d.cx + (random() * 2 - 1) * range,
    z: d.cz + (random() * 2 - 1) * range,
  };
}

/** Scatter `count` assets in a district, skipping blocked/road spots. */
function scatter(
  ctx: TownBuildContext,
  d: District,
  count: number,
  make: (r: SeededRandom) => WorldAsset,
  inset: number,
  collisionRadius?: number
): void {
  let placed = 0;
  let attempts = 0;
  while (placed < count && attempts < count * 8) {
    attempts += 1;
    const p = spot(ctx.random, d, inset);
    if (!ctx.isClear(p.x, p.z)) continue;
    ctx.placeAsset(make(ctx.random), p.x, p.z, collisionRadius);
    placed += 1;
  }
}

function populate(ctx: TownBuildContext, d: District): void {
  const { random } = ctx;
  switch (d.kind) {
    case 'housing': {
      // A 2×2 block of houses facing the town center, on the interior corners.
      const off = d.half * 0.5;
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const x = d.cx + sx * off;
          const z = d.cz + sz * off;
          if (!ctx.isClear(x, z)) continue;
          const scale = 0.9 + random() * 0.3;
          const house = createHouse(random, x, z, 0, 0, scale);
          ctx.addBuilding(house, x, z, 2.8 * scale);
        }
      }
      break;
    }
    case 'market': {
      scatter(ctx, d, 3, createMarketStall, 2.5);
      scatter(ctx, d, 4, createCrate, 1.5);
      scatter(ctx, d, 3, createBarrel, 1.5);
      break;
    }
    case 'garden': {
      scatter(ctx, d, 3, createCanopyTree, 2.5, 1.0);
      scatter(ctx, d, 6, createBush, 1.5);
      scatter(ctx, d, 10, createFlower, 1.0);
      scatter(ctx, d, 3, createBench, 1.5);
      scatter(ctx, d, 3, createPlanter, 1.5);
      break;
    }
    case 'cafe': {
      // One cafe building near the back, tables + planters out front.
      const bx = d.cx;
      const bz = d.cz - d.half * 0.45;
      if (ctx.isClear(bx, bz)) {
        const cafe = createCafeBuilding(random, bx, bz, d.cx, d.cz + 1);
        ctx.addBuilding(cafe, bx, bz, 2.6);
      }
      scatter(ctx, d, 4, createCafeTable, 2.0);
      scatter(ctx, d, 3, createPlanter, 1.5);
      break;
    }
    case 'civic': {
      const cx = d.cx;
      const cz = d.cz;
      const church = createChurch(random, cx, cz, 0, 0);
      ctx.addBuilding(church, cx, cz, 4.0);
      break;
    }
    case 'plaza': {
      // Four benches in a SQUARE around the fountain (at the district center),
      // each facing the water — deliberate seating, not random scatter.
      const benchRadius = 4.3;
      for (let i = 0; i < 4; i += 1) {
        const a = i * (Math.PI / 2);
        const x = d.cx + Math.cos(a) * benchRadius;
        const z = d.cz + Math.sin(a) * benchRadius;
        if (!ctx.isClear(x, z)) continue; // skip a bench that would sit on the road
        const bench = createBench(random);
        bench.group.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a)); // face the fountain
        ctx.placeAsset(bench, x, z);
      }
      scatter(ctx, d, 2, createPlanter, 2.0);
      break;
    }
  }
}
