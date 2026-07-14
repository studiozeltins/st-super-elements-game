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
  createCampFlag,
  createCanopyTree,
  createFlower,
  createMushroom,
  createPalmTree,
  createRockSpire,
  createSpikes,
  createTeepee,
  createTotem,
  createWoodenArch,
  initCanopyWind,
  type SeededRandom,
  type WorldAsset,
} from './assets';
import { createGrassField } from './createGrassField';
import { CAMPFIRE_LIGHT_NAME } from './assets/createCampfire';
import { CAMP_FLAG_CLOTH_NAME } from './assets/createCampFlag';
import {
  FLAG_DISTURB_RADIUS,
  FLAG_IMPULSE_DECAY_SECONDS,
  decayFlagImpulse,
  withinDisturbRadius,
  type FlagImpulse,
} from './assets/flagImpulse';
import { createFountain, createHouse, createWindmill } from './createPlazaStructures';
import type { GroundInfluenceUniforms } from '../systems/createGroundInfluence';
import type { ScorchMapUniforms } from '../systems/createScorchMap';
import type { WindUniforms } from '../systems/createWind';

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
  /**
   * Re-centers the sun's shadow camera on the player (texel-snapped so shadow
   * edges don't crawl while walking). Call once per frame.
   */
  setShadowFocus(x: number, z: number): void;
  /**
   * A projectile flying past kicks nearby camp flags: sets a decaying,
   * direction-aligned impulse on every flag within FLAG_DISTURB_RADIUS of
   * (x,z). dirX/dirZ is the shot's NORMALIZED travel direction. Distance-gated
   * so only flags beside an active shot pay any cost.
   */
  disturbFlags(x: number, z: number, dirX: number, dirZ: number): void;
  /**
   * The mutable render handles the day/night cycle writes through. Day/night
   * NEVER reaches into the scene directly — it drifts .color/.intensity on
   * these lights, mutates the fog/background Colors IN PLACE, and pushes the
   * sky-dome top color via setSkyTop. The sun DIRECTION basis is off-limits
   * (D-02): only .color/.intensity drift, never position.
   */
  ambience: AmbienceHandles;
  dispose(): void;
}

/**
 * Write surface for the day/night cycle (Plan 04). Every member is mutated in
 * place — no field is ever reassigned by the consumer. `fog` and `background`
 * are the live scene objects; `setSkyTop` copies into the gradient sky-dome's
 * topColor uniform (its bottomColor uniform IS `fog.color`, ATMO-02).
 */
export interface AmbienceHandles {
  skyLight: THREE.HemisphereLight;
  sunLight: THREE.DirectionalLight;
  fog: THREE.Fog;
  background: THREE.Color;
  /** Plaza lanterns — Plan 03 populates this; empty until then. */
  lanternLights: THREE.PointLight[];
  /** Copies `c` into the sky-dome topColor uniform in place (zero alloc). */
  setSkyTop(c: THREE.Color): void;
}

interface Platform {
  x: number;
  z: number;
  radius: number;
  topY: number;
}

const WORLD_DECOR_SEED = 0xa11ce;

// getGroundHeight is HOT (per entity, per debris particle, and per telegraph
// vertex each drape). Scanning all ~100 platforms with hypot per call was a
// large share of combat frame CPU — so platforms are bucketed once into a
// coarse XZ grid and each query touches only its own cell's bucket.
const PLATFORM_CELL_SIZE = 8;
// Offset keeps cell coordinates positive so one number can key the Map.
const PLATFORM_CELL_OFFSET = 512;

function platformCellKey(cellX: number, cellZ: number): number {
  return (cellX + PLATFORM_CELL_OFFSET) * (PLATFORM_CELL_OFFSET * 2) + (cellZ + PLATFORM_CELL_OFFSET);
}

/** Buckets each platform into every grid cell its circle overlaps. */
function buildPlatformGrid(platforms: readonly Platform[]): Map<number, Platform[]> {
  const grid = new Map<number, Platform[]>();
  for (const platform of platforms) {
    const minCellX = Math.floor((platform.x - platform.radius) / PLATFORM_CELL_SIZE);
    const maxCellX = Math.floor((platform.x + platform.radius) / PLATFORM_CELL_SIZE);
    const minCellZ = Math.floor((platform.z - platform.radius) / PLATFORM_CELL_SIZE);
    const maxCellZ = Math.floor((platform.z + platform.radius) / PLATFORM_CELL_SIZE);
    for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
        const key = platformCellKey(cellX, cellZ);
        const bucket = grid.get(key);
        if (bucket) bucket.push(platform);
        else grid.set(key, [platform]);
      }
    }
  }
  return grid;
}

