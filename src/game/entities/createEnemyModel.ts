import * as THREE from 'three';
import type { EnemyArchetype } from '../data/enemyArchetypes';

export interface EnemyModel {
  group: THREE.Group;
  body: THREE.Mesh;
  healthBarFill: THREE.Sprite;
  /** Element status icon above the enemy (solid = strong aura, blink = fading). */
  auraIcon: THREE.Sprite;
}

// Module-lifetime resources shared across all enemies and system instances.
const sharedBodyGeometry = new THREE.SphereGeometry(0.75, 10, 8);
const sharedEyeGeometry = new THREE.SphereGeometry(0.09, 6, 6);
const sharedSpikeGeometry = new THREE.ConeGeometry(0.14, 0.5, 5);
const sharedGolemTorsoGeometry = new THREE.BoxGeometry(1.1, 1.2, 0.8);
const sharedGolemHeadGeometry = new THREE.BoxGeometry(0.6, 0.5, 0.55);
const sharedGolemArmGeometry = new THREE.BoxGeometry(0.35, 1.1, 0.4);
const sharedEyeMaterial = new THREE.MeshBasicMaterial({ color: 0x101410 });
const sharedSpikeMaterial = new THREE.MeshLambertMaterial({ color: 0x3a4a2a });

function createHealthBar(group: THREE.Group, barHeight: number): THREE.Sprite {
  const background = new THREE.Sprite(
    new THREE.SpriteMaterial({ color: 0x141814, depthTest: false })
  );
  background.scale.set(1.3, 0.14, 1);
  background.position.y = barHeight;
  const fill = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x7ec843, depthTest: false }));
  fill.scale.set(1.2, 0.09, 1);
  fill.position.y = barHeight;
  group.add(background, fill);
  return fill;
}

function addEyes(group: THREE.Group, y: number, z: number) {
  const leftEye = new THREE.Mesh(sharedEyeGeometry, sharedEyeMaterial);
  leftEye.position.set(-0.22, y, z);
  const rightEye = leftEye.clone();
  rightEye.position.x = 0.22;
  group.add(leftEye, rightEye);
}

function buildSlimeBody(group: THREE.Group, archetype: EnemyArchetype, withSpikes: boolean) {
  const body = new THREE.Mesh(
    sharedBodyGeometry,
    new THREE.MeshLambertMaterial({ color: archetype.bodyColor, emissive: 0x000000 })
  );
  body.scale.y = 0.72;
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  addEyes(group, 0.7, 0.6);

  if (!withSpikes) return body;
  for (let spikeIndex = 0; spikeIndex < 6; spikeIndex++) {
    const angle = (spikeIndex / 6) * Math.PI * 2;
    const spike = new THREE.Mesh(sharedSpikeGeometry, sharedSpikeMaterial);
    spike.position.set(Math.cos(angle) * 0.5, 0.9, Math.sin(angle) * 0.5);
    spike.rotation.set(Math.sin(angle) * 0.6, 0, -Math.cos(angle) * 0.6);
    group.add(spike);
  }
  return body;
}

function buildWispBody(group: THREE.Group, archetype: EnemyArchetype) {
  const body = new THREE.Mesh(
    sharedBodyGeometry,
    new THREE.MeshLambertMaterial({
      color: archetype.bodyColor,
      emissive: archetype.bodyColor,
      emissiveIntensity: 0.4,
      transparent: true,
      opacity: 0.85,
    })
  );
  body.scale.setScalar(0.7);
  body.position.y = 1.1;
  group.add(body);
  addEyes(group, 1.2, 0.45);
  return body;
}

function buildGolemBody(group: THREE.Group, archetype: EnemyArchetype) {
  const stoneMaterial = new THREE.MeshLambertMaterial({
    color: archetype.bodyColor,
    emissive: 0x000000,
  });
  const body = new THREE.Mesh(sharedGolemTorsoGeometry, stoneMaterial);
  body.position.y = 0.9;
  body.castShadow = true;
  const head = new THREE.Mesh(sharedGolemHeadGeometry, stoneMaterial);
  head.position.y = 1.75;
  head.castShadow = true;
  const leftArm = new THREE.Mesh(sharedGolemArmGeometry, stoneMaterial);
  leftArm.position.set(-0.75, 0.85, 0);
  const rightArm = leftArm.clone();
  rightArm.position.x = 0.75;
  group.add(body, head, leftArm, rightArm);
  addEyes(group, 1.8, 0.3);
  return body;
}

export function createEnemyModel(archetype: EnemyArchetype, scale: number): EnemyModel {
  const group = new THREE.Group();
  let body: THREE.Mesh;
  if (archetype.id === 'stoneGolem') body = buildGolemBody(group, archetype);
  else if (archetype.id === 'windWisp') body = buildWispBody(group, archetype);
  else body = buildSlimeBody(group, archetype, archetype.id === 'spikySlime');

  const barHeight = archetype.id === 'stoneGolem' ? 2.3 : 1.6;
  const healthBarFill = createHealthBar(group, barHeight);

  const auraIcon = new THREE.Sprite(
    new THREE.SpriteMaterial({ color: 0xffffff, depthTest: false, transparent: true })
  );
  auraIcon.scale.set(0.42, 0.42, 1);
  auraIcon.position.y = barHeight + 0.4;
  auraIcon.visible = false;
  group.add(auraIcon);

  group.scale.setScalar(scale);
  return { group, body, healthBarFill, auraIcon };
}

export function disposeEnemyModel(model: EnemyModel) {
  (model.body.material as THREE.Material).dispose();
  model.group.traverse(node => {
    if (node instanceof THREE.Sprite) node.material.dispose();
  });
  model.group.removeFromParent();
}
