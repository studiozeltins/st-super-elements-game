import * as THREE from 'three';
import type { GoliathArchetype } from '../data/goliathArchetypes';
import { createSeededRandom } from '../world/rng';
import { boxVoxelCells, buildVoxelCluster } from '../world/assets/voxelHelpers';
import { createEnemyOverlay, type EnemyModel } from './createEnemyModel';

// A Goliath Raider towers over the slimes, so its overlay rides well above the
// raised sword and helmet. Local units (pre-scale); the group scale multiplies it.
const OVERLAY_BAR_HEIGHT = 4.2;

// Body parts are VOXEL shells (same visual language as the world's rocks — the
// plain BoxGeometry read as "naked blocks"). Cell size tuned per part so limbs
// stay chunky-but-shaped; geometry is built once per (part, size) and shared.
const BODY_PART_DIMS = {
  torso: { width: 1.3, height: 1.5, depth: 0.8, voxel: 0.3 },
  head: { width: 0.75, height: 0.7, depth: 0.7, voxel: 0.24 },
  arm: { width: 0.42, height: 1.3, depth: 0.45, voxel: 0.22 },
  leg: { width: 0.45, height: 1.1, depth: 0.5, voxel: 0.24 },
} as const;
type BodyPart = keyof typeof BODY_PART_DIMS;

const browGeometry = new THREE.BoxGeometry(0.24, 0.07, 0.08);
const eyeGeometry = new THREE.SphereGeometry(0.1, 6, 6);

// The left arm's shield: a flat vertical slab. The right arm's sword: a long blade
// above a crossguard and hilt.
const shieldGeometry = new THREE.BoxGeometry(0.9, 1.3, 0.16);
const swordBladeGeometry = new THREE.BoxGeometry(0.16, 1.9, 0.34);
const swordCrossguardGeometry = new THREE.BoxGeometry(0.6, 0.16, 0.2);
const swordHiltGeometry = new THREE.BoxGeometry(0.14, 0.42, 0.16);

// Shared materials for the fixed-colour war gear and menacing eyes. Only the armour
// material varies per archetype (built from bodyColor), so disposing that one
// per-instance material — as disposeEnemyModel does via model.body — is sufficient.
const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xffab3d }); // burning amber glare
const shieldMaterial = new THREE.MeshLambertMaterial({ color: 0x8a8f99 });
const shieldBossMaterial = new THREE.MeshLambertMaterial({ color: 0xf2c14e });
const swordBladeMaterial = new THREE.MeshLambertMaterial({ color: 0xd7dbe0 });
const swordHiltMaterial = new THREE.MeshLambertMaterial({ color: 0x4a3a2a });

// Armor dressing: a raider wears plate, not bare boxes. Unit-cube geometry
// scaled per part; dark steel + leather + the shield's gold for trim.
const plateGeometry = new THREE.BoxGeometry(1, 1, 1);
const plateMaterial = new THREE.MeshLambertMaterial({ color: 0x565e6a });
const leatherMaterial = swordHiltMaterial;
const trimMaterial = shieldBossMaterial;

/** Chestplate + gold trim, belt, and shoulder pauldrons hung on the torso. */
function dressTorso(torso: THREE.Mesh) {
  const chestplate = new THREE.Mesh(plateGeometry, plateMaterial);
  chestplate.scale.set(1.06, 0.85, 0.18);
  chestplate.position.set(0, 0.18, 0.42);
  const trim = new THREE.Mesh(plateGeometry, trimMaterial);
  trim.scale.set(1.08, 0.12, 0.2);
  trim.position.set(0, -0.3, 0.42);
  const belt = new THREE.Mesh(plateGeometry, leatherMaterial);
  belt.scale.set(1.36, 0.22, 0.86);
  belt.position.y = -0.68;
  const buckle = new THREE.Mesh(plateGeometry, trimMaterial);
  buckle.scale.set(0.24, 0.24, 0.1);
  buckle.position.set(0, -0.68, 0.44);
  torso.add(chestplate, trim, belt, buckle);
  for (const side of [-1, 1]) {
    const pauldron = new THREE.Mesh(plateGeometry, plateMaterial);
    pauldron.scale.set(0.56, 0.3, 0.62);
    pauldron.position.set(side * 0.72, 0.72, 0);
    pauldron.rotation.z = side * -0.22;
    pauldron.castShadow = true;
    torso.add(pauldron);
  }
}