export function isInsideSafeZone(positionX: number, positionZ: number): boolean {
  return Math.hypot(positionX, positionZ) <= SAFE_ZONE_RADIUS;
}

// The sun's constant direction offset from the shadow focus point.
const SUN_OFFSET = new THREE.Vector3(30, 50, 20);
// Half-extent of the player-following shadow camera. A world-spanning camera
// (±140) gave ~0.27u per shadow texel — the "blocky enemy shadows". Following
// the player at ±45 is 3x the texel density from the same 1024 map.
const SHADOW_FOCUS_SPAN = 45;
const SHADOW_MAP_SIZE = 1024;

// Fixed light-space basis for texel snapping (the sun never moves relative to
// the focus): moving the shadow camera in world-sized steps that are NOT whole
// shadow texels makes every shadow edge crawl ("shimmer") as the player walks.
const sunDirection = SUN_OFFSET.clone().negate().normalize();
const sunRight = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), sunDirection).normalize();
const sunUp = new THREE.Vector3().crossVectors(sunDirection, sunRight).normalize();
const shadowFocusScratch = new THREE.Vector3();

// Fog near sits well past SAFE_ZONE_RADIUS (18) + typical engage range so the
// whole gameplay radius keeps full contrast at every time of day (ATMO-03); far
// dissolves the world edge (WORLD_BOUND=130 → ATMO-01). Tuned in place; the Fog
// object identity is never swapped (Pitfall 4).
const FOG_NEAR = 80;
const FOG_FAR = 300;

// Fixed-origin sky dome. Radius is cosmetically irrelevant — the gradient reads
// the NORMALIZED world direction, and the vertex shader pins the dome to the far
// plane (xyww) so a static-origin dome is never clipped by the camera far plane
// (500) while the player roams WORLD_BOUND=130 (RESEARCH Open Question 1).
const SKY_DOME_RADIUS = 400;

/**
 * Inward-facing gradient sky dome (classic three.js 2-uniform sky shader).
 * `bottomColor`/`topColor` uniform values are the SAME THREE.Color instances
 * passed in — the caller wires bottomColor to `scene.fog.color` (ATMO-02
 * single-source) and topColor to the setSkyTop scratch, so both drift in place
 * with zero per-frame allocation. `fog:false` (the dome is the fog backdrop,
 * not fogged), `depthWrite:false` + renderOrder -1 so it is pure background
 * fill that every world object overdraws.
 */
