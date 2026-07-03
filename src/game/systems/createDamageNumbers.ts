import * as THREE from 'three';
import { DAMAGE_KIND_STYLES, type DamageKind } from '../combat/damageKind';

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
  const label = kind === 'crit' ? `${amount}!` : `${amount}`;
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(8, 12, 9, 0.85)';
  ctx.strokeText(label, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
  ctx.fillStyle = overrideCssColor ?? style.cssColor;
  ctx.fillText(label, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
}

function toCssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

export function createDamageNumbers(scene: THREE.Scene): DamageNumbers {
  const pool: FloatingNumber[] = [];
  let spawnCounter = 0;

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

      const worldScale = 1.4 * DAMAGE_KIND_STYLES[kind].fontScale;
      entry.baseScaleX = worldScale;
      entry.baseScaleY = worldScale * (CANVAS_HEIGHT / CANVAS_WIDTH);
      entry.sprite.scale.set(entry.baseScaleX, entry.baseScaleY, 1);
      entry.sprite.position.copy(worldPosition);
      entry.sprite.position.y += BASE_WORLD_HEIGHT;
      // Fan successive spawns sideways so simultaneous equal hits do not stack.
      entry.sprite.position.x += (spawnCounter % 5) * 0.16 - 0.32;
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
