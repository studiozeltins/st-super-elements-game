import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { SeededRandom, WorldAsset } from './types';
import { edgeLit, lambert, pickRandom, randomBetween } from './assetHelpers';

/**
 * Lived-in plaza clutter — market stalls, handcarts, benches, cafe tables,
 * planters and grass tufts — in the voxel/pixel look (boxes + low-segment
 * cylinders). Scattered between the houses so the town square reads as
 * inhabited, not a bare ring. Crates/barrels/fences live in their own sibling
 * files (createCrate/createBarrel/createFence) and carry collision footprints.
 */

const WOOD = 0x7a5230;
const WOOD_DARK = 0x3a2a1a;

const PRODUCE = [0xd8623a, 0xe0a53a, 0x6ea24a, 0xc23a4a];
const AWNING = [0xcf4b3a, 0xdcc9a8];

/** A market stall: four posts, a plank table with produce, and a striped awning.
 *  Posts + awning ride well ABOVE player head height (~2.1) so a character standing
 *  at the stall never pokes through the awning, and the whole stall is a solid
 *  obstacle so players path around it rather than through the goods. */
export function createMarketStall(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();
  const postMat = lambert(WOOD_DARK);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.6, 0.12), postMat);
      post.position.set(sx * 0.95, 1.3, sz * 0.6);
      group.add(post);
    }
  }
  const table = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.14, 1.3), lambert(WOOD));
  table.position.y = 0.92;
  group.add(table);
  // Produce boxes on the table.
  const produceCount = 3 + Math.floor(random() * 3);
  for (let i = 0; i < produceCount; i += 1) {
    const s = randomBetween(random, 0.18, 0.28);
    const item = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), lambert(pickRandom(random, PRODUCE)));
    item.position.set(randomBetween(random, -0.85, 0.85), 1.02 + s / 2, randomBetween(random, -0.45, 0.45));
    group.add(item);
  }
  // Two-tone striped awning, tilted forward over the table — raised clear of the
  // player so no character silhouette shines through it.
  const stripeWidth = 2.2 / 5;
  for (let i = 0; i < 5; i += 1) {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(stripeWidth, 0.08, 1.5),
      lambert(AWNING[i % 2])
    );
    stripe.position.set(-1.1 + stripeWidth * (i + 0.5), 2.7, 0.15);
    group.add(stripe);
  }
  const awning = group.children.slice(-5);
  for (const s of awning) s.rotation.x = -0.25;
  group.rotation.y = random() * Math.PI * 2;
  // Centered footprint (rotation-safe — placeAsset does not rotate obstacles).
  return { group, obstacles: [{ x: 0, z: 0, radius: 1.2, height: 2.7 }] };
}

/** A wooden handcart: a bed on two spoked-looking wheels with a raised handle. */
export function createCart(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();
  const woodMat = lambert(WOOD);
  const bed = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.22, 0.95), woodMat);
  bed.position.y = 0.62;
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
    group.add(wheel);
  }
  // Raised pull handle at one end.
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.0), woodMat);
  handle.position.set(0, 0.85, 0.9);
  handle.rotation.x = 0.5;
  group.add(handle);
  group.rotation.y = random() * Math.PI * 2;
  return { group, obstacles: [{ x: 0, z: 0, radius: 1.0, height: 0.9 }] };
}

/** A large cozy park bench — wide wood slats on a dark iron frame with armrests,
 *  a padded seat cushion and a back pillow, so it reads inviting and pops against
 *  the grey cobble. */
