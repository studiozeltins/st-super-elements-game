import * as THREE from 'three';
import type { EnemyArchetype } from '../data/enemyArchetypes';
import { OVERLAY_LAYER } from '../data/constants';

/** One element status dot to draw: color + remaining time (1→0). */
export interface StatusDot {
  colorHex: number;
  remaining: number;
}

export interface OverlayState {
  healthFraction: number;
  /** Server-tracked gems this enemy is hoarding; a gold pill shows when > 0. */
  carriedGems: number;
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
// Tall enough for the status dots, health bar, and the carried-gem pill below it.
const OVERLAY_CANVAS_HEIGHT = 128;
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

const GEM_PILL_Y = 84;
const GEM_PILL_HEIGHT = 22;

/** A rounded gold badge with a gem glyph + count, centered under the bar. */
function drawGemPill(ctx: CanvasRenderingContext2D, carriedGems: number) {
  const label = `◆ ${formatGemCount(carriedGems)}`;
  ctx.font = 'bold 16px sans-serif';
  ctx.textBaseline = 'middle';
  const textWidth = ctx.measureText(label).width;
  const pillWidth = textWidth + 22;
  const pillX = (OVERLAY_CANVAS_WIDTH - pillWidth) / 2;
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(8, 12, 9, 0.72)';
  ctx.beginPath();
  ctx.roundRect(pillX - 2, GEM_PILL_Y - 2, pillWidth + 4, GEM_PILL_HEIGHT + 4, 12);
  ctx.fill();
  ctx.fillStyle = '#f2c14e';
  ctx.beginPath();
  ctx.roundRect(pillX, GEM_PILL_Y, pillWidth, GEM_PILL_HEIGHT, 10);
  ctx.fill();
  ctx.fillStyle = '#2a1e06';
  ctx.textAlign = 'center';
  ctx.fillText(label, OVERLAY_CANVAS_WIDTH / 2, GEM_PILL_Y + GEM_PILL_HEIGHT / 2 + 1);
  ctx.textAlign = 'start';
}

/** Compact hoard count: 12, 1.2k, 15k. */
function formatGemCount(amount: number): string {
  if (amount < 1000) return String(amount);
  const thousands = amount / 1000;
  return `${thousands >= 10 ? Math.round(thousands) : thousands.toFixed(1)}k`;
}

export function createEnemyOverlay(scale: number, barHeight: number): EnemyOverlay {
  const canvas = document.createElement('canvas');
  canvas.width = OVERLAY_CANVAS_WIDTH;
  canvas.height = OVERLAY_CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.layers.set(OVERLAY_LAYER); // crisp: rendered in the native-res overlay pass
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

    // Carried-gem pill under the bar — a gold badge with the hoard count so the
    // loot an enemy is holding reads at a glance (consistent for every client).
    if (state.carriedGems > 0) drawGemPill(ctx, state.carriedGems);

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
        state.carriedGems,
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
  /**
   * Slime-only inner group holding EVERY visual part (body, eyes, spikes) but
   * NOT the overlay sprite — the hop bounce arcs/squashes this rig as one blob
   * without dragging the health bar along. Origin sits at ground level so a
   * squash presses the blob into the ground instead of scaling about its middle.
   */
  rig?: THREE.Group;
}

// Module-lifetime resources shared across all enemies and system instances.
const sharedBodyGeometry = new THREE.SphereGeometry(0.75, 10, 8);
const sharedEyeGeometry = new THREE.SphereGeometry(0.09, 6, 6);
const sharedSpikeGeometry = new THREE.ConeGeometry(0.14, 0.5, 5);
const sharedGolemTorsoGeometry = new THREE.BoxGeometry(1.1, 1.2, 0.8);
const sharedGolemHeadGeometry = new THREE.BoxGeometry(0.6, 0.5, 0.55);
const sharedGolemArmGeometry = new THREE.BoxGeometry(0.35, 1.1, 0.4);
const sharedGolemEyeMaterial = new THREE.MeshBasicMaterial({ color: 0xffab3d });
const sharedSpikeMaterial = new THREE.MeshLambertMaterial({ color: 0x3a4a2a });

// ---- Baked slime skin -------------------------------------------------------
// All the surface nuance lives in ONE procedural canvas texture per archetype
// (built once, shared by every instance): vertical light gradient, mottled
// spots, a lighter belly, glowing oval Genshin-style eyes, and a gloss patch.
// Zero extra meshes/draw calls — the blob itself carries the detail.

// Low-res on purpose: 48px around the whole sphere ≈ chunky texels that read
// as PIXEL ART (with nearest filtering), matching the voxel world — a smooth
// gradient would read as plastic.
const SKIN_SIZE = 48;
// SphereGeometry maps world +Z (the facing direction) to u = 0.25.
const SKIN_FRONT_X = Math.round(SKIN_SIZE * 0.25);

function seededRandomFrom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function cssColor(hex: number, lightness: number): string {
  const color = new THREE.Color(hex);
  color.multiplyScalar(lightness);
  return `#${color.getHexString()}`;
}

/** Pixel-art eye: a dark-rimmed tall oval with a glowing core, in whole texels. */
function drawPixelEye(ctx: CanvasRenderingContext2D, centerX: number, eyeCss: string) {
  const top = 19;
  // Rim column widths per row build the oval from stacked rects (pixel-art style).
  const rimRows = [2, 4, 4, 4, 4, 4, 4, 2];
  rimRows.forEach((width, rowIndex) => {
    ctx.fillStyle = '#141a12';
    ctx.fillRect(centerX - width / 2, top + rowIndex, width, 1);
  });
  ctx.fillStyle = eyeCss;
  ctx.fillRect(centerX - 1, top + 1, 2, 6);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(centerX - 1, top + 2, 1, 2);
}

/**
 * The slime's pixel-art skin, painted texel by texel: banded + dithered
 * vertical light, single-pixel speckle, a dithered belly patch, glowing eyes,
 * and a pixel gloss cap. Deterministic per archetype (seeded by body color).
 */
function buildSlimeSkin(bodyColor: number, eyeCss: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = SKIN_SIZE;
  canvas.height = SKIN_SIZE;
  const ctx = canvas.getContext('2d')!;
  const random = seededRandomFrom(bodyColor);

  // Banded gradient with checkerboard dither at each band seam — the classic
  // pixel-art shading ramp (crown bright → sod dark).
  const BANDS = [1.35, 1.15, 1.0, 0.82, 0.6];
  for (let y = 0; y < SKIN_SIZE; y += 1) {
    for (let x = 0; x < SKIN_SIZE; x += 1) {
      const bandPosition = (y / SKIN_SIZE) * (BANDS.length - 1);
      let band = Math.floor(bandPosition);
      // Within the seam zone, half the texels (checker) take the next band.
      if (bandPosition - band > 0.65 && (x + y) % 2 === 0) band += 1;
      ctx.fillStyle = cssColor(bodyColor, BANDS[Math.min(band, BANDS.length - 1)]);
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Single-texel speckle — jelly impurities.
  for (let speck = 0; speck < 70; speck += 1) {
    const x = Math.floor(random() * SKIN_SIZE);
    const y = 6 + Math.floor(random() * (SKIN_SIZE - 6));
    ctx.fillStyle = cssColor(bodyColor, random() < 0.6 ? 0.72 : 1.35);
    ctx.fillRect(x, y, 1, 1);
  }

  // Dither-edged lighter belly patch under the face.
  ctx.fillStyle = cssColor(bodyColor, 1.25);
  for (let y = 30; y < 42; y += 1) {
    const halfWidth = 10 - Math.abs(y - 36);
    for (let x = SKIN_FRONT_X - halfWidth; x <= SKIN_FRONT_X + halfWidth; x += 1) {
      const isEdge = Math.abs(x - SKIN_FRONT_X) > halfWidth - 2;
      if (isEdge && (x + y) % 2 === 0) continue; // dithered rim
      ctx.fillRect(x, y, 1, 1);
    }
  }

  drawPixelEye(ctx, SKIN_FRONT_X - 3, eyeCss);
  drawPixelEye(ctx, SKIN_FRONT_X + 3, eyeCss);

  // Pixel gloss cap: two stepped white dashes on the upper-left shoulder.
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillRect(4, 4, 5, 2);
  ctx.fillRect(3, 6, 3, 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // Nearest on both axes keeps the texels square and crisp — the pixel look.
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

// Body materials are never mutated per-instance, so each archetype shares ONE —
// respawns during farming otherwise made three re-resolve shader programs.
const sharedBodyMaterials = new Map<string, THREE.MeshLambertMaterial>();
function bodyMaterialFor(
  archetype: EnemyArchetype,
  create: () => THREE.MeshLambertMaterial
): THREE.MeshLambertMaterial {
  let material = sharedBodyMaterials.get(archetype.id);
  if (!material) {
    material = create();
    sharedBodyMaterials.set(archetype.id, material);
  }
  return material;
}

function addEyes(group: THREE.Group, y: number, z: number) {
  const leftEye = new THREE.Mesh(sharedEyeGeometry, sharedGolemEyeMaterial);
  leftEye.position.set(-0.22, y, z);
  const rightEye = leftEye.clone();
  rightEye.position.x = 0.22;
  group.add(leftEye, rightEye);
}

function buildSlimeBody(
  group: THREE.Group,
  archetype: EnemyArchetype,
  withSpikes: boolean
): { body: THREE.Mesh; rig: THREE.Group } {
  // Every visual part lives on the rig (origin at ground level) so the hop
  // bounce moves body + eyes + spikes as one blob — see EnemyModel.rig.
  const rig = new THREE.Group();
  group.add(rig);
  const body = new THREE.Mesh(
    sharedBodyGeometry,
    bodyMaterialFor(
      archetype,
      () =>
        new THREE.MeshLambertMaterial({
          // The baked skin carries color, gradient, spots, eyes, and gloss —
          // no separate face/decoration meshes, no extra draw calls.
          map: buildSlimeSkin(archetype.bodyColor, '#ffdf8f'),
          emissive: 0x000000,
        })
    )
  );
  body.scale.y = 0.72;
  body.position.y = 0.55;
  body.castShadow = true;
  rig.add(body);

  if (!withSpikes) return { body, rig };
  for (let spikeIndex = 0; spikeIndex < 6; spikeIndex++) {
    const angle = (spikeIndex / 6) * Math.PI * 2;
    const spike = new THREE.Mesh(sharedSpikeGeometry, sharedSpikeMaterial);
    spike.position.set(Math.cos(angle) * 0.5, 0.9, Math.sin(angle) * 0.5);
    spike.rotation.set(Math.sin(angle) * 0.6, 0, -Math.cos(angle) * 0.6);
    rig.add(spike);
  }
  return { body, rig };
}

function buildWispBody(group: THREE.Group, archetype: EnemyArchetype) {
  const body = new THREE.Mesh(
    sharedBodyGeometry,
    bodyMaterialFor(
      archetype,
      () =>
        new THREE.MeshLambertMaterial({
          map: buildSlimeSkin(archetype.bodyColor, '#eafff4'),
          emissive: archetype.bodyColor,
          emissiveIntensity: 0.4,
          transparent: true,
          opacity: 0.85,
        })
    )
  );
  body.scale.setScalar(0.7);
  body.position.y = 1.1;
  group.add(body);
  return body;
}

function buildGolemBody(group: THREE.Group, archetype: EnemyArchetype) {
  const stoneMaterial = bodyMaterialFor(
    archetype,
    () => new THREE.MeshLambertMaterial({ color: archetype.bodyColor, emissive: 0x000000 })
  );
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
  addEyes(group, 1.8, 0.3); // amber-lit glare (geo-slime read)
  return body;
}

export function createEnemyModel(archetype: EnemyArchetype, scale: number): EnemyModel {
  const group = new THREE.Group();
  let body: THREE.Mesh;
  let rig: THREE.Group | undefined;
  if (archetype.id === 'stoneGolem') body = buildGolemBody(group, archetype);
  else if (archetype.id === 'windWisp') body = buildWispBody(group, archetype);
  else ({ body, rig } = buildSlimeBody(group, archetype, archetype.id === 'spikySlime'));

  const barHeight = archetype.id === 'stoneGolem' ? 2.7 : 2.0;
  const overlay = createEnemyOverlay(scale, barHeight);
  group.add(overlay.sprite);

  group.scale.setScalar(scale);
  return { group, body, overlay, rig };
}

export function disposeEnemyModel(model: EnemyModel) {
  // Body material is shared per archetype (sharedBodyMaterials) — never dispose.
  model.overlay.dispose();
  model.group.traverse(node => {
    if (node instanceof THREE.Sprite) node.material.dispose();
  });
  model.group.removeFromParent();
}