/** Helmet band + crest fin on the head — the raider's silhouette from afar. */
function dressHead(head: THREE.Mesh) {
  const band = new THREE.Mesh(plateGeometry, plateMaterial);
  band.scale.set(0.82, 0.2, 0.76);
  band.position.y = 0.34; // clears the angry brows below

  const crest = new THREE.Mesh(plateGeometry, trimMaterial);
  crest.scale.set(0.1, 0.34, 0.62);
  crest.position.y = 0.52;
  crest.castShadow = true;
  head.add(band, crest);
}

/** Two dark eyes under angled brows on the +Z front of the head — a fixed scowl. */
function addMenacingFace(head: THREE.Object3D, armorMaterial: THREE.Material) {
  const frontZ = 0.36;
  const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
  leftEye.position.set(-0.17, 0.03, frontZ);
  const rightEye = leftEye.clone();
  rightEye.position.x = 0.17;

  const leftBrow = new THREE.Mesh(browGeometry, armorMaterial);
  leftBrow.position.set(-0.17, 0.19, frontZ);
  leftBrow.rotation.z = -0.5; // inner ends drop toward the nose = angry
  const rightBrow = leftBrow.clone();
  rightBrow.position.x = 0.17;
  rightBrow.rotation.z = 0.5;

  head.add(leftEye, rightEye, leftBrow, rightBrow);
}

/** A pivot at the shoulder so the system can swing the whole arm plus its war gear. */
function buildArm(shoulderX: number, archetype: GoliathArchetype): THREE.Group {
  const shoulder = new THREE.Group();
  shoulder.position.set(shoulderX, 2.4, 0);
  const arm = voxelBodyPart('arm', archetype);
  arm.position.y = -0.65; // hangs down from the shoulder pivot
  shoulder.add(arm);
  return shoulder;
}

/** A flat slab shield with a central boss, facing forward from the hand. */
function buildShield(): THREE.Mesh {
  const shield = new THREE.Mesh(shieldGeometry, shieldMaterial);
  shield.castShadow = true;
  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), shieldBossMaterial);
  boss.scale.z = 0.5;
  boss.position.z = 0.1;
  shield.add(boss);
  shield.name = 'shield';
  return shield;
}

/** A raised sword: long blade above a crossguard and a gripped hilt. */
function buildSword(): THREE.Group {
  const sword = new THREE.Group();
  const hilt = new THREE.Mesh(swordHiltGeometry, swordHiltMaterial);
  const crossguard = new THREE.Mesh(swordCrossguardGeometry, swordBladeMaterial);
  crossguard.position.y = 0.28;
  const blade = new THREE.Mesh(swordBladeGeometry, swordBladeMaterial);
  blade.position.y = 1.31; // base at the crossguard, tip high overhead
  blade.castShadow = true;
  sword.add(hilt, crossguard, blade);
  sword.name = 'sword';
  return sword;
}

/**
 * Builds the visual model for a Goliath Raider: a large armoured humanoid with a
 * shield in the left hand and a raised sword in the right. Returns the same shape
 * as createEnemyModel (group + body mesh + reused overlay) so the enemy system can
 * drop it in interchangeably, animate the named limbs, and dispose it with
 * disposeEnemyModel. Named parts: torso, head, leftLeg, rightLeg, leftArm,
 * rightArm, shield, sword.
 */
