import * as THREE from 'three';
import type { SeededRandom } from '../assets/types';

/**
 * A detailed pixel-art door, shared by houses and the church. Vertical plank
 * leaves (one or two) over a dark backing so the seams read, iron cross-bands
 * with studs, a round handle, a stone/timber frame (flat lintel or a stepped
 * arch), and a doorstep slab. Origin is the door's BASE CENTRE; the front faces
 * -Z, matching the house/church local front. Place at (dx, plinthTopY, frontZ).
 */

const IRON = 0x2b2b30;
const STUD = 0x4a4a50;

export interface DoorOptions {
  width: number;
  height: number;
  /** Stepped round-arch top (church) instead of a flat lintel. */
  arched?: boolean;
  /** Two leaves meeting in the middle (grand entrances) instead of one. */
  doubleLeaf?: boolean;
  woodColor?: number;
  frameColor?: number;
}

function box(w: number, h: number, d: number, color: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
}

/** One leaf: vertical planks over a dark backing, iron bands + studs + handle. */
function buildLeaf(
  random: SeededRandom,
  width: number,
  height: number,
  woodColor: number,
  handleSide: number // -1 handle on left edge, +1 on right
): THREE.Group {
  const leaf = new THREE.Group();
  const front = -0.05; // planks sit proud toward the front (-Z)

  const backing = box(width, height, 0.06, 0x1c140d);
  backing.position.set(0, height / 2, 0);
  leaf.add(backing);

  const plankCount = Math.max(2, Math.round(width / 0.32));
  const plankW = width / plankCount;
  for (let i = 0; i < plankCount; i += 1) {
    const plank = box(plankW * 0.86, height * 0.97, 0.1, new THREE.Color(woodColor).multiplyScalar(0.85 + random() * 0.3).getHex());
    plank.position.set(-width / 2 + plankW * (i + 0.5), height / 2, front);
    plank.castShadow = true;
    leaf.add(plank);
  }

  // Two iron cross-bands with square studs — the classic braced-door look.
  for (const by of [height * 0.22, height * 0.78]) {
    const band = box(width * 0.98, 0.13, 0.13, IRON);
    band.position.set(0, by, front - 0.02);
    leaf.add(band);
    for (let s = 0; s < plankCount; s += 1) {
      const stud = box(0.07, 0.07, 0.06, STUD);
      stud.position.set(-width / 2 + plankW * (s + 0.5), by, front - 0.09);
      leaf.add(stud);
    }
  }

  // Round iron handle near the meeting edge.
  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.09, 0.025, 6, 10),
    new THREE.MeshLambertMaterial({ color: IRON })
  );
  handle.position.set(handleSide * width * 0.36, height * 0.5, front - 0.1);
  leaf.add(handle);

  return leaf;
}

export function createDoor(random: SeededRandom, options: DoorOptions): THREE.Group {
  const { width, height, arched = false, doubleLeaf = false } = options;
  const woodColor = options.woodColor ?? 0x6b4a2f;
  const frameColor = options.frameColor ?? 0x3a2a1a;
  const door = new THREE.Group();

  // Leaves.
  if (doubleLeaf) {
    const half = width / 2;
    const left = buildLeaf(random, half, height, woodColor, 1);
    left.position.x = -half / 2;
    const right = buildLeaf(random, half, height, woodColor, -1);
    right.position.x = half / 2;
    door.add(left, right);
  } else {
    door.add(buildLeaf(random, width, height, woodColor, 1));
  }

  // Frame: jambs + head. Proud of the wall, slightly wider than the opening.
  const jambW = 0.16;
  const frameZ = -0.02;
  for (const sx of [-1, 1]) {
    const jamb = box(jambW, height + 0.2, 0.26, frameColor);
    jamb.position.set(sx * (width / 2 + jambW / 2), (height + 0.2) / 2, frameZ);
    jamb.castShadow = true;
    door.add(jamb);
  }
  if (arched) {
    // Stepped voussoir arch: short boxes fanned over a half-circle.
    const steps = 7;
    const radius = width / 2 + jambW / 2;
    for (let i = 0; i < steps; i += 1) {
      const t = (i + 0.5) / steps;
      const a = Math.PI * t;
      const v = box(jambW * 1.1, 0.34, 0.26, frameColor);
      v.position.set(Math.cos(a) * radius, height + Math.sin(a) * radius, frameZ);
      v.rotation.z = a - Math.PI / 2;
      door.add(v);
    }
  } else {
    const head = box(width + jambW * 2, 0.22, 0.28, frameColor);
    head.position.set(0, height + 0.11, frameZ);
    head.castShadow = true;
    door.add(head);
  }

  // Doorstep slab.
  const step = box(width + 0.5, 0.14, 0.5, 0x8a8377);
  step.position.set(0, 0.07, -0.16);
  door.add(step);

  return door;
}
