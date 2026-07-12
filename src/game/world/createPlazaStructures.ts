import * as THREE from 'three';
import type { SeededRandom } from './assets';

/**
 * The plaza's fixed structures — houses, windmill, fountain — in the voxel
 * look: cones and cylinders became stepped box tiers.
 */

export function createHouse(
  random: SeededRandom,
  angleRadians: number,
  distanceFromCenter: number
): THREE.Group {
  const house = new THREE.Group();
  const wallColors = [0xe8dcc0, 0xdccfb4, 0xf0e6d0];
  const roofColors = [0xb0452f, 0x3d7a78, 0x8a5a3a];
  const wallColor = wallColors[Math.floor(random() * wallColors.length)];
  const roofColor = roofColors[Math.floor(random() * roofColors.length)];

  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(4, 3.4, 4),
    new THREE.MeshLambertMaterial({ color: wallColor })
  );
  walls.position.y = 1.7;
  walls.castShadow = true;
  house.add(walls);

  // Stepped pyramid roof: three shrinking box tiers.
  const roofMaterial = new THREE.MeshLambertMaterial({ color: roofColor });
  const roofTiers = 3;
  let tierY = 3.4;
  for (let index = 0; index < roofTiers; index += 1) {
    const spread = 4.4 * (1 - index / roofTiers);
    const tier = new THREE.Mesh(new THREE.BoxGeometry(spread, 0.8, spread), roofMaterial);
    tier.position.y = tierY + 0.4;
    tier.castShadow = true;
    house.add(tier);
    tierY += 0.8;
  }

  house.position.set(
    Math.cos(angleRadians) * distanceFromCenter,
    0,
    Math.sin(angleRadians) * distanceFromCenter
  );
  house.lookAt(0, 0, 0);
  return house;
}

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