function createSkyDome(bottomColor: THREE.Color, topColor: THREE.Color): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: topColor },
      bottomColor: { value: bottomColor },
      offset: { value: 30 },
      exponent: { value: 0.7 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPosition;
      void main() {
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        // xyww pins the dome to the far plane so its fixed origin is never
        // clipped as the camera roams; the gradient uses vWorldPosition (above).
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = clip.xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + offset).y;
        gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
      }
    `,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(SKY_DOME_RADIUS, 32, 15), material);
  dome.renderOrder = -1;
  dome.frustumCulled = false;
  return dome;
}

function createLighting(group: THREE.Group): {
  skyLight: THREE.HemisphereLight;
  sunLight: THREE.DirectionalLight;
} {
  const skyLight = new THREE.HemisphereLight(0xbfe3ff, 0x4a7a3a, 0.9);
  // EVERY light must be visible to EVERY camera layer (world pass + overlay
  // pass). If a pass culls lights, the renderer's lights-state hash flips each
  // frame and three re-initializes every lit material per pass — a massive
  // getParameters/getProgramCacheKey CPU storm.
  skyLight.layers.enableAll();
  group.add(skyLight);

  const sunLight = new THREE.DirectionalLight(0xfff2d8, 1.4);
  sunLight.layers.enableAll();
  sunLight.position.copy(SUN_OFFSET);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  sunLight.shadow.camera.left = -SHADOW_FOCUS_SPAN;
  sunLight.shadow.camera.right = SHADOW_FOCUS_SPAN;
  sunLight.shadow.camera.top = SHADOW_FOCUS_SPAN;
  sunLight.shadow.camera.bottom = -SHADOW_FOCUS_SPAN;
  sunLight.shadow.camera.far = 400;
  // Softer read: shadows darken instead of blacking out (the "harsh" note).
  sunLight.shadow.intensity = 0.72;
  sunLight.shadow.bias = -0.0005;
  group.add(sunLight, sunLight.target);
  return { skyLight, sunLight };
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
  /** Strike-impact scorch map — browns the terrain and dries the grass. */
  scorch: ScorchMapUniforms;
  /** Shared wind clock uniforms — the game loop advances them, grass reads them. */
  wind: WindUniforms;
}

export function createMondstadtWorld(
  scene: THREE.Scene,
  options: MondstadtWorldOptions
): MondstadtWorld {
  // scene.background stays a Color mutated in place forever (the dome occludes
  // it; it is only the fallback fill) — never reassigned, never a Texture, or
  // the overlay-pass save/restore-by-reference breaks (Pitfall 4).
  scene.background = new THREE.Color(0x8ecae6);
  scene.fog = new THREE.Fog(0x8ecae6, FOG_NEAR, FOG_FAR);

  // Gradient sky-dome. bottomColor uniform IS scene.fog.color (SAME reference →
  // ATMO-02: fog + sky-bottom physically cannot diverge); topColor uniform IS
  // skyTopColor, so ambience.setSkyTop writing into it drives the dome directly.
  // Added to `scene` OUTSIDE the frozen world.group so it renders behind it.
  const skyTopColor = new THREE.Color(0x8ecae6);
  const skyDome = createSkyDome(scene.fog.color, skyTopColor);
  scene.add(skyDome);

  const group = new THREE.Group();
  const random = createSeededRandom(WORLD_DECOR_SEED);
  const platforms: Platform[] = [];
  const obstacles: ObstacleCircle[] = [];

  function placeAsset(asset: WorldAsset, x: number, z: number, collisionRadius?: number) {
    const groundY = getTerrainHeight(x, z);
    asset.group.position.set(x, groundY, z);
    group.add(asset.group);
    if (collisionRadius) obstacles.push({ x, y: groundY, z, radius: collisionRadius });
    for (const solid of asset.obstacles ?? []) {
      obstacles.push({
        x: x + solid.x,
        y: groundY,
        z: z + solid.z,
        radius: solid.radius,
        height: solid.height,
      });
    }
    for (const platform of asset.platforms ?? []) {
      platforms.push({
        x: x + platform.x,
        z: z + platform.z,
        radius: platform.radius,
        topY: groundY + platform.topHeight,
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

  const { skyLight, sunLight } = createLighting(group);
  group.add(createTerrainMesh(options.scorch));
  createPlaza(group);
  group.add(createFountain());
  obstacles.push({ x: 0, y: 0, z: 0, radius: 3.0 }); // fountain basin, plaza is flat at y=0
  const grassField = createGrassField({
    ...options.grass,
    scorch: options.scorch,
    wind: options.wind,
  });
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

  // Canopy caps sway in-shader on the shared wind clock — the factory only
  // receives a seeded random through the scatter table, so inject wind first.
  initCanopyWind(options.wind);

  const scatterRules: AssetScatterRule[] = [
    // Boulders and spires declare their own per-piece footprints (asset.obstacles):
    // boulders block their base but stay jump-climbable; spires block full height.
    { create: createBoulder, count: 26, minRadius: SAFE_ZONE_RADIUS + 8, maxSlope: 0.9 },
    { create: createRockSpire, count: 14, minRadius: 52, maxSlope: 1.2 },
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
    placeAroundCamp(createCampFlag(campRandom, options.wind), 5.5);
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

  // All platforms are placed by now — freeze them into the query grid.
  const platformGrid = buildPlatformGrid(platforms);

  // Campfire flames flicker — collect the named lights once, wobble per frame.
  const campfireLights: THREE.PointLight[] = [];
  // Camp flags kick when a projectile flies past. Collect the named cloths once
  // and capture each flag's WORLD xz here (the world is frozen after this, so
  // the position never changes) — disturbFlags then distance-gates without
  // walking any matrix. The impulse object is the SAME reference the cloth's
  // onBeforeRender reads, so setting mag here shows up in-shader next draw.
  const campFlags: { impulse: FlagImpulse; x: number; z: number }[] = [];
  const flagWorldScratch = new THREE.Vector3();
  group.traverse(node => {
    if (node.name === CAMPFIRE_LIGHT_NAME) campfireLights.push(node as THREE.PointLight);
    if (node.name === CAMP_FLAG_CLOTH_NAME) {
      node.getWorldPosition(flagWorldScratch);
      campFlags.push({
        impulse: node.userData.flagImpulse as FlagImpulse,
        x: flagWorldScratch.x,
        z: flagWorldScratch.z,
      });
    }
  });
  let flickerSeconds = 0;

  // Plaza lanterns are collected here by name in a later plan (Plan 03); the
  // day/night cycle fades their intensity. Empty until then.
  const lanternLights: THREE.PointLight[] = [];

  return {
    group,
    update(deltaSeconds) {
      blades.rotation.z += deltaSeconds * 0.6;
      // The frozen world subtree skips auto matrix updates; push the blades'
      // rotation through by hand.
      blades.updateMatrixWorld(true);
      flickerSeconds += deltaSeconds;
      campfireLights.forEach((light, index) => {
        light.intensity = 2.5 + Math.sin(flickerSeconds * 9 + index * 2.1) * 0.35;
      });
      // Decay live flag kicks back to rest. Idle flags (mag 0) are skipped —
      // they cost nothing until a projectile passes.
      for (const flag of campFlags) {
        if (flag.impulse.mag > 0) {
          flag.impulse.mag = decayFlagImpulse(
            flag.impulse.mag,
            deltaSeconds,
            FLAG_IMPULSE_DECAY_SECONDS
          );
        }
      }
    },
    ambience: {
      skyLight,
      sunLight,
      fog: scene.fog,
      background: scene.background as THREE.Color,
      lanternLights,
      setSkyTop(c) {
        skyTopColor.copy(c);
      },
    },
    disturbFlags(x, z, dirX, dirZ) {
      for (const flag of campFlags) {
        if (!withinDisturbRadius(flag.x - x, flag.z - z, FLAG_DISTURB_RADIUS)) continue;
        // Fresh kick overwrites: the newest/nearest shot owns the flag's pose.
        flag.impulse.dirX = dirX;
        flag.impulse.dirZ = dirZ;
        flag.impulse.mag = 1;
      }
    },
    getGroundHeight(x, z, maxSurfaceY = Infinity) {
      let groundHeight = getTerrainHeight(x, z);
      const bucket = platformGrid.get(
        platformCellKey(Math.floor(x / PLATFORM_CELL_SIZE), Math.floor(z / PLATFORM_CELL_SIZE))
      );
      if (!bucket) return groundHeight;
      for (const platform of bucket) {
        if (platform.topY <= groundHeight || platform.topY > maxSurfaceY) continue;
        const deltaX = platform.x - x;
        const deltaZ = platform.z - z;
        if (deltaX * deltaX + deltaZ * deltaZ <= platform.radius * platform.radius) {
          groundHeight = platform.topY;
        }
      }
      return groundHeight;
    },
    getObstacles() {
      return obstacles;
    },
    setShadowFocus(x, z) {
      // Snap the focus to whole shadow texels IN LIGHT SPACE (the sun basis is
      // fixed, so this is a plain 2D grid snap on the light's right/up axes).
      const texelSize = (SHADOW_FOCUS_SPAN * 2) / SHADOW_MAP_SIZE;
      shadowFocusScratch.set(x, 0, z);
      const rightCoord = shadowFocusScratch.dot(sunRight);
      const upCoord = shadowFocusScratch.dot(sunUp);
      shadowFocusScratch
        .addScaledVector(sunRight, Math.round(rightCoord / texelSize) * texelSize - rightCoord)
        .addScaledVector(sunUp, Math.round(upCoord / texelSize) * texelSize - upCoord);
      sunLight.target.position.copy(shadowFocusScratch);
      sunLight.position.copy(shadowFocusScratch).add(SUN_OFFSET);
      // The world subtree is matrix-frozen — push the light's move through by hand.
      sunLight.updateMatrixWorld(true);
      sunLight.target.updateMatrixWorld(true);
    },
    dispose() {
      grassField.dispose();
      scene.remove(skyDome);
      disposeObject(skyDome);
      scene.remove(group);
      disposeObject(group);
    },
  };
}
