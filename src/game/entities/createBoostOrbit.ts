import * as THREE from 'three';

/**
 * Būsts orbit — purple shard-stars that circle the local player, one per
 * installed būsts level. The lower the player's health, the faster they whirl
 * (a glanceable "danger" tell). v1 uses a flat circular path; random paths and
 * varied star shapes are planned follow-ups.
 *
 * The orbit is a scene-level group repositioned onto the player each frame
 * (rather than parented to the character model), so it survives the model swap
 * that happens on a character change without needing to re-attach.
 */

const SHARD_COLOR = '#9333ea'; // --shard
const ORBIT_HEIGHT = 1.15; // above the feet, around the torso
const ORBIT_RADIUS = 1.05;
const STAR_SIZE = 0.36;
const BOB_AMPLITUDE = 0.14;
const BASE_SPEED = 1.2; // rad/s at full health
const LOW_HP_SPEED = 6.0; // extra rad/s as health → 0

function createStarTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;

  // Soft radial glow.
  const glow = ctx.createRadialGradient(c, c, 0, c, c, c);
  glow.addColorStop(0, 'rgba(196, 132, 252, 0.95)');
  glow.addColorStop(0.4, 'rgba(147, 51, 234, 0.55)');
  glow.addColorStop(1, 'rgba(147, 51, 234, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  // Four-point shard star on top of the glow.
  const outer = c * 0.9;
  const inner = c * 0.32;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const x = c + Math.cos(a) * r;
    const y = c + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = '#f3e8ff';
  ctx.shadowColor = SHARD_COLOR;
  ctx.shadowBlur = 10;
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export interface BoostOrbit {
  /** Scene-level group holding the orbiting stars. Add this to the scene once. */
  group: THREE.Object3D;
  /** Call every frame with the player's world position, būsts count, and health. */
  update(params: {
    position: THREE.Vector3;
    transcend: number;
    healthFraction: number;
    deltaSeconds: number;
  }): void;
  dispose(): void;
}

export function createBoostOrbit(): BoostOrbit {
  const group = new THREE.Group();
  const texture = createStarTexture();
  const stars: THREE.Sprite[] = [];
  let angle = 0;

  function setCount(count: number) {
    while (stars.length < count) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          // Depth-tested so world geometry (e.g. a goliath standing over the
          // player) occludes the orbs instead of them shining through.
          depthTest: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      sprite.scale.setScalar(STAR_SIZE);
      group.add(sprite);
      stars.push(sprite);
    }
    while (stars.length > count) {
      const sprite = stars.pop()!;
      group.remove(sprite);
      (sprite.material as THREE.SpriteMaterial).dispose();
    }
  }

  return {
    group,
    update({ position, transcend, healthFraction, deltaSeconds }) {
      if (stars.length !== transcend) setCount(transcend);
      group.position.set(position.x, position.y + ORBIT_HEIGHT, position.z);
      if (transcend === 0) return;

      const hp = Math.max(0, Math.min(1, healthFraction));
      const speed = BASE_SPEED + (1 - hp) * LOW_HP_SPEED;
      angle += speed * deltaSeconds;

      const count = stars.length;
      for (let i = 0; i < count; i++) {
        const phase = (i / count) * Math.PI * 2;
        const a = angle + phase;
        const sprite = stars[i];
        sprite.position.set(
          Math.cos(a) * ORBIT_RADIUS,
          Math.sin(a * 2 + phase) * BOB_AMPLITUDE,
          Math.sin(a) * ORBIT_RADIUS
        );
        // Gentle twinkle so the ring never reads as static.
        (sprite.material as THREE.SpriteMaterial).opacity = 0.72 + 0.28 * Math.sin(a * 3 + phase);
      }
    },
    dispose() {
      setCount(0);
      texture.dispose();
    },
  };
}
