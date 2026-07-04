import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  createEntityRenderer,
  type EntityKindAdapter,
  type SpawnedEntity,
} from '../createEntityRenderer';
import type { EnemyModel } from '../../entities/createEnemyModel';

// A table row for the fake entity kind under test — just the fields the adapter reads.
interface FakeRow {
  id: bigint;
  x: number;
  z: number;
  health: number;
  maxHealth: number;
  carried: number;
  alive: boolean;
}

// A real THREE model (so disposeEnemyModel works) with a stubbed overlay — the
// overlay's canvas is never touched, sidestepping jsdom's missing 2D context.
function makeModel(): EnemyModel {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  body.position.y = 0.5;
  group.add(body);
  const overlay = {
    sprite: new THREE.Sprite(),
    update: vi.fn(),
    dispose: vi.fn(),
  };
  return { group, body, overlay };
}

interface Harness {
  scene: THREE.Scene;
  adapter: EntityKindAdapter<FakeRow>;
  spawned: SpawnedEntity[];
  onKilled: ReturnType<typeof vi.fn>;
  onHealthDrop: ReturnType<typeof vi.fn>;
}

function makeHarness(deathDurationSeconds = 1): Harness {
  const spawned: SpawnedEntity[] = [];
  const onKilled = vi.fn();
  const onHealthDrop = vi.fn();
  const adapter: EntityKindAdapter<FakeRow> = {
    deathDurationSeconds,
    readId: row => row.id,
    readPositionX: row => row.x,
    readPositionZ: row => row.z,
    readHealth: row => row.health,
    readMaxHealth: row => row.maxHealth,
    readCarriedGems: row => row.carried,
    readIsAlive: row => row.alive,
    displayBaseGems: () => 10,
    spawn: () => {
      const entity: SpawnedEntity = {
        model: makeModel(),
        collisionRadius: 1,
        collisionMass: 2,
        animation: { animateMovement: vi.fn(), animateDeath: vi.fn() },
      };
      spawned.push(entity);
      return entity;
    },
    onKilled,
  };
  return { scene: new THREE.Scene(), adapter, spawned, onKilled, onHealthDrop };
}

function row(overrides: Partial<FakeRow> = {}): FakeRow {
  return { id: 1n, x: 0, z: 0, health: 100, maxHealth: 100, carried: 0, alive: true, ...overrides };
}

const groupCount = (scene: THREE.Scene) =>
  scene.children.filter(child => child instanceof THREE.Group).length;

describe('createEntityRenderer — reconciliation', () => {
  it('inserts a model into the scene for a new row', () => {
    const { scene, adapter } = makeHarness();
    const renderer = createEntityRenderer({ scene, adapter });

    renderer.syncRows([row({ id: 5n })]);

    expect(groupCount(scene)).toBe(1);
    expect(renderer.getAlivePositions()).toHaveLength(1);
  });

  it('does not spawn a second model when the same id syncs again', () => {
    const { scene, adapter, spawned } = makeHarness();
    const renderer = createEntityRenderer({ scene, adapter });

    renderer.syncRows([row({ id: 5n })]);
    renderer.syncRows([row({ id: 5n, x: 3 })]);

    expect(spawned).toHaveLength(1);
    expect(groupCount(scene)).toBe(1);
  });

  it('disposes and removes a model whose id is gone from the row set', () => {
    const { scene, adapter, spawned } = makeHarness();
    const renderer = createEntityRenderer({ scene, adapter });
    renderer.syncRows([row({ id: 5n })]);

    renderer.syncRows([]);

    expect(spawned[0].model.overlay.dispose).toHaveBeenCalledTimes(1);
    expect(groupCount(scene)).toBe(0);
    expect(renderer.getAlivePositions()).toHaveLength(0);
  });

  it('propagates health + carriedGems into the overlay on update', () => {
    const { scene, adapter, spawned } = makeHarness();
    const renderer = createEntityRenderer({ scene, adapter });
    renderer.syncRows([row({ id: 5n, health: 40, maxHealth: 200, carried: 7 })]);

    renderer.update(0.016, () => 0);

    // Base (10) + carried (7); fraction 40/200.
    expect(spawned[0].model.overlay.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ healthFraction: 0.2, carriedGems: 17 })
    );
  });

  it('floats the exact drop when a live row loses health', () => {
    const { scene, adapter, onHealthDrop } = makeHarness();
    const renderer = createEntityRenderer({ scene, adapter, onHealthDrop });
    renderer.syncRows([row({ id: 5n, health: 100 })]);

    renderer.syncRows([row({ id: 5n, health: 70 })]);

    expect(onHealthDrop).toHaveBeenCalledTimes(1);
    expect(onHealthDrop.mock.calls[0][1]).toBe(30);
  });
});

