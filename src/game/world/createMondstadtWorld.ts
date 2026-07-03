import * as THREE from 'three';
import { SAFE_ZONE_RADIUS, WORLD_BOUND } from '../data/constants';

export interface MondstadtWorld {
  group: THREE.Group;
  update(deltaSeconds: number): void;
}

export function isInsideSafeZone(positionX: number, positionZ: number): boolean {
  return Math.hypot(positionX, positionZ) <= SAFE_ZONE_RADIUS;
}

function createLighting(group: THREE.Group) {
  const skyLight = new THREE.HemisphereLight(0xbfe3ff, 0x4a7a3a, 0.9);
  group.add(skyLight);

  const sunLight = new THREE.DirectionalLight(0xfff2d8, 1.4);
  sunLight.position.set(30, 50, 20);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  const shadowSpan = WORLD_BOUND + 10;
  sunLight.shadow.camera.left = -shadowSpan;
  sunLight.shadow.camera.right = shadowSpan;
  sunLight.shadow.camera.top = shadowSpan;
  sunLight.shadow.camera.bottom = -shadowSpan;
  sunLight.shadow.camera.far = 150;
  group.add(sunLight);
}

function createGround(group: THREE.Group) {
  const groundGeometry = new THREE.PlaneGeometry(WORLD_BOUND * 2.4, WORLD_BOUND * 2.4);
  const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x58a24f });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const plaza = new THREE.Mesh(
    new THREE.CircleGeometry(SAFE_ZONE_RADIUS, 32),
    new THREE.MeshLambertMaterial({ color: 0xb9b2a4 })
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.02;
  plaza.receiveShadow = true;
  group.add(plaza);

  const safeZoneRing = new THREE.Mesh(
    new THREE.RingGeometry(SAFE_ZONE_RADIUS - 0.4, SAFE_ZONE_RADIUS, 48),
    new THREE.MeshBasicMaterial({ color: 0x9fe86a, side: THREE.DoubleSide })
  );
  safeZoneRing.rotation.x = -Math.PI / 2;
  safeZoneRing.position.y = 0.05;
  group.add(safeZoneRing);
}

function createHouse(angleRadians: number, distanceFromCenter: number): THREE.Group {
  const house = new THREE.Group();
  const wallColors = [0xe8dcc0, 0xdccfb4, 0xf0e6d0];
  const roofColors = [0xb0452f, 0x3d7a78, 0x8a5a3a];
  const wallColor = wallColors[Math.floor(Math.random() * wallColors.length)];
  const roofColor = roofColors[Math.floor(Math.random() * roofColors.length)];

  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(4, 3.4, 4),
    new THREE.MeshLambertMaterial({ color: wallColor })
  );
  walls.position.y = 1.7;
  walls.castShadow = true;
  house.add(walls);

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(3.4, 2.4, 4),
    new THREE.MeshLambertMaterial({ color: roofColor })
  );
  roof.position.y = 4.6;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  house.add(roof);

  house.position.set(
    Math.cos(angleRadians) * distanceFromCenter,
    0,
    Math.sin(angleRadians) * distanceFromCenter
  );
  house.lookAt(0, 0, 0);
  return house;
}

function createWindmill(): { group: THREE.Group; blades: THREE.Group } {
  const windmill = new THREE.Group();
  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 2, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xd8cfc0 })
  );
  tower.position.y = 5;
  tower.castShadow = true;
  windmill.add(tower);

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