export function createBench(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();
  const woodMat = edgeLit(0x9a6a38); // lighter warm wood, catches the sun
  const ironMat = edgeLit(0x2c2824, 0.5); // glossier iron
  const cushionMat = lambert(0xb5563e); // warm padded fabric (matte)
  const W = 4.2; // extra-wide, roomy seating
  const end = W / 2 - 0.18; // x of the end frames/armrests
  // Seat: four slats with gaps across a deeper seat.
  for (const sz of [-0.27, -0.09, 0.09, 0.27]) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(W, 0.09, 0.15), woodMat);
    slat.position.set(0, 0.5, sz);
    group.add(slat);
  }
  // Padded seat cushion.
  const seatCushion = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, 0.14, 0.72), cushionMat);
  seatCushion.position.set(0, 0.61, 0.02);
  group.add(seatCushion);
  // Backrest slats + a soft back pillow.
  for (const by of [0.82, 1.04, 1.26]) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(W, 0.14, 0.06), woodMat);
    slat.position.set(0, by, -0.34);
    group.add(slat);
  }
  const backPillow = new THREE.Mesh(new THREE.BoxGeometry(W - 0.3, 0.5, 0.13), cushionMat);
  backPillow.position.set(0, 1.0, -0.28);
  group.add(backPillow);
  // Iron end frames, chunky armrests, back posts.
  for (const sx of [-end, end]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.56, 0.72), ironMat);
    leg.position.set(sx, 0.26, -0.02);
    group.add(leg);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 0.78), woodMat);
    arm.position.set(sx, 0.74, 0.0);
    group.add(arm);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.72, 0.1), ironMat);
    post.position.set(sx, 0.88, -0.34);
    group.add(post);
  }
  group.rotation.y = random() * Math.PI * 2;
  // Centered footprint covering the seat mass (rotation-safe); the wide ends read
  // as sit-on-able edges rather than hard walls.
  return { group, obstacles: [{ x: 0, z: 0, radius: 1.4, height: 1.3 }] };
}

/** A round cafe table with a two-tone parasol above it. */
export function createCafeTable(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 10), lambert(0xdac6a4));
  top.position.y = 0.72;
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
  // Parasol pole + canopy — tall enough to stand well above a player.
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.0, 6), lambert(WOOD_DARK));
  pole.position.y = 1.6;
  group.add(pole);
  const canopyColor = random() < 0.5 ? 0xcf4b3a : 0x3d8a78;
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.6, 8), edgeLit(canopyColor));
  canopy.position.y = 3.2;
  group.add(canopy);
  group.rotation.y = random() * Math.PI * 2;
  // Solid footprint covering the table + its two stools (radius reaches the seats
  // at 0.8); the parasol rides at y≈3.2, well above the player, so it stays purely
  // visual. Centered => rotation-safe.
  return { group, obstacles: [{ x: 0, z: 0, radius: 1.1, height: 0.8 }] };
}

const TUFT_GREENS = [0x4a7a30, 0x568a38, 0x3f6a28];

/** A small grass tuft — a few short leaning blades MERGED into a single mesh (one
 *  draw call each; there are dozens across the town, so per-blade meshes were a
 *  real draw-call cost). */
export function createGrassTuft(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();
  const blades = 3 + Math.floor(random() * 3);
  const geos: THREE.BufferGeometry[] = [];
  const q = new THREE.Quaternion();
  const scl = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < blades; i += 1) {
    const h = randomBetween(random, 0.18, 0.36);
    const g = new THREE.BoxGeometry(0.035, h, 0.035);
    q.setFromEuler(
      new THREE.Euler(randomBetween(random, -0.4, 0.4), random() * Math.PI, randomBetween(random, -0.4, 0.4))
    );
    const pos = new THREE.Vector3(randomBetween(random, -0.09, 0.09), h / 2, randomBetween(random, -0.09, 0.09));
    g.applyMatrix4(new THREE.Matrix4().compose(pos, q, scl));
    geos.push(g);
  }
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  group.add(new THREE.Mesh(merged, lambert(pickRandom(random, TUFT_GREENS))));
  return { group };
}

/** A planter box with a leafy shrub — garden/street greenery. */
export function createPlanter(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 0.6), lambert(0x6b4a2f));
  box.position.y = 0.25;
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
  return { group, obstacles: [{ x: 0, z: 0, radius: 0.6, height: 0.75 }] };
}
