import * as THREE from 'three';
import type { GoliathArchetype } from '../data/goliathArchetypes';
import { createEnemyOverlay, type EnemyModel } from './createEnemyModel';

// A Goliath Raider towers over the slimes, so its overlay rides well above the
// raised sword and helmet. Local units (pre-scale); the group scale multiplies it.
const OVERLAY_BAR_HEIGHT = 4.2;

// Module-lifetime geometry shared across every Goliath instance. Boxy limbs match
// the stone golem's blocky construction idiom in createEnemyModel.ts.
const torsoGeometry = new THREE.BoxGeometry(1.3, 1.5, 0.8);
const headGeometry = new THREE.BoxGeometry(0.75, 0.7, 0.7);
const armGeometry = new THREE.BoxGeometry(0.42, 1.3, 0.45);
const legGeometry = new THREE.BoxGeometry(0.45, 1.1, 0.5);
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
const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x101410 });
const shieldMaterial = new THREE.MeshLambertMaterial({ color: 0x8a8f99 });
const shieldBossMaterial = new THREE.MeshLambertMaterial({ color: 0xf2c14e });
const swordBladeMaterial = new THREE.MeshLambertMaterial({ color: 0xd7dbe0 });
const swordHiltMaterial = new THREE.MeshLambertMaterial({ color: 0x4a3a2a });

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
function buildArm(shoulderX: number, armorMaterial: THREE.Material): THREE.Group {
  const shoulder = new THREE.Group();
  shoulder.position.set(shoulderX, 2.4, 0);
  const arm = new THREE.Mesh(armGeometry, armorMaterial);
  arm.position.y = -0.65; // hangs down from the shoulder pivot
  arm.castShadow = true;
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
export function createGoliathModel(archetype: GoliathArchetype): EnemyModel {
  const group = new THREE.Group();
  const armorMaterial = new THREE.MeshLambertMaterial({ color: archetype.bodyColor });

  const torso = new THREE.Mesh(torsoGeometry, armorMaterial);
  torso.position.y = 1.85;
  torso.castShadow = true;
  torso.name = 'torso';

  const head = new THREE.Mesh(headGeometry, armorMaterial);
  head.position.y = 2.95;
  head.castShadow = true;
  head.name = 'head';
  addMenacingFace(head, armorMaterial);

  const leftLeg = new THREE.Mesh(legGeometry, armorMaterial);
  leftLeg.position.set(-0.34, 0.55, 0);
  leftLeg.castShadow = true;
  leftLeg.name = 'leftLeg';
  const rightLeg = leftLeg.clone();
  rightLeg.position.x = 0.34;
  rightLeg.name = 'rightLeg';

  const leftArm = buildArm(-0.85, armorMaterial);
  leftArm.name = 'leftArm';
  const shield = buildShield();
  shield.position.set(-0.1, -0.9, 0.34);
  leftArm.add(shield);

  const rightArm = buildArm(0.85, armorMaterial);
  rightArm.name = 'rightArm';
  const sword = buildSword();
  sword.position.set(0, -1.05, 0.32);
  rightArm.add(sword);

  group.add(torso, head, leftLeg, rightLeg, leftArm, rightArm);

  const overlay = createEnemyOverlay(archetype.modelScale, OVERLAY_BAR_HEIGHT);
  group.add(overlay.sprite);

  group.scale.setScalar(archetype.modelScale);
  return { group, body: torso, overlay };
}