function createFountain(): THREE.Group {
  const fountain = new THREE.Group();
  const basin = new THREE.Mesh(
    new THREE.CylinderGeometry(2.6, 2.9, 0.8, 12),
    new THREE.MeshLambertMaterial({ color: 0x9a9284 })
  );
  basin.position.y = 0.4;
  basin.castShadow = true;
  fountain.add(basin);

  const water = new THREE.Mesh(
    new THREE.CircleGeometry(2.3, 12),
    new THREE.MeshBasicMaterial({ color: 0x3aa0ff })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.82;
  fountain.add(water);
  return fountain;
}

function randomPositionOutsidePlaza(minimumRadius: number): { x: number; z: number } {
  const angle = Math.random() * Math.PI * 2;
  const distance = minimumRadius + Math.random() * (WORLD_BOUND - 6 - minimumRadius);
  return { x: Math.cos(angle) * distance, z: Math.sin(angle) * distance };
}

function createInstancedScatter(
  group: THREE.Group,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  count: number,
  placeInstance: (dummy: THREE.Object3D) => void
) {
  const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
  instancedMesh.castShadow = true;
  const dummy = new THREE.Object3D();
  for (let instanceIndex = 0; instanceIndex < count; instanceIndex++) {
    placeInstance(dummy);
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(instanceIndex, dummy.matrix);
  }
  group.add(instancedMesh);
}

function createNature(group: THREE.Group) {
  const treePositions = Array.from({ length: 44 }, () => randomPositionOutsidePlaza(24));
  let treeIndex = 0;
  createInstancedScatter(
    group,
    new THREE.BoxGeometry(0.7, 2.4, 0.7),
    new THREE.MeshLambertMaterial({ color: 0x6b4a2f }),
    treePositions.length,
    dummy => {
      const treePosition = treePositions[treeIndex++];
      dummy.position.set(treePosition.x, 1.2, treePosition.z);
      dummy.scale.setScalar(0.8 + Math.random() * 0.6);
      dummy.rotation.set(0, Math.random() * Math.PI, 0);
    }
  );
  treeIndex = 0;
  createInstancedScatter(
    group,
    new THREE.ConeGeometry(1.8, 3.4, 6),
    new THREE.MeshLambertMaterial({ color: 0x3f8a36 }),
    treePositions.length,
    dummy => {
      const treePosition = treePositions[treeIndex++];
      dummy.position.set(treePosition.x, 3.6, treePosition.z);
      dummy.scale.setScalar(0.8 + Math.random() * 0.7);
      dummy.rotation.set(0, Math.random() * Math.PI, 0);
    }
  );

  createInstancedScatter(
    group,
    new THREE.DodecahedronGeometry(0.9),
    new THREE.MeshLambertMaterial({ color: 0x8f8f86 }),
    16,
    dummy => {
      const rockPosition = randomPositionOutsidePlaza(22);
      dummy.position.set(rockPosition.x, 0.4, rockPosition.z);
      dummy.scale.setScalar(0.5 + Math.random() * 1.1);
      dummy.rotation.set(Math.random(), Math.random() * Math.PI, Math.random());
    }
  );

  createInstancedScatter(
    group,
    new THREE.BoxGeometry(0.22, 0.5, 0.22),
    new THREE.MeshLambertMaterial({ color: 0xfff0a8 }),
    70,
    dummy => {
      const flowerPosition = randomPositionOutsidePlaza(19);
      dummy.position.set(flowerPosition.x, 0.25, flowerPosition.z);
      dummy.rotation.set(0, Math.random() * Math.PI, 0);
    }
  );
}

export function createMondstadtWorld(scene: THREE.Scene): MondstadtWorld {
  scene.background = new THREE.Color(0x8ecae6);
  scene.fog = new THREE.Fog(0x8ecae6, 60, 160);

  const group = new THREE.Group();
  createLighting(group);
  createGround(group);
  createNature(group);
  group.add(createFountain());

  const houseCount = 6;
  for (let houseIndex = 0; houseIndex < houseCount; houseIndex++) {
    const angle = (houseIndex / houseCount) * Math.PI * 2 + 0.4;
    group.add(createHouse(angle, 12));
  }

  const { group: windmill, blades } = createWindmill();
  group.add(windmill);
  scene.add(group);

  return {
    group,
    update(deltaSeconds) {
      blades.rotation.z += deltaSeconds * 0.6;
    },
  };
}
