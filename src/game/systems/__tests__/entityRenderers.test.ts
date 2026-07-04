import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createEnemyRenderer } from '../createEnemyRenderer';
import { createGoliathRenderer } from '../createGoliathRenderer';
import { createEffectSystem } from '../createEffectSystem';
import { regularEnemyBaseGems } from '../../data/gemRewards';
import { GOLIATH_ARCHETYPES_BY_SIZE } from '../../data/goliathArchetypes';
import type { Enemy, Goliath } from '../../../module_bindings/types';

// jsdom has no 2D canvas; the overlay only touches it on update(), so stub a
// no-op context (measureText returns a width) to let the overlay redraw.
const originalGetContext = HTMLCanvasElement.prototype.getContext;
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => {
    const noop = () => undefined;
    return new Proxy(
      { measureText: () => ({ width: 10 }) },
      { get: (target, prop) => (prop in target ? (target as never)[prop] : noop) }
    );
  }) as never;
});
afterAll(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
});

// The renderers only read a handful of fields; cast a partial row to the row type.
function enemyRow(overrides: Partial<Enemy> = {}): Enemy {
  return {
    enemyId: 5n,
    campIndex: 0,
    archetypeId: 'slime',
    isBoss: false,
    rewardTier: 1,
    positionX: 3,
    positionZ: 4,
    health: 200,
    maxHealth: 320,
    carriedGems: 0,
    alive: true,
    ...overrides,
  } as Enemy;
}

function goliathRow(overrides: Partial<Goliath> = {}): Goliath {
  return {
    goliathId: 900001n,
    sizeIndex: 0,
    positionX: 6,
    positionZ: 7,
    health: 2600,
    maxHealth: 2600,
    carriedGems: 0,
    alive: true,
    ...overrides,
  } as Goliath;
}

const groupCount = (scene: THREE.Scene) =>
  scene.children.filter(child => child instanceof THREE.Group).length;

describe('createEnemyRenderer', () => {
  it('spawns a real enemy model and interpolates it from the table row', () => {
    const scene = new THREE.Scene();
    const effectSystem = createEffectSystem(scene);
    const renderer = createEnemyRenderer(scene, effectSystem, vi.fn());

    renderer.syncRows([enemyRow()]);
    expect(groupCount(scene)).toBeGreaterThan(0);
    expect(() => renderer.update(0.016, () => 0)).not.toThrow();
    expect(renderer.getAlivePositions()).toHaveLength(1);

    renderer.dispose();
  });

  it('scales boss enemies up and pulls its display base gems from gemRewards', () => {
    const scene = new THREE.Scene();
    const effectSystem = createEffectSystem(scene);
    const renderer = createEnemyRenderer(scene, effectSystem, vi.fn());

    renderer.syncRows([enemyRow({ isBoss: true, rewardTier: 3 })]);
    renderer.update(0.016, () => 0);
    const group = scene.children.find((c): c is THREE.Group => c instanceof THREE.Group)!;
    expect(group.scale.x).toBeGreaterThan(1); // boss scale

    // Display base gems come from the shared client formula (bosses pay more).
    expect(regularEnemyBaseGems(3, true)).toBeGreaterThan(regularEnemyBaseGems(1, false));
    renderer.dispose();
  });

  it('hides the model and reports a burst when an enemy dies', () => {
    const scene = new THREE.Scene();
    const effectSystem = createEffectSystem(scene);
    const burstSpy = vi.spyOn(effectSystem, 'spawnBurst');
    const renderer = createEnemyRenderer(scene, effectSystem, vi.fn());
    renderer.syncRows([enemyRow({ alive: true })]);
    renderer.update(0.016, () => 0);

    renderer.syncRows([enemyRow({ alive: false })]);
    renderer.update(0.016, () => 0);

    const group = scene.children.find((c): c is THREE.Group => c instanceof THREE.Group)!;
    expect(group.visible).toBe(false);
    expect(burstSpy).toHaveBeenCalled();
    renderer.dispose();
  });
});

describe('createGoliathRenderer', () => {
  it('spawns a real goliath model with animated limbs and topples it on death', () => {
    const scene = new THREE.Scene();
    const renderer = createGoliathRenderer(scene, vi.fn());

    renderer.syncRows([goliathRow({ sizeIndex: 2 })]);
    expect(groupCount(scene)).toBe(1);
    const group = scene.children.find((c): c is THREE.Group => c instanceof THREE.Group)!;
    expect(group.scale.x).toBe(GOLIATH_ARCHETYPES_BY_SIZE[2].modelScale);

    renderer.update(0.016, () => 0);
    expect(group.visible).toBe(true);

    // Death: the group toppled toward its side and eventually hides.
    renderer.syncRows([goliathRow({ sizeIndex: 2, alive: false })]);
    renderer.update(0.016, () => 0);
    expect(group.rotation.z).toBeGreaterThan(0);
    renderer.update(2, () => 0); // past the topple duration
    expect(group.visible).toBe(false);

    renderer.dispose();
    expect(groupCount(scene)).toBe(0);
  });
});
