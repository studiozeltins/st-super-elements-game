import * as THREE from 'three';

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

export function createFountain(): THREE.Group {
  const fountain = new THREE.Group();

  // Octagon of basin blocks around the water disc.
  const basinMaterial = new THREE.MeshLambertMaterial({ color: 0x9a9284 });
  const basinSegments = 8;
  const basinRadius = 2.55;
  for (let index = 0; index < basinSegments; index += 1) {
    const angle = (index / basinSegments) * Math.PI * 2;
    const block = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.8, 0.7), basinMaterial);
    block.position.set(Math.cos(angle) * basinRadius, 0.4, Math.sin(angle) * basinRadius);
    block.rotation.y = -angle + Math.PI / 2;
    block.castShadow = true;
    fountain.add(block);
  }

  const water = new THREE.Mesh(
    new THREE.CircleGeometry(2.3, 12),
    new THREE.MeshBasicMaterial({ color: 0x3aa0ff })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.72;
  fountain.add(water);
  return fountain;
}
