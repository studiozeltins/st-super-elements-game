import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Cross-instance draw-call collapse for STATIC scatter decor.
 *
 * Each scattered prop (boulder, bush, flower…) is placed as its own Group of a
 * few meshes. 100+ props => 250–400 draw calls, all sharing a tiny palette of
 * lambert materials. This bakes every prop's world transform into its geometry
 * and merges all geometries that share a material into ONE mesh per material —
 * so the whole decor layer costs a handful of draws instead of hundreds.
 *
 * Only valid for decor that never moves and never animates in-shader (wind
 * canopy is excluded by the caller): the transform is baked once, permanently.
 */

type Keyed = { material: THREE.Material; geos: THREE.BufferGeometry[] };

/** Material identity that must render identically to be merged into one mesh. */
function materialKey(m: THREE.Material): string {
  const lm = m as THREE.MeshLambertMaterial;
  const color = lm.color ? lm.color.getHexString() : 'none';
  return [
    m.type,
    color,
    (lm.flatShading ?? false) ? 'flat' : 'smooth',
    m.transparent ? 't' : 'o',
    m.opacity,
    m.side,
  ].join('|');
}

/** Bake world matrix into geometry, normalized to a uniform {position,normal} layout. */
function bake(mesh: THREE.Mesh): THREE.BufferGeometry {
  let g = mesh.geometry.clone();
  g.applyMatrix4(mesh.matrixWorld);
  // Uniform indexing + attribute set so mergeGeometries never rejects the bucket.
  const nonIndexed = g.toNonIndexed();
  g.dispose();
  g = nonIndexed;
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', g.getAttribute('position'));
  out.setAttribute('normal', g.getAttribute('normal'));
  g.dispose();
  return out;
}

/**
 * Consumes the placed decor groups (their geometry is baked & discarded) and
 * returns the merged renderables to add to the world group. One mesh per
 * distinct material; source geometries are disposed.
 */
export function mergeStaticDecor(groups: THREE.Group[]): THREE.Object3D[] {
  const buckets = new Map<string, Keyed>();

  for (const g of groups) {
    g.updateMatrixWorld(true); // groups are unparented; force world matrices from locals
    g.traverse(obj => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh) return;
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const key = materialKey(material);
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { material, geos: [] }; // reuse the first material instance for the key
        buckets.set(key, bucket);
      }
      bucket.geos.push(bake(mesh));
    });
  }

  const out: THREE.Object3D[] = [];
  for (const { material, geos } of buckets.values()) {
    const merged = mergeGeometries(geos, false);
    for (const geo of geos) geo.dispose();
    if (!merged) continue; // defensive: incompatible bucket, skip rather than crash
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    out.push(mesh);
  }
  return out;
}
