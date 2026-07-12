import * as THREE from 'three';
import { disposeObject } from '../engine/disposeObject';
import { SAFE_ZONE_RADIUS, WORLD_BOUND } from '../data/constants';
import { createSeededRandom } from './rng';
import { createTerrainMesh, getTerrainHeight, getTerrainSlope, isOnLand } from './terrain';
import { getBridges, type BridgeSpec } from './bridges';
import { getCampSites } from './camps';
import type { ObstacleCircle } from '../physics/resolveCollisions';
import {
  createBoulder,
  createBush,
  createCampfire,
  createCanopyTree,
  createFlower,
  createMushroom,
  createPalmTree,
  createRockSpire,
  createSpikes,
  createTeepee,
  createTotem,
  createWoodenArch,
  type SeededRandom,
  type WorldAsset,
} from './assets';
import { createGrassField } from './createGrassField';
import { CAMPFIRE_LIGHT_NAME } from './assets/createCampfire';
import { createFountain, createHouse, createWindmill } from './createPlazaStructures';
import type { GroundInfluenceUniforms } from '../systems/createGroundInfluence';

export interface MondstadtWorld {
  group: THREE.Group;
  update(deltaSeconds: number): void;
  /**
   * Walkable height: terrain plus platform tops (boulders, bridges, pillars).
   * Platforms above `maxSurfaceY` are ignored, so unreachable decks overhead
   * do not act as invisible walls for someone walking underneath.
   */
  getGroundHeight(x: number, z: number, maxSurfaceY?: number): number;
  /** Solid trunks/walls entities cannot pass through (trees, spires, houses…). */
  getObstacles(): readonly ObstacleCircle[];
  dispose(): void;
}

interface Platform {
  x: number;
  z: number;
  radius: number;
  topY: number;
}

const WORLD_DECOR_SEED = 0xa11ce;

export function isInsideSafeZone(positionX: number, positionZ: number): boolean {
  return Math.hypot(positionX, positionZ) <= SAFE_ZONE_RADIUS;
}

function createLighting(group: THREE.Group) {
  const skyLight = new THREE.HemisphereLight(0xbfe3ff, 0x4a7a3a, 0.9);
  // EVERY light must be visible to EVERY camera layer (world pass + overlay
  // pass). If a pass culls lights, the renderer's lights-state hash flips each
  // frame and three re-initializes every lit material per pass — a massive
  // getParameters/getProgramCacheKey CPU storm.
  skyLight.layers.enableAll();
  group.add(skyLight);

  const sunLight = new THREE.DirectionalLight(0xfff2d8, 1.4);
  sunLight.layers.enableAll();
  sunLight.position.set(30, 50, 20);
  sunLight.castShadow = true;
  // 1024 halves shadow raster cost vs 2048; at the pixelated internal
  // resolution the softer edge is invisible.
  sunLight.shadow.mapSize.set(1024, 1024);
  const shadowSpan = WORLD_BOUND + 10;
  sunLight.shadow.camera.left = -shadowSpan;
  sunLight.shadow.camera.right = shadowSpan;
  sunLight.shadow.camera.top = shadowSpan;
  sunLight.shadow.camera.bottom = -shadowSpan;
  sunLight.shadow.camera.far = 400;
  group.add(sunLight);
}

