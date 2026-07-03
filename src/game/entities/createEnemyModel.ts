import * as THREE from 'three';
import type { EnemyArchetype } from '../data/enemyArchetypes';

/**
 * A circular element dot with a radial countdown: the bright pie wedge shows
 * the remaining fraction of the aura / reaction, so the player reads how long
 * it stays active. Owns its own canvas so each enemy times independently.
 */
export interface StatusIcon {
  sprite: THREE.Sprite;
  /** remaining 1→0, tinted colorHex; blink dims it near expiry. */
  show(remaining: number, colorHex: number, blink: boolean, elapsedSeconds: number): void;
  hide(): void;
  dispose(): void;
}

const ICON_WORLD_SIZE = 0.5;
const ICON_CANVAS_SIZE = 64;
const ICON_RADIUS = 25;
// Redraw only when the remaining time crosses one of this many buckets.
const TIMER_BUCKETS = 40;

function toCss(colorHex: number): string {
  return `#${colorHex.toString(16).padStart(6, '0')}`;
}

function createStatusIcon(scale: number, localX: number, localY: number): StatusIcon {
  const canvas = document.createElement('canvas');
  canvas.width = ICON_CANVAS_SIZE;
  canvas.height = ICON_CANVAS_SIZE;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  const localSize = ICON_WORLD_SIZE / scale; // constant on-screen size for any enemy
  sprite.scale.set(localSize, localSize, 1);
  sprite.position.set(localX, localY, 0);
  sprite.visible = false;

  let lastBucket = -1;
  let lastColor = -1;

  function redraw(remaining: number, colorHex: number) {
    const center = ICON_CANVAS_SIZE / 2;
    ctx.clearRect(0, 0, ICON_CANVAS_SIZE, ICON_CANVAS_SIZE);
    const css = toCss(colorHex);
    // Dim full disc = total duration.
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(center, center, ICON_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = css;
    ctx.fill();
    // Bright pie wedge from the top, clockwise = remaining time.
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.arc(center, center, ICON_RADIUS, -Math.PI / 2, -Math.PI / 2 + remaining * Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = css;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(8, 12, 9, 0.85)';
    ctx.beginPath();
    ctx.arc(center, center, ICON_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    texture.needsUpdate = true;
  }

  return {
    sprite,
    show(remaining, colorHex, blink, elapsedSeconds) {
      sprite.visible = true;
      const clamped = Math.max(0, Math.min(1, remaining));
      const bucket = Math.round(clamped * TIMER_BUCKETS);
      if (bucket !== lastBucket || colorHex !== lastColor) {
        redraw(clamped, colorHex);
        lastBucket = bucket;
        lastColor = colorHex;
      }
      material.opacity = blink ? 0.4 + Math.abs(Math.sin(elapsedSeconds * 9)) * 0.6 : 1;
    },
    hide() {
      sprite.visible = false;
    },
    dispose() {
      texture.dispose();
      material.dispose();
    },
  };
}

export interface EnemyModel {
  group: THREE.Group;
  body: THREE.Mesh;
  healthBarFill: THREE.Sprite;
  /** Standing element aura, with a remaining-time ring. */
  auraIcon: StatusIcon;
  /** Active reaction damage-over-time, with its own remaining-time ring. */
  reactionIcon: StatusIcon;
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

  // Two dots side by side at the same height above the enemy.
  const iconHeight = barHeight + 0.45;
  const iconOffset = 0.3 / scale;
  const auraIcon = createStatusIcon(scale, -iconOffset, iconHeight);
  const reactionIcon = createStatusIcon(scale, iconOffset, iconHeight);
  group.add(auraIcon.sprite, reactionIcon.sprite);

  group.scale.setScalar(scale);
  return { group, body, healthBarFill, auraIcon, reactionIcon };
}

export function disposeEnemyModel(model: EnemyModel) {
  (model.body.material as THREE.Material).dispose();
  model.auraIcon.dispose();
  model.reactionIcon.dispose();
  model.group.traverse(node => {
    if (node instanceof THREE.Sprite) node.material.dispose();
  });
  model.group.removeFromParent();
}
