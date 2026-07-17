import * as THREE from 'three';
import { createFountainWater } from './createFountainWater';
import { rockPillarMaterial } from './assets/createRockMesh';

/**
 * Plaza landmarks that are not part of the district town-build: the windmill
 * (its blades animate) and the fountain. Houses, the church, the cafe and the
 * paved district grounds now live under ./town (see buildTown).
 */

const TOWER_HEIGHT = 11;

export function createWindmill(): { group: THREE.Group; blades: THREE.Group } {
  const windmill = new THREE.Group();

  // Round tapered stone tower with the shared ROCK surface (pixel stone mottle +
  // gravel bevel depth) so it reads as a real chiseled-stone mill, not flat boxes.
  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(1.35, 2.1, TOWER_HEIGHT, 12),
    rockPillarMaterial()
  );
  tower.position.y = TOWER_HEIGHT / 2;
  tower.castShadow = true;
  windmill.add(tower);

  // Conical shingled cap.
  const cap = new THREE.Mesh(
    new THREE.ConeGeometry(1.85, 2.4, 12),
    new THREE.MeshLambertMaterial({ color: 0x5a3d28, flatShading: true })
  );
  cap.position.y = TOWER_HEIGHT + 1.0;
  cap.castShadow = true;
  windmill.add(cap);

  // Four lattice sails: a wooden spar with an offset cloth panel and cross slats,
  // spun as one group. Sits proud of the tower front (+Z) so it faces the plaza.
  const blades = new THREE.Group();
  const sparMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
  const sailMat = new THREE.MeshLambertMaterial({ color: 0xf0e6d0, side: THREE.DoubleSide });
  const sailLength = 5.2;
  for (let armIndex = 0; armIndex < 4; armIndex++) {
    const arm = new THREE.Group();
    const spar = new THREE.Mesh(new THREE.BoxGeometry(0.16, sailLength, 0.16), sparMat);
    spar.position.y = sailLength / 2;
    arm.add(spar);
    const sail = new THREE.Mesh(new THREE.BoxGeometry(0.85, sailLength * 0.86, 0.04), sailMat);
    sail.position.set(0.55, sailLength * 0.48, 0);
    arm.add(sail);
    for (let slat = 1; slat <= 4; slat++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.07), sparMat);
      bar.position.set(0.55, (sailLength * 0.9 * slat) / 5, 0);
      arm.add(bar);
    }
    arm.rotation.z = (armIndex * Math.PI) / 2;
    blades.add(arm);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.5, 8), sparMat);
  hub.rotation.x = Math.PI / 2;
  blades.add(hub);
  blades.position.set(0, TOWER_HEIGHT - 0.6, 2.0);
  windmill.add(blades);

  windmill.position.set(0, 0, -10);
  return { group: windmill, blades };
}

export interface Fountain {
  group: THREE.Group;
  /** Water shader material — the day/night cycle drives its sky-reflection colors. */
  waterMaterial: THREE.ShaderMaterial;
}

export function createFountain(): Fountain {
  const fountain = new THREE.Group();

  // Solid revolved stone basin — a smooth round rim with NO gaps (LatheGeometry
  // over a cross-section profile), not a ring of voxel blocks. Profile runs from
  // the outer base up the outer wall, over a rounded lip, down the inner wall.
  const profile = [
    new THREE.Vector2(2.2, 0.15),
    new THREE.Vector2(2.42, 0.22),
    new THREE.Vector2(2.42, 0.72),
    new THREE.Vector2(2.62, 0.9),
    new THREE.Vector2(2.82, 0.86),
    new THREE.Vector2(2.82, 0.0),
  ];
  const basin = new THREE.Mesh(
    new THREE.LatheGeometry(profile, 40),
    // DoubleSide: the revolved rim's near-camera wall is back-faced and would be
    // culled (missing-wall look) — render both faces so the basin is solid.
    new THREE.MeshLambertMaterial({ color: 0x9a9284, side: THREE.DoubleSide })
  );
  basin.castShadow = true;
  basin.receiveShadow = true;
  fountain.add(basin);

  // Inner floor disc so the basin isn't see-through below the water.
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(2.42, 40),
    new THREE.MeshLambertMaterial({ color: 0x6f6a5e })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.16;
  fountain.add(floor);

  const water = createFountainWater(2.35);
  water.mesh.position.y = 0.72;
  fountain.add(water.mesh);
  return { group: fountain, waterMaterial: water.material };
}