// Armor is never mutated per-instance, so each size shares ONE material —
// same rule as camp enemies' sharedBodyMaterials: per-spawn materials make
// three re-resolve shader programs on every goliath (re)spawn.
const sharedArmorMaterials = new Map<number, THREE.MeshLambertMaterial>();
function armorMaterialFor(archetype: GoliathArchetype): THREE.MeshLambertMaterial {
  let material = sharedArmorMaterials.get(archetype.sizeIndex);
  if (!material) {
    material = new THREE.MeshLambertMaterial({ color: archetype.bodyColor });
    sharedArmorMaterials.set(archetype.sizeIndex, material);
  }
  return material;
}

// Voxel body-part geometry, built once per (part, size): dithered 3-shade
// palette from the size's body color — the same per-cube shade jitter the
// world's voxel rocks use — merged into one geometry, shared by every instance.
const voxelPartGeometries = new Map<string, THREE.BufferGeometry>();
let voxelPartMaterial: THREE.Material | null = null;

function voxelBodyPart(part: BodyPart, archetype: GoliathArchetype): THREE.Mesh {
  const key = `${part}:${archetype.sizeIndex}`;
  let geometry = voxelPartGeometries.get(key);
  if (!geometry) {
    const dims = BODY_PART_DIMS[part];
    const base = new THREE.Color(archetype.bodyColor);
    const shades = [
      base.clone().multiplyScalar(0.78).getHex(),
      archetype.bodyColor,
      base.clone().multiplyScalar(1.22).getHex(),
    ];
    // Deterministic dither per (part, size) so every client sees one skin.
    const random = createSeededRandom((archetype.sizeIndex * 31 + part.length) >>> 0);
    const cluster = buildVoxelCluster(
      boxVoxelCells(dims.width, dims.height, dims.depth, dims.voxel),
      dims.voxel,
      shades,
      random
    );
    geometry = cluster.geometry;
    voxelPartMaterial = cluster.material as THREE.Material;
    voxelPartGeometries.set(key, geometry);
  }
  const mesh = new THREE.Mesh(geometry, voxelPartMaterial!);
  mesh.castShadow = true;
  return mesh;
}

export function createGoliathModel(archetype: GoliathArchetype): EnemyModel {
  const group = new THREE.Group();
  const armorMaterial = armorMaterialFor(archetype);

  const torso = voxelBodyPart('torso', archetype);
  torso.position.y = 1.85;
  torso.name = 'torso';
  dressTorso(torso);

  const head = voxelBodyPart('head', archetype);
  head.position.y = 2.95;
  head.name = 'head';
  addMenacingFace(head, armorMaterial);
  dressHead(head);

  const leftLeg = voxelBodyPart('leg', archetype);
  leftLeg.position.set(-0.34, 0.55, 0);
  leftLeg.name = 'leftLeg';
  const leftBoot = new THREE.Mesh(plateGeometry, leatherMaterial);
  leftBoot.scale.set(0.52, 0.3, 0.58);
  leftBoot.position.y = -0.42;
  leftLeg.add(leftBoot);
  const rightLeg = leftLeg.clone();
  rightLeg.position.x = 0.34;
  rightLeg.name = 'rightLeg';

  const leftArm = buildArm(-0.85, archetype);
  leftArm.name = 'leftArm';
  const shield = buildShield();
  shield.position.set(-0.1, -0.9, 0.34);
  leftArm.add(shield);

  const rightArm = buildArm(0.85, archetype);
  rightArm.name = 'rightArm';
  const sword = buildSword();
  sword.position.set(0, -1.05, 0.32);
  rightArm.add(sword);

  // Spin rig: EVERY visual part hangs off this pivot so a swirl rotates the
  // whole raider (torso-only spin left the head/arms/legs standing still).
  // The overlay sprite stays on the outer group — health bars never spin.
  const rig = new THREE.Group();
  rig.name = 'rig';
  rig.add(torso, head, leftLeg, rightLeg, leftArm, rightArm);
  group.add(rig);

  const overlay = createEnemyOverlay(archetype.modelScale, OVERLAY_BAR_HEIGHT);
  group.add(overlay.sprite);

  group.scale.setScalar(archetype.modelScale);
  return { group, body: torso, overlay, rig };
}