function createPlaza(group: THREE.Group) {
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

interface AssetScatterRule {
  create(random: SeededRandom): WorldAsset;
  count: number;
  minRadius: number;
  maxSlope: number;
  /** Solid trunk/base radius; omitted means entities can walk through. */
  collisionRadius?: number;
}

/** Uniform sample across the whole map, rejected until it lands on an island. */
function findRandomLandPosition(
  random: SeededRandom,
  minDistanceFromOrigin: number
): { x: number; z: number } | null {
  for (let attempt = 0; attempt < 40; attempt++) {
    const x = (random() * 2 - 1) * (WORLD_BOUND - 4);
    const z = (random() * 2 - 1) * (WORLD_BOUND - 4);
    if (Math.hypot(x, z) < minDistanceFromOrigin) continue;
    if (!isOnLand(x, z)) continue;
    return { x, z };
  }
  return null;
}

const BRIDGE_SEGMENT_LENGTH = 2;
const BRIDGE_WIDTH = 3;
const BRIDGE_ARC_LIFT = 1.2;
/** Covers the full plank width even midway between segment centers. */
const BRIDGE_WALK_RADIUS = 1.85;

const PILLAR_STAIR_CLUSTER_COUNT = 5;
const PILLAR_STEP_HEIGHT = 1.5;

export interface MondstadtWorldOptions {
  grass: {
    bladeCount: number;
    influence: GroundInfluenceUniforms;
  };
}

export function createMondstadtWorld(
  scene: THREE.Scene,
  options: MondstadtWorldOptions
): MondstadtWorld {
  scene.background = new THREE.Color(0x8ecae6);
  scene.fog = new THREE.Fog(0x8ecae6, 80, 300);

  const group = new THREE.Group();
  const random = createSeededRandom(WORLD_DECOR_SEED);
  const platforms: Platform[] = [];
  const obstacles: ObstacleCircle[] = [];

  function placeAsset(asset: WorldAsset, x: number, z: number, collisionRadius?: number) {
    const groundY = getTerrainHeight(x, z);
    asset.group.position.set(x, groundY, z);
    group.add(asset.group);
    if (collisionRadius) obstacles.push({ x, y: groundY, z, radius: collisionRadius });
    if (asset.platformRadius && asset.platformTopHeight) {
      platforms.push({
        x,
        z,
        radius: asset.platformRadius,
        topY: groundY + asset.platformTopHeight,
      });
    }
  }

  function scatterAssets(rule: AssetScatterRule) {
    let placed = 0;
    let attempts = 0;
    while (placed < rule.count && attempts < rule.count * 12) {
      attempts++;
      const landPosition = findRandomLandPosition(random, rule.minRadius);
      if (!landPosition) continue;
      if (getTerrainSlope(landPosition.x, landPosition.z) > rule.maxSlope) continue;
      placeAsset(rule.create(random), landPosition.x, landPosition.z, rule.collisionRadius);
      placed++;
    }
  }

  function addInstancedMatrices(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    matrices: THREE.Matrix4[]
  ) {
    const instancedMesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    instancedMesh.castShadow = true;
    matrices.forEach((matrix, index) => instancedMesh.setMatrixAt(index, matrix));
    group.add(instancedMesh);
  }

  function buildBridges() {
    const dummy = new THREE.Object3D();
    const plankMatrices: THREE.Matrix4[] = [];
    const postMatrices: THREE.Matrix4[] = [];

    for (const bridge of getBridges()) {
      const heading = Math.atan2(bridge.endX - bridge.startX, bridge.endZ - bridge.startZ);
      const segmentCount = Math.max(2, Math.ceil(bridge.length / BRIDGE_SEGMENT_LENGTH));
      for (let segmentIndex = 0; segmentIndex <= segmentCount; segmentIndex++) {
        const progress = segmentIndex / segmentCount;
        const x = bridge.startX + (bridge.endX - bridge.startX) * progress;
        const z = bridge.startZ + (bridge.endZ - bridge.startZ) * progress;
        const deckY =
          bridge.startY +
          (bridge.endY - bridge.startY) * progress +
          Math.sin(progress * Math.PI) * BRIDGE_ARC_LIFT;

        dummy.position.set(x, deckY - 0.12, z);
        dummy.rotation.set(0, heading, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        plankMatrices.push(dummy.matrix.clone());
        platforms.push({ x, z, radius: BRIDGE_WALK_RADIUS, topY: deckY });

        if (segmentIndex % 3 !== 0) continue;
        for (const side of [-1, 1]) {
          dummy.position.set(
            x + Math.cos(heading) * side * (BRIDGE_WIDTH / 2),
            deckY + 0.4,
            z - Math.sin(heading) * side * (BRIDGE_WIDTH / 2)
          );
          dummy.updateMatrix();
          postMatrices.push(dummy.matrix.clone());
        }
      }
    }

    addInstancedMatrices(
      new THREE.BoxGeometry(BRIDGE_WIDTH, 0.25, BRIDGE_SEGMENT_LENGTH * 1.1),
      new THREE.MeshLambertMaterial({ color: 0x8a5a3a }),
      plankMatrices
    );
    addInstancedMatrices(
      new THREE.BoxGeometry(0.16, 1.1, 0.16),
      new THREE.MeshLambertMaterial({ color: 0x6b4a2f }),
      postMatrices
    );
  }

  function buildPillarStairs() {
    const dummy = new THREE.Object3D();
    const pillarMatrices: THREE.Matrix4[] = [];

    for (let clusterIndex = 0; clusterIndex < PILLAR_STAIR_CLUSTER_COUNT; clusterIndex++) {
      const clusterCenter = findRandomLandPosition(random, SAFE_ZONE_RADIUS + 6);
      if (!clusterCenter) continue;
      const pillarCount = 3 + Math.floor(random() * 3);
      const spiralPhase = random() * Math.PI * 2;
      // Each top chains from the previous one so every hop is one jumpable step.
      let previousTopY = getTerrainHeight(clusterCenter.x, clusterCenter.z);

      for (let pillarIndex = 0; pillarIndex < pillarCount; pillarIndex++) {
        const angle = spiralPhase + pillarIndex * 1.9;
        const x = clusterCenter.x + Math.cos(angle) * 2.6;
        const z = clusterCenter.z + Math.sin(angle) * 2.6;
        if (!isOnLand(x, z)) continue;
        const groundY = getTerrainHeight(x, z);
        const topY = previousTopY + PILLAR_STEP_HEIGHT;
        previousTopY = topY;
        const pillarHeight = topY - groundY;
        if (pillarHeight < PILLAR_STEP_HEIGHT * 0.5) continue;

        // Unit-height cylinder scaled per pillar so one geometry serves all.
        dummy.position.set(x, groundY + pillarHeight / 2, z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, pillarHeight, 1);
        dummy.updateMatrix();
        pillarMatrices.push(dummy.matrix.clone());
        platforms.push({ x, z, radius: 1.2, topY });
      }
    }

    // A plain cuboid pillar: reads voxel natively and tolerates per-pillar
    // y-stretch (voxel cells would deform under the non-uniform scale).
    addInstancedMatrices(
      new THREE.BoxGeometry(2.2, 1, 2.2),
      new THREE.MeshLambertMaterial({ color: 0x5a6678 }),
      pillarMatrices
    );
  }

  createLighting(group);
  group.add(createTerrainMesh());
  createPlaza(group);
  group.add(createFountain());
  obstacles.push({ x: 0, y: 0, z: 0, radius: 3.0 }); // fountain basin, plaza is flat at y=0
  const grassField = createGrassField(options.grass);
  group.add(grassField.group);
  buildBridges();
  buildPillarStairs();

  const houseCount = 6;
  for (let houseIndex = 0; houseIndex < houseCount; houseIndex++) {
    const angle = (houseIndex / houseCount) * Math.PI * 2 + 0.4;
    const house = createHouse(random, angle, 12);
    group.add(house);
    obstacles.push({
      x: house.position.x,
      y: getTerrainHeight(house.position.x, house.position.z),
      z: house.position.z,
      radius: 2.8,
    });
  }
  const { group: windmill, blades } = createWindmill();
  group.add(windmill);
  obstacles.push({
    x: windmill.position.x,
    y: getTerrainHeight(windmill.position.x, windmill.position.z),
    z: windmill.position.z,
    radius: 2.1,
  });

  const scatterRules: AssetScatterRule[] = [
    // Boulders stay obstacle-free: they are climbable platforms.
    { create: createBoulder, count: 26, minRadius: SAFE_ZONE_RADIUS + 8, maxSlope: 0.9 },
    { create: createRockSpire, count: 14, minRadius: 52, maxSlope: 1.2, collisionRadius: 1.5 },
    { create: createCanopyTree, count: 8, minRadius: 30, maxSlope: 0.45, collisionRadius: 0.7 },
    {
      create: createPalmTree,
      count: 14,
      minRadius: SAFE_ZONE_RADIUS + 4,
      maxSlope: 0.4,
      collisionRadius: 0.45,
    },
    { create: createBush, count: 24, minRadius: SAFE_ZONE_RADIUS + 2, maxSlope: 0.6 },
    { create: createMushroom, count: 12, minRadius: SAFE_ZONE_RADIUS + 4, maxSlope: 0.6 },
    { create: createFlower, count: 16, minRadius: SAFE_ZONE_RADIUS + 1, maxSlope: 0.5 },
  ];
  for (const rule of scatterRules) scatterAssets(rule);

  for (const campSite of getCampSites()) {
    const campRandom = createSeededRandom(
      WORLD_DECOR_SEED ^ (Math.round(campSite.x * 31 + campSite.z * 17) | 0)
    );
    const placeAroundCamp = (asset: WorldAsset, radius: number, collisionRadius?: number) => {
      const angle = campRandom() * Math.PI * 2;
      placeAsset(
        asset,
        campSite.x + Math.cos(angle) * radius,
        campSite.z + Math.sin(angle) * radius,
        collisionRadius
      );
    };
    placeAsset(createCampfire(campRandom), campSite.x, campSite.z, 0.8);
    placeAroundCamp(createTeepee(campRandom), 4.5, 1.4);
    placeAroundCamp(createTeepee(campRandom), 5, 1.4);
    placeAroundCamp(createTotem(campRandom), 3.5, 0.5);
    placeAroundCamp(createSpikes(campRandom), 6);
    placeAroundCamp(createSpikes(campRandom), 6.5);
    if (campRandom() < 0.5) placeAroundCamp(createWoodenArch(campRandom), 7);
  }

  scene.add(group);

  // The world is static: compute every matrix ONCE and freeze the subtree.
  // Recomputing thousands of prop matrices on every render pass was ~11% of
  // combat frame CPU. The windmill blades are the only mover — world.update
  // refreshes just their branch each frame.
  group.updateMatrixWorld(true);
  group.matrixWorldAutoUpdate = false;

  // Campfire flames flicker — collect the named lights once, wobble per frame.
  const campfireLights: THREE.PointLight[] = [];
  group.traverse(node => {
    if (node.name === CAMPFIRE_LIGHT_NAME) campfireLights.push(node as THREE.PointLight);
  });
  let flickerSeconds = 0;

  return {
    group,
    update(deltaSeconds) {
      blades.rotation.z += deltaSeconds * 0.6;
      // The frozen world subtree skips auto matrix updates; push the blades'
      // rotation through by hand.
      blades.updateMatrixWorld(true);
      grassField.update(deltaSeconds);
      flickerSeconds += deltaSeconds;
      campfireLights.forEach((light, index) => {
        light.intensity = 2.5 + Math.sin(flickerSeconds * 9 + index * 2.1) * 0.35;
      });
    },
    getGroundHeight(x, z, maxSurfaceY = Infinity) {
      let groundHeight = getTerrainHeight(x, z);
      for (const platform of platforms) {
        if (platform.topY <= groundHeight || platform.topY > maxSurfaceY) continue;
        if (Math.hypot(platform.x - x, platform.z - z) <= platform.radius) {
          groundHeight = platform.topY;
        }
      }
      return groundHeight;
    },
    getObstacles() {
      return obstacles;
    },
    dispose() {
      grassField.dispose();
      scene.remove(group);
      disposeObject(group);
    },
  };
}
