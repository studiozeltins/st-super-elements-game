import * as THREE from 'three';
import { acquireScorchSlot, scorchOpacity, type ScorchSlot } from './scorchMath';
import { flatRing } from './telegraphShapes';

/**
 * Persistent strike craters: a fixed pool of terrain-draped discs marking where
 * skills and slams landed. Styled as PIXEL-ART inlays, not gradients: hard
 * quantized bands (burnt-brown floor → char wall → element ring → bright lip)
 * in vertex colors, near-opaque so overlapping craters merge into one burnt
 * patch, and the floor pressed down inside the ground lift so the mark reads
 * as a dent in the ground rather than a sticker on it. Marks hold ~15s then
 * fade; a busy fight recycles the oldest mark.
 */
export interface ScorchSystem {
  addScorch(x: number, z: number, radius: number, rimColor: number): void;
  update(deltaSeconds: number): void;
  dispose(): void;
}

const MAX_DECALS = 12;
const SCORCH_LIFE_SECONDS = 25;
const BASE_OPACITY = 0.88;
/** Same lift the telegraphs use so terraced hills never bury a mark. */
const GROUND_EPSILON = 0.06;
/** Radial subdivisions so the drape follows the terrain INSIDE the disc too —
 * the old center-fan CircleGeometry only fit its rim and floated on slopes. */
const FILL_RINGS = 5;

// The crater's shading ramp, outside-in. Hard band edges = the pixel-art read
// (the screen pixel filter chunks them further); no smooth lerp anywhere.
const BURNT_FLOOR = new THREE.Color(0x4a3220); // burnt grass brown
const CHAR_WALL = new THREE.Color(0x201711);

export function createScorchSystem(
  scene: THREE.Scene,
  getGroundHeight: (x: number, z: number) => number
): ScorchSystem {
  const slots: (ScorchSlot | null)[] = Array.from({ length: MAX_DECALS }, () => null);
  let elapsedSeconds = 0;

  const meshes: THREE.Mesh[] = [];
  for (let index = 0; index < MAX_DECALS; index += 1) {
    // A subdivided unit disc authored in the XZ plane (same builder as the
    // telegraphs) — every interior ring gets its own draped ground sample.
    const geometry = flatRing(0.001, 1, FILL_RINGS);
    const vertexCount = geometry.getAttribute('position').count;
    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3)
    );
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        opacity: 0,
      })
    );
    mesh.visible = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    // Draping shifts vertex heights after bounds were computed — skip culling.
    mesh.frustumCulled = false;
    scene.add(mesh);
    meshes.push(mesh);
  }

  const rim = new THREE.Color();
  const rimDark = new THREE.Color();
  const drapePoint = new THREE.Vector3();

  /** Quantized crater bands, outside-in: bright lip, element ring, char wall, burnt floor. */
  function paintVertexColors(mesh: THREE.Mesh, rimColor: number) {
    rim.setHex(rimColor);
    rimDark.copy(rim).multiplyScalar(0.55);
    const positions = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const colors = mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    for (let index = 0; index < positions.count; index += 1) {
      // Unit-disc local radius = band selector.
      const radial = Math.min(1, Math.hypot(positions.getX(index), positions.getZ(index)));
      const band =
        radial > 0.92 ? rim : radial > 0.72 ? rimDark : radial > 0.5 ? CHAR_WALL : BURNT_FLOOR;
      colors.setXYZ(index, band.r, band.g, band.b);
    }
    colors.needsUpdate = true;
  }

  /**
   * Conform the scaled disc to the terrain, with the floor pressed toward the
   * ground and only the lip riding the full epsilon — a shallow real dent.
   */
  function drapeToGround(mesh: THREE.Mesh) {
    mesh.updateWorldMatrix(true, false);
    const positions = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let index = 0; index < positions.count; index += 1) {
      const radial = Math.min(1, Math.hypot(positions.getX(index), positions.getZ(index)));
      drapePoint
        .set(positions.getX(index), 0, positions.getZ(index))
        .applyMatrix4(mesh.matrixWorld);
      const lift = GROUND_EPSILON * (0.25 + 0.75 * radial);
      positions.setY(
        index,
        (getGroundHeight(drapePoint.x, drapePoint.z) + lift - mesh.position.y) / mesh.scale.y
      );
    }
    positions.needsUpdate = true;
  }

  return {
    addScorch(x, z, radius, rimColor) {
      const slot = acquireScorchSlot(slots, elapsedSeconds);
      slots[slot] = { activeSince: elapsedSeconds, life: SCORCH_LIFE_SECONDS, radius };
      const mesh = meshes[slot];
      mesh.position.set(x, 0, z);
      mesh.scale.set(radius, 1, radius);
      paintVertexColors(mesh, rimColor);
      drapeToGround(mesh);
      mesh.visible = true;
    },
    update(deltaSeconds) {
      elapsedSeconds += deltaSeconds;
      for (let index = 0; index < MAX_DECALS; index += 1) {
        const slot = slots[index];
        if (!slot) continue;
        const opacity =
          BASE_OPACITY * scorchOpacity(elapsedSeconds - slot.activeSince, slot.life);
        const mesh = meshes[index];
        (mesh.material as THREE.MeshBasicMaterial).opacity = opacity;
        if (opacity <= 0) {
          mesh.visible = false;
          slots[index] = null;
        }
      }
    },
    dispose() {
      for (const mesh of meshes) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    },
  };
}
