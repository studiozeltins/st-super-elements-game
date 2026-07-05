import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { attackHitsEntity, MAX_ATTACK_RADIUS } from '../hitTest';

// The server's attackEnemies reducer is the authority on damage. It damages an
// enemy iff distanceBetween(enemy, center) <= min(radius, MAX_ATTACK_RADIUS).
// This mirrors that formula so the tests below assert the CLIENT hit-test (which
// drives combo + projectile despawn) agrees with it exactly — i.e. combo can only
// ever tick when the server actually deals damage.
function serverWouldDamage(
  entityX: number,
  entityZ: number,
  centerX: number,
  centerZ: number,
  radius: number
): boolean {
  const bounded = Math.max(0, Math.min(radius, MAX_ATTACK_RADIUS));
  return Math.hypot(entityX - centerX, entityZ - centerZ) <= bounded;
}

describe('attackHitsEntity', () => {
  it('hits inside and on the radius, misses outside', () => {
    expect(attackHitsEntity(0, 0, 0, 0, 2)).toBe(true); // dead centre
    expect(attackHitsEntity(2, 0, 0, 0, 2)).toBe(true); // exactly on the edge
    expect(attackHitsEntity(2.01, 0, 0, 0, 2)).toBe(false); // just outside
  });

  // The exact bug: with a projectile radius of 2, an enemy 2.4 units away took no
  // server damage, yet the old client radius (radius + 0.8 = 2.8) counted combo
  // and burst the projectile. Combo climbed with no damage.
  it('does NOT count a hit in the old padded band (2.0–2.8) at radius 2', () => {
    for (const distance of [2.1, 2.4, 2.79]) {
      expect(attackHitsEntity(distance, 0, 0, 0, 2)).toBe(false);
      expect(serverWouldDamage(distance, 0, 0, 0, 2)).toBe(false);
    }
  });

  it('agrees with the server damage check across many cases (combo iff damage)', () => {
    const centers = [
      { x: 0, z: 0 },
      { x: 10, z: -4 },
      { x: -100, z: 30 },
    ];
    const radii = [1.4, 2, 3, 15, 25]; // includes an oversized radius (> cap)
    for (const center of centers) {
      for (const radius of radii) {
        for (let dx = -30; dx <= 30; dx += 1.3) {
          for (let dz = -30; dz <= 30; dz += 1.3) {
            const ex = center.x + dx;
            const ez = center.z + dz;
            expect(attackHitsEntity(ex, ez, center.x, center.z, radius)).toBe(
              serverWouldDamage(ex, ez, center.x, center.z, radius)
            );
          }
        }
      }
    }
  });

  it('clamps an oversized radius to the same cap the server uses', () => {
    // At distance 22 with a huge requested radius, both cap at MAX_ATTACK_RADIUS
    // (20) and therefore miss — a client cannot conjure a wider hit than the server.
    expect(attackHitsEntity(22, 0, 0, 0, 9999)).toBe(false);
    expect(serverWouldDamage(22, 0, 0, 0, 9999)).toBe(false);
    expect(attackHitsEntity(19, 0, 0, 0, 9999)).toBe(true);
  });
});

// Guard the client's MAX_ATTACK_RADIUS against the server literal so the two hit
// radii can never silently drift apart (which would re-open the combo/damage gap).
describe('MAX_ATTACK_RADIUS mirrors the server', () => {
  it('matches spacetimedb/src/index.ts', () => {
    const serverSource = readFileSync(resolve(process.cwd(), 'spacetimedb/src/index.ts'), 'utf8');
    const match = serverSource.match(/const MAX_ATTACK_RADIUS\s*=\s*(\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBe(MAX_ATTACK_RADIUS);
  });
});
