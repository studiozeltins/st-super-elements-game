import * as THREE from 'three';
import type { SeededRandom, WorldAsset } from './types';
import { lambert, pickRandom, randomBetween } from './assetHelpers';

/**
 * Lived-in plaza clutter — barrels, crate stacks, market stalls and handcarts —
 * in the voxel/pixel look (boxes + low-segment cylinders). Scattered between the
 * houses so the town square reads as inhabited, not a bare ring. All decor:
 * returned groups carry no obstacles (players walk through) to keep the spawn
 * plaza clear for movement.
 */

const WOOD = 0x7a5230;
const WOOD_DARK = 0x3a2a1a;
const HOOP = 0x2e2118;

/** A short staved barrel: a low-segment cylinder with two dark iron hoops. */
export function createBarrel(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.82, 8), lambert(WOOD));
  body.position.y = 0.41;
  body.castShadow = true;
  group.add(body);
  const hoopMat = lambert(HOOP);
  for (const y of [0.16, 0.66]) {
    const hoop = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.09, 8), hoopMat);
    hoop.position.y = y;
    group.add(hoop);
  }
  group.rotation.y = random() * Math.PI * 2;
  return { group };
}

/** One or two stacked wooden crates with plank trim on the lid. */
export function createCrate(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();
  const crateMat = lambert(0x8a6a3f);
  const trimMat = lambert(WOOD_DARK);
  const boxCount = random() < 0.45 ? 2 : 1;
  let y = 0;
  for (let i = 0; i < boxCount; i += 1) {
    const size = 0.72 - i * 0.16;
    const crate = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), crateMat);
    crate.position.y = y + size / 2;
    crate.rotation.y = randomBetween(random, -0.25, 0.25);
    crate.castShadow = true;
    group.add(crate);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(size + 0.04, 0.06, size + 0.04), trimMat);
    lid.position.set(0, y + size, 0);
    lid.rotation.y = crate.rotation.y;
    group.add(lid);
    y += size;
  }
  group.rotation.y = random() * Math.PI * 2;
  return { group };
}

const PRODUCE = [0xd8623a, 0xe0a53a, 0x6ea24a, 0xc23a4a];
const AWNING = [0xcf4b3a, 0xdcc9a8];

/** A market stall: four posts, a plank table with produce, and a striped awning. */
export function createMarketStall(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();
  const postMat = lambert(WOOD_DARK);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.9, 0.12), postMat);
      post.position.set(sx * 0.95, 0.95, sz * 0.6);
      group.add(post);
    }
  }
  const table = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.14, 1.3), lambert(WOOD));
  table.position.y = 0.92;
  table.castShadow = true;
  group.add(table);
  // Produce boxes on the table.
  const produceCount = 3 + Math.floor(random() * 3);
  for (let i = 0; i < produceCount; i += 1) {
    const s = randomBetween(random, 0.18, 0.28);
    const item = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), lambert(pickRandom(random, PRODUCE)));
    item.position.set(randomBetween(random, -0.85, 0.85), 1.02 + s / 2, randomBetween(random, -0.45, 0.45));
    group.add(item);
  }
  // Two-tone striped awning, tilted forward over the table.
  const stripeWidth = 2.2 / 5;
  for (let i = 0; i < 5; i += 1) {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(stripeWidth, 0.08, 1.5),
      lambert(AWNING[i % 2])
    );
    stripe.position.set(-1.1 + stripeWidth * (i + 0.5), 1.95, 0.15);
    group.add(stripe);
  }
  const awning = group.children.slice(-5);
  for (const s of awning) s.rotation.x = -0.25;
  group.rotation.y = random() * Math.PI * 2;
  return { group };
}

/** A wooden handcart: a bed on two spoked-looking wheels with a raised handle. */
export function createCart(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();
  const woodMat = lambert(WOOD);
  const bed = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.22, 0.95), woodMat);
  bed.position.y = 0.62;
  bed.castShadow = true;
  group.add(bed);
  // Low side rails.
  for (const sz of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.28, 0.08), lambert(WOOD_DARK));
    rail.position.set(0, 0.78, sz * 0.44);
    group.add(rail);
  }
  const wheelMat = lambert(WOOD_DARK);
  for (const sx of [-1, 1]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 8), wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(sx * 0.5, 0.42, 0);
    wheel.castShadow = true;
    group.add(wheel);
  }
  // Raised pull handle at one end.
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.0), woodMat);
  handle.position.set(0, 0.85, 0.9);
  handle.rotation.x = 0.5;
  group.add(handle);
  group.rotation.y = random() * Math.PI * 2;
  return { group };
}

/** A slatted wooden park bench — garden/plaza seating. */
export function createBench(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();
  const woodMat = lambert(0x6e4a2c);
  const legMat = lambert(WOOD_DARK);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.5), woodMat);
  seat.position.y = 0.45;
  seat.castShadow = true;
  group.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 0.1), woodMat);
  back.position.set(0, 0.72, -0.2);
  group.add(back);
  for (const sx of [-0.6, 0.6]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.45, 0.45), legMat);
    leg.position.set(sx, 0.22, 0);
    group.add(leg);
  }
  group.rotation.y = random() * Math.PI * 2;
  return { group };
}

/** A round cafe table with a two-tone parasol above it. */
export function createCafeTable(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 10), lambert(0xdac6a4));
  top.position.y = 0.72;
  top.castShadow = true;
  group.add(top);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.72, 6), lambert(WOOD_DARK));
  post.position.y = 0.36;
  group.add(post);
  // Two chairs.
  for (const angle of [0, Math.PI]) {
    const chair = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.4), lambert(0x6e4a2c));
    chair.position.set(Math.cos(angle) * 0.8, 0.42, Math.sin(angle) * 0.8);
    group.add(chair);
  }
  // Parasol pole + canopy.
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.0, 6), lambert(WOOD_DARK));
  pole.position.y = 1.4;
  group.add(pole);
  const canopyColor = random() < 0.5 ? 0xcf4b3a : 0x3d8a78;
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.5, 8), lambert(canopyColor));
  canopy.position.y = 2.15;
  canopy.castShadow = true;
  group.add(canopy);
  group.rotation.y = random() * Math.PI * 2;
  return { group };
}

/** A planter box with a leafy shrub — garden/street greenery. */
export function createPlanter(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 0.6), lambert(0x6b4a2f));
  box.position.y = 0.25;
  box.castShadow = true;
  group.add(box);
  const leafMat = lambert(0x4f8a3f);
  const clumps = 2 + Math.floor(random() * 2);
  for (let i = 0; i < clumps; i += 1) {
    const s = randomBetween(random, 0.35, 0.55);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), leafMat);
    leaf.position.set(randomBetween(random, -0.3, 0.3), 0.5 + s / 2, randomBetween(random, -0.15, 0.15));
    group.add(leaf);
  }
  group.rotation.y = random() * Math.PI * 2;
  return { group };
}
