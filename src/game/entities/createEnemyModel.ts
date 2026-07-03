import * as THREE from 'three';
import type { EnemyArchetype } from '../data/enemyArchetypes';

/** One element status dot to draw: color + remaining time (1→0). */
export interface StatusDot {
  colorHex: number;
  remaining: number;
}

export interface OverlayState {
  healthFraction: number;
  aura: StatusDot | null;
  reaction: StatusDot | null;
}

/**
 * A single billboard sprite drawing the whole enemy overlay: a modern health
 * bar plus the element status dots. Because it always faces the camera the
 * dots stay horizontally side by side on screen (a world-space offset would
 * project diagonally in the isometric view).
 */
export interface EnemyOverlay {
  sprite: THREE.Sprite;
  update(state: OverlayState): void;
  dispose(): void;
}

const OVERLAY_CANVAS_WIDTH = 256;
const OVERLAY_CANVAS_HEIGHT = 96;
const OVERLAY_WORLD_WIDTH = 1.7;
// Redraw only when a value crosses one of this many buckets.
const OVERLAY_BUCKETS = 40;

const DOT_RADIUS = 19;
const DOT_CENTER_Y = 26;
const DOT_LEFT_X = 30;
const DOT_RIGHT_X = 74;

const BAR_X = 18;
const BAR_Y = 60;
const BAR_WIDTH = 220;
const BAR_HEIGHT = 20;
const BAR_RADIUS = 10;

function toCss(colorHex: number): string {
  return `#${colorHex.toString(16).padStart(6, '0')}`;
}

function healthColor(fraction: number): string {
  if (fraction > 0.5) return '#7ec843';
  if (fraction > 0.25) return '#f2c14e';
  return '#ff5c3c';
}

function drawDot(ctx: CanvasRenderingContext2D, centerX: number, dot: StatusDot) {
  const css = toCss(dot.colorHex);
  const remaining = Math.max(0, Math.min(1, dot.remaining));
  ctx.globalAlpha = 0.28; // dim full disc = total duration
  ctx.beginPath();
  ctx.arc(centerX, DOT_CENTER_Y, DOT_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = css;
  ctx.fill();
  ctx.globalAlpha = 1; // bright wedge = remaining time
  ctx.beginPath();
  ctx.moveTo(centerX, DOT_CENTER_Y);
  ctx.arc(centerX, DOT_CENTER_Y, DOT_RADIUS, -Math.PI / 2, -Math.PI / 2 + remaining * Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = css;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(8, 12, 9, 0.85)';
  ctx.beginPath();
  ctx.arc(centerX, DOT_CENTER_Y, DOT_RADIUS, 0, Math.PI * 2);
  ctx.stroke();
}

function createEnemyOverlay(scale: number, barHeight: number): EnemyOverlay {
  const canvas = document.createElement('canvas');
  canvas.width = OVERLAY_CANVAS_WIDTH;
  canvas.height = OVERLAY_CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  const localWidth = OVERLAY_WORLD_WIDTH / scale; // constant on-screen size for any enemy
  sprite.scale.set(localWidth, localWidth * (OVERLAY_CANVAS_HEIGHT / OVERLAY_CANVAS_WIDTH), 1);
  sprite.position.y = barHeight;

  let lastKey = '';

  function redraw(state: OverlayState) {
    ctx.clearRect(0, 0, OVERLAY_CANVAS_WIDTH, OVERLAY_CANVAS_HEIGHT);

    // Modern health bar: rounded dark track + rounded colored fill.
    const fraction = Math.max(0, Math.min(1, state.healthFraction));
    ctx.fillStyle = 'rgba(8, 12, 9, 0.72)';
    ctx.beginPath();
    ctx.roundRect(BAR_X - 3, BAR_Y - 3, BAR_WIDTH + 6, BAR_HEIGHT + 6, BAR_RADIUS + 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(232, 245, 224, 0.14)';
    ctx.beginPath();
    ctx.roundRect(BAR_X, BAR_Y, BAR_WIDTH, BAR_HEIGHT, BAR_RADIUS);
    ctx.fill();
    if (fraction > 0) {
      ctx.fillStyle = healthColor(fraction);
      ctx.beginPath();
      ctx.roundRect(BAR_X, BAR_Y, BAR_WIDTH * fraction, BAR_HEIGHT, BAR_RADIUS);
      ctx.fill();
      // Glossy top highlight.
      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.beginPath();
      ctx.roundRect(BAR_X + 2, BAR_Y + 2, Math.max(0, BAR_WIDTH * fraction - 4), BAR_HEIGHT * 0.4, BAR_RADIUS);
      ctx.fill();
    }

    // Element dots, left-aligned above the bar, side by side.
    if (state.aura) drawDot(ctx, DOT_LEFT_X, state.aura);
    if (state.reaction) drawDot(ctx, state.reaction && state.aura ? DOT_RIGHT_X : DOT_LEFT_X, state.reaction);

    ctx.globalAlpha = 1;
    texture.needsUpdate = true;
  }

  function bucket(value: number): number {
    return Math.round(Math.max(0, Math.min(1, value)) * OVERLAY_BUCKETS);
  }

  return {
    sprite,
    update(state) {
      const key = [
        bucket(state.healthFraction),
        state.aura ? `${state.aura.colorHex}:${bucket(state.aura.remaining)}` : '-',
        state.reaction ? `${state.reaction.colorHex}:${bucket(state.reaction.remaining)}` : '-',
      ].join('|');
      if (key === lastKey) return;
      lastKey = key;
      redraw(state);
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
  overlay: EnemyOverlay;
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

  const barHeight = archetype.id === 'stoneGolem' ? 2.7 : 2.0;
  const overlay = createEnemyOverlay(scale, barHeight);
  group.add(overlay.sprite);

  group.scale.setScalar(scale);
  return { group, body, overlay };
}

export function disposeEnemyModel(model: EnemyModel) {
  (model.body.material as THREE.Material).dispose();
  model.overlay.dispose();
  model.group.traverse(node => {
    if (node instanceof THREE.Sprite) node.material.dispose();
  });
  model.group.removeFromParent();
}