describe('createEntityRenderer — life and death', () => {
  it('fires onKilled once and animates death when a watched-alive row dies', () => {
    const { scene, adapter, spawned, onKilled } = makeHarness();
    const renderer = createEntityRenderer({ scene, adapter });
    renderer.syncRows([row({ id: 5n, alive: true })]);
    renderer.update(0.016, () => 0);

    renderer.syncRows([row({ id: 5n, alive: false })]);
    renderer.update(0.016, () => 0);

    expect(onKilled).toHaveBeenCalledTimes(1);
    expect(spawned[0].animation.animateDeath).toHaveBeenCalled();
    expect(renderer.getAlivePositions()).toHaveLength(0);
  });

  it('does not fire onKilled for a row first seen already dead', () => {
    const { scene, adapter, onKilled } = makeHarness();
    const renderer = createEntityRenderer({ scene, adapter });

    renderer.syncRows([row({ id: 5n, alive: false })]);
    renderer.update(0.016, () => 0);

    expect(onKilled).not.toHaveBeenCalled();
    expect(renderer.getAlivePositions()).toHaveLength(0);
  });

  it('revives (snaps visible) when a dead row flips back to alive', () => {
    const { scene, adapter, spawned } = makeHarness();
    const renderer = createEntityRenderer({ scene, adapter });
    renderer.syncRows([row({ id: 5n, alive: false })]);
    renderer.update(0.016, () => 0);
    expect(spawned[0].model.group.visible).toBe(false);

    renderer.syncRows([row({ id: 5n, alive: true, x: 12 })]);

    expect(spawned[0].model.group.visible).toBe(true);
    expect(spawned[0].model.group.position.x).toBe(12); // snapped to respawn spot
    expect(renderer.getAlivePositions()).toHaveLength(1);
  });

  it('reflects only alive rows in getAlivePositions', () => {
    const { scene, adapter } = makeHarness();
    const renderer = createEntityRenderer({ scene, adapter });

    renderer.syncRows([row({ id: 1n, alive: true }), row({ id: 2n, alive: false })]);

    expect(renderer.getAlivePositions()).toHaveLength(1);
  });
});

describe('createEntityRenderer — interpolation', () => {
  it('lerps toward a nearby target instead of snapping', () => {
    const { scene, adapter, spawned } = makeHarness();
    const renderer = createEntityRenderer({ scene, adapter });
    renderer.syncRows([row({ id: 5n, x: 0, z: 0 })]);

    renderer.syncRows([row({ id: 5n, x: 1, z: 0 })]);
    renderer.update(0.016, () => 0);

    const movedX = spawned[0].model.group.position.x;
    expect(movedX).toBeGreaterThan(0);
    expect(movedX).toBeLessThan(1);
  });

  it('snaps when the target jumps far (respawn / teleport)', () => {
    const { scene, adapter, spawned } = makeHarness();
    const renderer = createEntityRenderer({ scene, adapter });
    renderer.syncRows([row({ id: 5n, x: 0, z: 0 })]);

    renderer.syncRows([row({ id: 5n, x: 100, z: 0 })]);
    renderer.update(0.016, () => 0);

    expect(spawned[0].model.group.position.x).toBe(100);
  });

  it('places the model on the ground each update', () => {
    const { scene, adapter, spawned } = makeHarness();
    const renderer = createEntityRenderer({ scene, adapter });
    renderer.syncRows([row({ id: 5n, x: 2, z: 2 })]);

    renderer.update(0.016, () => 4.5);

    expect(spawned[0].model.group.position.y).toBe(4.5);
  });
});

describe('createEntityRenderer — collision bodies', () => {
  it('appends only live bodies with the adapter sizing', () => {
    const { scene, adapter } = makeHarness();
    const renderer = createEntityRenderer({ scene, adapter });
    renderer.syncRows([row({ id: 1n, alive: true }), row({ id: 2n, alive: false })]);

    const bodies: { radius: number; mass: number }[] = [];
    renderer.collectCollisionBodies(bodies as never);

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ radius: 1, mass: 2 });
  });
});
