import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * A detailed pixel-art door, shared by houses and the church. Vertical plank
 * leaves (one or two) over a dark backing so the seams read, iron cross-bands
 * with studs, strap hinges + a ring knocker, a barred peep-window, a stone/timber
 * frame (flat lintel + keystone, or a stepped arch), and a doorstep slab.
 *
 * PERFORMANCE: every part is a box/torus/cylinder collected into per-COLOUR
 * buckets and merged into ONE mesh per colour (~7 draw calls for a whole door,
 * even a double-leaf church door), instead of dozens of individual meshes — a
 * town of houses was otherwise hundreds of extra draw calls in the main + shadow
 * pass. Origin is the door's BASE CENTRE; the front faces -Z. Place at
 * (dx, plinthTopY, frontZ).
 */

const IRON = 0x2b2b30;
const STUD = 0x4a4a50;
const BACKING = 0x1c140d;
const PANE = 0x14100a;
const STONE = 0x8a8377;

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

/** Colour → geometry list; merged into one mesh per colour at the end. */
type Buckets = Map<number, THREE.BufferGeometry[]>;

function push(buckets: Buckets, color: number, geo: THREE.BufferGeometry): void {
  const arr = buckets.get(color);
  if (arr) arr.push(geo);
  else buckets.set(color, [geo]);
}

/** A box pre-translated (and optionally roll-rotated) into place. */
function box(w: number, h: number, d: number, x: number, y: number, z: number, rotZ = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotZ) g.rotateZ(rotZ);
  g.translate(x, y, z);
  return g;
}

/** One leaf's parts pushed into the shared colour buckets at x-offset ox. */
function collectLeaf(
  buckets: Buckets,
  ox: number,
  width: number,
  height: number,
  woodColor: number,
  handleSide: number // -1 handle on left edge, +1 on right
): void {
  const front = -0.05; // planks sit proud toward the front (-Z)

  push(buckets, BACKING, box(width, height, 0.06, ox, height / 2, 0));

  const plankCount = Math.max(2, Math.round(width / 0.32));
  const plankW = width / plankCount;
  for (let i = 0; i < plankCount; i += 1) {
    push(buckets, woodColor, box(plankW * 0.86, height * 0.97, 0.1, ox - width / 2 + plankW * (i + 0.5), height / 2, front));
  }

  // Two iron cross-bands with square studs — the classic braced-door look.
  for (const by of [height * 0.22, height * 0.78]) {
    push(buckets, IRON, box(width * 0.98, 0.13, 0.13, ox, by, front - 0.02));
    for (let s = 0; s < plankCount; s += 1) {
      push(buckets, STUD, box(0.07, 0.07, 0.06, ox - width / 2 + plankW * (s + 0.5), by, front - 0.09));
    }
  }

  // Handle ring on a backplate near the meeting edge.
  push(buckets, IRON, box(0.16, 0.22, 0.04, ox + handleSide * width * 0.36, height * 0.5, front - 0.06));
  push(buckets, IRON, new THREE.TorusGeometry(0.09, 0.025, 6, 10).translate(ox + handleSide * width * 0.36, height * 0.5, front - 0.1));

  // Strap hinges on the hinge edge (opposite the handle) + round pintle knuckles.
  const hingeEdge = -handleSide;
  for (const hy of [height * 0.22, height * 0.78]) {
    push(buckets, IRON, box(width * 0.34, 0.09, 0.05, ox + hingeEdge * (width / 2 - width * 0.17), hy, front - 0.06));
    push(
      buckets,
      STUD,
      new THREE.CylinderGeometry(0.06, 0.06, 0.14, 8)
        .rotateX(Math.PI / 2)
        .translate(ox + hingeEdge * (width / 2 - 0.02), hy, front - 0.07)
    );
  }

  // Barred peep window: dark recessed pane behind crossed iron bars.
  const winW = width * 0.42;
  const winH = height * 0.16;
  const winY = height * 0.86;
  push(buckets, PANE, box(winW, winH, 0.04, ox, winY, front + 0.03));
  const bars = 3;
  for (let b = 0; b < bars; b += 1) {
    push(buckets, IRON, box(0.03, winH * 1.05, 0.04, ox - winW / 2 + (winW / (bars - 1)) * b, winY, front - 0.05));
  }
  push(buckets, IRON, box(winW * 1.05, 0.03, 0.04, ox, winY, front - 0.05));

  // Ring knocker on a stud, centered below the window.
  push(buckets, STUD, box(0.1, 0.1, 0.04, ox, height * 0.62, front - 0.06));
  push(buckets, IRON, new THREE.TorusGeometry(0.07, 0.02, 6, 10).translate(ox, height * 0.58, front - 0.1));
}

/** Merge one colour bucket into a single shadow-optional mesh. */
function bucketMesh(color: number, geos: THREE.BufferGeometry[], castShadow: boolean): THREE.Mesh {
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ color }));
  mesh.castShadow = castShadow;
  return mesh;
}

export function createDoor(options: DoorOptions): THREE.Group {
  const { width, height, arched = false, doubleLeaf = false } = options;
  const woodColor = options.woodColor ?? 0x6b4a2f;
  const frameColor = options.frameColor ?? 0x3a2a1a;
  const buckets: Buckets = new Map();

  // Leaves.
  if (doubleLeaf) {
    const half = width / 2;
    collectLeaf(buckets, -half / 2, half, height, woodColor, 1);
    collectLeaf(buckets, half / 2, half, height, woodColor, -1);
  } else {
    collectLeaf(buckets, 0, width, height, woodColor, 1);
  }

  // Frame: jambs + head/arch. Proud of the wall, slightly wider than the opening.
  const jambW = 0.16;
  const frameZ = -0.02;
  for (const sx of [-1, 1]) {
    push(buckets, frameColor, box(jambW, height + 0.2, 0.26, sx * (width / 2 + jambW / 2), (height + 0.2) / 2, frameZ));
  }
  if (arched) {
    // Stepped voussoir arch: short boxes fanned over a half-circle.
    const steps = 7;
    const radius = width / 2 + jambW / 2;
    for (let i = 0; i < steps; i += 1) {
      const a = (Math.PI * (i + 0.5)) / steps;
      push(
        buckets,
        frameColor,
        box(jambW * 1.1, 0.34, 0.26, Math.cos(a) * radius, height + Math.sin(a) * radius, frameZ, a - Math.PI / 2)
      );
    }
  } else {
    push(buckets, frameColor, box(width + jambW * 2, 0.22, 0.28, 0, height + 0.11, frameZ));
    // Centered keystone proud of the lintel.
    push(buckets, STONE, box(0.24, 0.3, 0.32, 0, height + 0.12, frameZ - 0.02));
  }

  // Doorstep slab.
  push(buckets, STONE, box(width + 0.5, 0.14, 0.5, 0, 0.07, -0.16));

  // Merge each colour into one mesh. Only the big silhouette parts (planks,
  // frame, stone) cast shadows — the small iron/stud/pane detail does not, to
  // keep the shadow pass cheap.
  const door = new THREE.Group();
  const shadowColors = new Set<number>([woodColor, frameColor, STONE]);
  for (const [color, geos] of buckets) {
    door.add(bucketMesh(color, geos, shadowColors.has(color)));
  }
  return door;
}
