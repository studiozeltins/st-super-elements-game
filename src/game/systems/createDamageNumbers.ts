import * as THREE from 'three';
import { DAMAGE_KIND_STYLES, type DamageKind } from '../combat/damageKind';
import { OVERLAY_LAYER } from '../data/constants';

export interface DamageNumbers {
  spawn(worldPosition: THREE.Vector3, amount: number, kind: DamageKind, color?: number): void;
  update(deltaSeconds: number): void;
  dispose(): void;
}

interface FloatingNumber {
  sprite: THREE.Sprite;
  texture: THREE.CanvasTexture;
  context: CanvasHardware;
  baseScaleX: number;
  baseScaleY: number;
  ageSeconds: number;
  active: boolean;
}

interface CanvasHardware {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

const CANVAS_WIDTH = 256;
const CANVAS_HEIGHT = 128;
const LIFETIME_SECONDS = 0.95;
const RISE_SPEED = 2.4;
const MAX_ACTIVE_NUMBERS = 64;
const BASE_WORLD_HEIGHT = 0.9;

function createCanvasHardware(): CanvasHardware {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  return { canvas, ctx: canvas.getContext('2d')! };
}

function drawNumber(
  hardware: CanvasHardware,
  amount: number,
  kind: DamageKind,
  overrideCssColor: string | null
) {
  const { ctx } = hardware;
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  const style = DAMAGE_KIND_STYLES[kind];
  const fontSize = Math.round(52 * style.fontScale);
  ctx.font = `900 ${fontSize}px "Chakra Petch", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label =
    kind === 'crit' || kind === 'takenCrit' || kind === 'pvpCrit'
      ? `${amount}!`
      : kind === 'heal'
        ? `+${amount}`
        : `${amount}`;
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(8, 12, 9, 0.85)';
  ctx.strokeText(label, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
  ctx.fillStyle = overrideCssColor ?? style.cssColor;
  ctx.fillText(label, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
}

function toCssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

// Candidate offsets tried in order at spawn: center first, then alternating
// sides, then an upper row — the first slot not colliding with a live number
// wins, so simultaneous hits fan out instead of stacking on each other.
const SLOT_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1.0, 0],
  [-1.0, 0],
  [2.0, 0],
  [-2.0, 0],
  [0.5, 0.7],
  [-0.5, 0.7],
  [1.5, 0.7],
  [-1.5, 0.7],
  [0, 1.4],
];
// A slot collides when a live number sits closer than these (sprite ≈ 2.1×1.05
// world units; z-window keeps far-apart fights from blocking each other's slots).
const CLEAR_X = 1.35;
const CLEAR_Y = 0.75;
const CLEAR_Z = 2.5;

export function createDamageNumbers(scene: THREE.Scene): DamageNumbers {
  const pool: FloatingNumber[] = [];
  let spawnCounter = 0;

  function findClearOffset(baseX: number, baseY: number, baseZ: number): readonly [number, number] {
    for (const offset of SLOT_OFFSETS) {
      let clear = true;
      for (const entry of pool) {
        if (!entry.active) continue;
        const position = entry.sprite.position;
        if (
          Math.abs(baseX + offset[0] - position.x) < CLEAR_X &&
          Math.abs(baseY + offset[1] - position.y) < CLEAR_Y &&
          Math.abs(baseZ - position.z) < CLEAR_Z
        ) {
          clear = false;
          break;
        }
      }
      if (clear) return offset;
    }
    // Everything crowded (burst of 10+): fall back to the small deterministic fan.
    return [(spawnCounter % 5) * 0.16 - 0.32, 0];
  }

  function acquire(): FloatingNumber | null {
    const reused = pool.find(entry => !entry.active);
    if (reused) return reused;
    if (pool.length >= MAX_ACTIVE_NUMBERS) return null;

    const hardware = createCanvasHardware();
    const texture = new THREE.CanvasTexture(hardware.canvas);
    texture.magFilter = THREE.NearestFilter;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true })
    );
    sprite.layers.set(OVERLAY_LAYER); // crisp: rendered in the native-res overlay pass
    sprite.visible = false;
    scene.add(sprite);
    const entry: FloatingNumber = {
      sprite,
      texture,
      context: hardware,
      baseScaleX: 0,
      baseScaleY: 0,
      ageSeconds: 0,
      active: false,
    };
    pool.push(entry);
    return entry;
  }

  return {
    spawn(worldPosition, amount, kind, color) {
      const entry = acquire();
      if (!entry) return;
      const roundedAmount = Math.max(1, Math.round(amount));
      drawNumber(entry.context, roundedAmount, kind, color === undefined ? null : toCssColor(color));
      entry.texture.needsUpdate = true;

      // Bumped up from 1.4 so numbers stay legible on small/high-DPI mobile screens.
      const worldScale = 2.1 * DAMAGE_KIND_STYLES[kind].fontScale;
      entry.baseScaleX = worldScale;
      entry.baseScaleY = worldScale * (CANVAS_HEIGHT / CANVAS_WIDTH);
      entry.sprite.scale.set(entry.baseScaleX, entry.baseScaleY, 1);
      entry.sprite.position.copy(worldPosition);
      entry.sprite.position.y += BASE_WORLD_HEIGHT;
      const offset = findClearOffset(
        entry.sprite.position.x,
        entry.sprite.position.y,
        entry.sprite.position.z
      );
      entry.sprite.position.x += offset[0];
      entry.sprite.position.y += offset[1];
      spawnCounter++;
      entry.sprite.visible = true;
      entry.ageSeconds = 0;
      entry.active = true;
    },
    update(deltaSeconds) {
      for (const entry of pool) {
        if (!entry.active) continue;
        entry.ageSeconds += deltaSeconds;
        const progress = entry.ageSeconds / LIFETIME_SECONDS;
        if (progress >= 1) {
          entry.active = false;
          entry.sprite.visible = false;
          continue;
        }
        entry.sprite.position.y += RISE_SPEED * deltaSeconds;
        const material = entry.sprite.material as THREE.SpriteMaterial;
        material.opacity = 1 - progress * progress;
        // Small pop-in then settle.
        const popScale = 1 + Math.max(0, 0.35 - progress) * 0.8;
        entry.sprite.scale.set(entry.baseScaleX * popScale, entry.baseScaleY * popScale, 1);
      }
    },
    dispose() {
      for (const entry of pool) {
        scene.remove(entry.sprite);
        entry.texture.dispose();
        (entry.sprite.material as THREE.SpriteMaterial).dispose();
      }
      pool.length = 0;
    },
  };
}
