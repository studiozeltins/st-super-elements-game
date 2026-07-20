import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Async loader for the CC-BY crow model (public/models/crow.glb — see ATTRIBUTION.md).
 * The glb is a single static mesh with one material and no animation clips, so we
 * bake a normalizing transform straight into a cloned GEOMETRY: scaled to a target
 * standing height, recentred so the feet sit at y=0 (pivot for pose tilts) and the
 * body is centred on x/z, and yaw-corrected to face +Z. That lets the whole flock
 * render from ONE InstancedMesh (one draw call) where each instance matrix only
 * carries position + yaw + a peck/flight pitch. No skeleton, no per-frame CPU rig.
 */
export interface CrowModel {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

const CROW_URL = '/models/crow.glb';
/** Standing height in world units after normalization. */
const TARGET_HEIGHT = 1.3;
/** Facing correction about Y (radians) — flip to π if the beak points the wrong way. */
const BASE_YAW = 0;

export function loadCrowModel(url: string = CROW_URL): Promise<CrowModel> {
  const loader = new GLTFLoader();
  return loader.loadAsync(url).then((gltf) => {
    gltf.scene.updateWorldMatrix(true, true);
    let src: THREE.Mesh | null = null;
    gltf.scene.traverse((o) => {
      if (!src && (o as THREE.Mesh).isMesh) src = o as THREE.Mesh;
    });
    if (!src) throw new Error('crow.glb has no mesh');
    const mesh: THREE.Mesh = src;

    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld); // fold in any node transform
    geometry.computeBoundingBox();
    const size = new THREE.Vector3();
    geometry.boundingBox!.getSize(size);

    const scale = TARGET_HEIGHT / size.y;
    const norm = new THREE.Matrix4()
      .makeRotationY(BASE_YAW)
      .multiply(new THREE.Matrix4().makeScale(scale, scale, scale));
    geometry.applyMatrix4(norm);

    // Recentre: feet to y=0, body centred on x/z.
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox!;
    geometry.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
    geometry.computeVertexNormals();

    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    return { geometry, material: material.clone() };
  });
}
