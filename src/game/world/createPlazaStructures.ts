import * as THREE from 'three';
import { createFountainWater } from './createFountainWater';

/**
 * Plaza landmarks that are not part of the district town-build: the windmill
 * (its blades animate) and the fountain. Houses, the church, the cafe and the
 * paved district grounds now live under ./town (see buildTown).
 */

export function createWindmill(): { group: THREE.Group; blades: THREE.Group } {
  const windmill = new THREE.Group();

  // Tapering box tiers instead of the old 8-sided cylinder tower.
  const towerMaterial = new THREE.MeshLambertMaterial({ color: 0xd8cfc0 });
  const towerTiers = 4;
  const towerHeight = 10;
  for (let index = 0; index < towerTiers; index += 1) {
    const width = 3.6 - (index * 2) / towerTiers;
    const tierHeight = towerHeight / towerTiers;
    const tier = new THREE.Mesh(new THREE.BoxGeometry(width, tierHeight, width), towerMaterial);
    tier.position.y = tierHeight * (index + 0.5);
    tier.castShadow = true;
    windmill.add(tier);
  }

  const blades = new THREE.Group();
  const bladeMaterial = new THREE.MeshLambertMaterial({ color: 0xf5efe0 });
  for (let bladeIndex = 0; bladeIndex < 4; bladeIndex++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5.4, 0.12), bladeMaterial);
    blade.position.y = 2.7;
    const bladeArm = new THREE.Group();
    bladeArm.add(blade);
    bladeArm.rotation.z = (bladeIndex * Math.PI) / 2;
    blades.add(bladeArm);
  }
  blades.position.set(0, 9, 2.1);
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
    new THREE.MeshLambertMaterial({ color: 0x9a9284 })
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
