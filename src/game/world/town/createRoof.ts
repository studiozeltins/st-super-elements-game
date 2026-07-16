import * as THREE from 'three';
import { createRoofMaterial } from './buildingMaterials';

const RIDGE_TIMBER = 0x3a2a1a;

/**
 * A pitched GABLE roof — two tiled slopes meeting at a ridge, with an eave
 * overhang, a ridge beam, and plaster gable-end triangles filled with the wall
 * material. Ridge runs along Z; slopes fall in ±X. Replaces the old stepped box
 * "Minecraft" roof with a real sloped, tiled village roof.
 */
export function createPitchedRoof(
  width: number,
  depth: number,
  rise: number,
  overhang: number,
  roofColor: number,
  wallMaterial: THREE.Material
): THREE.Group {
  const group = new THREE.Group();
  const w = width / 2 + overhang;
  const d = depth / 2 + overhang;
  const h = rise;

  const positions: number[] = [];
  const indices: number[] = [];
  const v = (x: number, y: number, z: number): number => {
    positions.push(x, y, z);
    return positions.length / 3 - 1;
  };
  const A = v(-w, 0, -d);
  const B = v(-w, 0, d);
  const C = v(w, 0, -d);
  const D = v(w, 0, d);
  const R1 = v(0, h, -d);
  const R2 = v(0, h, d);
  // Left slope (−X) and right slope (+X), wound so normals face outward/up.
  indices.push(A, B, R2, A, R2, R1);
  indices.push(C, R1, R2, C, R2, D);

  const slopes = new THREE.BufferGeometry();
  slopes.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  slopes.setIndex(indices);
  slopes.computeVertexNormals();
  const slopeMesh = new THREE.Mesh(slopes, createRoofMaterial(roofColor));
  slopeMesh.material.side = THREE.DoubleSide;
  slopeMesh.castShadow = true;
  group.add(slopeMesh);

  // Eave fascia: a thin board hanging under each long (±X) eave edge so the roof
  // reads as a solid slab with real thickness instead of a paper-thin plane. A
  // darker shade of the roof tone, the only part of the roof edge the low camera
  // actually sees. Two boxes per roof — negligible cost.
  const fasciaColor = new THREE.Color(roofColor).multiplyScalar(0.62);
  const fasciaMaterial = new THREE.MeshLambertMaterial({ color: fasciaColor, flatShading: true });
  const fasciaDrop = 0.34;
  for (const sx of [-w, w]) {
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, fasciaDrop, depth + overhang * 2),
      fasciaMaterial
    );
    board.position.set(sx, 0.02 - fasciaDrop / 2, 0);
    board.castShadow = true;
    group.add(board);
  }

  // Plaster gable-end triangles (front/back), so the roof caps the wall cleanly.
  const gable = new THREE.BufferGeometry();
  gable.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [-w, 0, -d, w, 0, -d, 0, h, -d, -w, 0, d, w, 0, d, 0, h, d],
      3
    )
  );
  gable.setIndex([0, 2, 1, 3, 4, 5]);
  gable.computeVertexNormals();
  const gableMesh = new THREE.Mesh(gable, wallMaterial);
  gableMesh.material.side = THREE.DoubleSide;
  group.add(gableMesh);

  // Ridge beam.
  const ridge = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.18, depth + overhang * 2),
    new THREE.MeshLambertMaterial({ color: RIDGE_TIMBER })
  );
  ridge.position.y = h;
  group.add(ridge);

  return group;
}

/**
 * A FLAT modern roof — a slab with a low parapet wall around the edge and a
 * rooftop planter box, for the handful of flat-roofed buildings in the mix.
 */
export function createFlatRoof(
  width: number,
  depth: number,
  roofColor: number
): THREE.Group {
  const group = new THREE.Group();
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.3, 0.2, depth + 0.3),
    createRoofMaterial(roofColor)
  );
  slab.castShadow = true;
  group.add(slab);

  const parapetMat = new THREE.MeshLambertMaterial({ color: roofColor, flatShading: true });
  const rim = 0.22;
  for (const [sx, sz, lx, lz] of [
    [0, (depth + 0.3) / 2, width + 0.3, rim],
    [0, -(depth + 0.3) / 2, width + 0.3, rim],
    [(width + 0.3) / 2, 0, rim, depth + 0.3],
    [-(width + 0.3) / 2, 0, rim, depth + 0.3],
  ]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(lx, 0.4, lz), parapetMat);
    bar.position.set(sx, 0.28, sz);
    group.add(bar);
  }
  // Rooftop planter for a lived-in detail.
  const planter = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.35, 0.8),
    new THREE.MeshLambertMaterial({ color: 0x6b4a2f })
  );
  planter.position.set(width * 0.25, 0.3, -depth * 0.25);
  group.add(planter);
  const foliage = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.35, 0.7),
    new THREE.MeshLambertMaterial({ color: 0x4f8a3f })
  );
  foliage.position.set(width * 0.25, 0.62, -depth * 0.25);
  group.add(foliage);
  return group;
}
