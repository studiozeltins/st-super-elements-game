import * as THREE from 'three';
import { acquireScorchSlot, scorchOpacity, type ScorchSlot } from './scorchMath';

/**
 * Persistent scorch decals: a fixed pool of terrain-draped discs marking where
 * skills and slams landed. Char-dark center, element-tinted rim (vertex
 * colors — one mesh, one draw call per decal). Marks hold ~15s then fade;
 * a busy fight recycles the oldest mark.
 */
export interface ScorchSystem {
  addScorch(x: number, z: number, radius: number, rimColor: number): void;
  update(deltaSeconds: number): void;
  dispose(): void;
}

const MAX_DECALS = 12;
const SCORCH_LIFE_SECONDS = 25;
const BASE_OPACITY = 0.55;
const CHAR_COLOR = new THREE.Color(0x1a1512);
/** Same lift the telegraphs use so terraced hills never bury a mark. */
const GROUND_EPSILON = 0.06;
const RING_SEGMENTS = 20;

export function createScorchSystem(
  scene: THREE.Scene,
  getGroundHeight: (x: number, z: number) => number
): ScorchSystem {
  const slots: (ScorchSlot | null)[] = Array.from({ length: MAX_DECALS }, () => null);
  let elapsedSeconds = 0;

  const meshes: THREE.Mesh[] = [];
  for (let index = 0; index < MAX_DECALS; index += 1) {
    const geometry = new THREE.CircleGeometry(1, RING_SEGMENTS);
    geometry.rotateX(-Math.PI / 2);
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
    scene.add(mesh);
    meshes.push(mesh);
  }

  const rim = new THREE.Color();
  const blended = new THREE.Color();
  const drapePoint = new THREE.Vector3();

  /** Center verts stay char-dark; the outer ring lerps toward the element tint. */
  function paintVertexColors(mesh: THREE.Mesh, rimColor: number) {
    rim.setHex(rimColor);
    const positions = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const colors = mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    for (let index = 0; index < positions.count; index += 1) {
      // CircleGeometry local radius is 1 — distance from center = rim factor.
      const rimFactor = Math.min(1, Math.hypot(positions.getX(index), positions.getZ(index)));
      blended.copy(CHAR_COLOR).lerp(rim, rimFactor * 0.65);
      colors.setXYZ(index, blended.r, blended.g, blended.b);
    }
    colors.needsUpdate = true;
  }

  /** Conform the scaled disc to the terrain (same pattern as the telegraphs). */
  function drapeToGround(mesh: THREE.Mesh) {
    mesh.updateWorldMatrix(true, false);
    const positions = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let index = 0; index < positions.count; index += 1) {
      drapePoint
        .set(positions.getX(index), 0, positions.getZ(index))
        .applyMatrix4(mesh.matrixWorld);
      positions.setY(
        index,
        (getGroundHeight(drapePoint.x, drapePoint.z) + GROUND_EPSILON - mesh.position.y) /
          mesh.scale.y
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
