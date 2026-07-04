import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createGoliathSystem, type GoliathNetworkActions } from '../createGoliathSystem';
import { GOLIATH_BATCH_WINDOW_MICROS } from '../goliathIdentity';

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

function makeNetwork() {
  return {
    sendEnemyRaidKill: vi.fn(),
    sendKillEnemy: vi.fn(),
  } satisfies GoliathNetworkActions;
}

function makeSystem(clock: { micros: bigint }, player: THREE.Vector3, network: GoliathNetworkActions) {
  const scene = new THREE.Scene();
  const onPlayerHit = vi.fn();
  const system = createGoliathSystem({
    scene,
    getGroundHeight: () => 0,
    getSharedTimeMicros: () => clock.micros,
    getLocalPlayerPosition: () => player,
    getComboCount: () => 3,
    network,
    onPlayerHit,
  });
  return { scene, system, onPlayerHit };
}

const emptyGemField = { drops: [], onGrab: () => false };

describe('createGoliathSystem — smoke', () => {
  it('spawns the batch models into the scene and places them each frame', () => {
    const clock = { micros: 1_000_000n }; // 1s into window 0 — goliaths marching in
    const { scene, system } = makeSystem(clock, new THREE.Vector3(9999, 0, 9999), makeNetwork());

    const groupCount = scene.children.filter(c => c instanceof THREE.Group).length;
    expect(groupCount).toBeGreaterThan(0);

    expect(() => system.update(0.016, emptyGemField)).not.toThrow();
    expect(system.getAlivePositions().length).toBe(groupCount);
    system.dispose();
  });

  it('takes player attacks via applyDamageInRadius and reports a local kill', () => {
    const clock = { micros: 2_000_000n };
    const network = makeNetwork();
    const { system } = makeSystem(clock, new THREE.Vector3(9999, 0, 9999), network);
    system.update(0.016, emptyGemField);

    const target = system.getAlivePositions()[0];
    // A glancing hit connects but does not kill.
    const hit = system.applyDamageInRadius(
      { x: target.x, y: target.y + 0.5, z: target.z },
      2,
      10,
      'pyro',
      'normal'
    );
    expect(hit).toBe(true);
    expect(network.sendKillEnemy).not.toHaveBeenCalled();

    // An overwhelming blow drops it — local kill fires with the goliath flags.
    system.applyDamageInRadius({ x: target.x, y: target.y + 0.5, z: target.z }, 2, 1_000_000, 'pyro', 'normal');
    expect(network.sendKillEnemy).toHaveBeenCalledTimes(1);
    const args = network.sendKillEnemy.mock.calls[0];
    expect(typeof args[0]).toBe('bigint'); // slotId
    expect(args[4]).toBe(3); // comboCount injected via getComboCount
    expect(args[6]).toBe(true); // isGoliath
    system.dispose();
  });

  it('ignores the player until provoked, then deals contact damage in range', () => {
    const clock = { micros: 3_000_000n };
    const player = new THREE.Vector3(9999, 0, 9999);
    const { system, onPlayerHit } = makeSystem(clock, player, makeNetwork());
    system.update(0.05, emptyGemField);
    const target = system.getAlivePositions()[0].clone();

    // Stand on the goliath but unprovoked → no contact damage.
    player.set(target.x, target.y, target.z);
    system.update(0.05, emptyGemField);
    expect(onPlayerHit).not.toHaveBeenCalled();

    // Provoke it with a light hit, then it trades blows while in range.
    system.applyDamageInRadius({ x: target.x, y: target.y + 0.5, z: target.z }, 2, 5, 'pyro', 'normal');
    system.update(0.05, emptyGemField);
    expect(onPlayerHit).toHaveBeenCalled();
    system.dispose();
  });

  it('vacuums nearby ground drops for its hoard', () => {
    const clock = { micros: 4_000_000n };
    const { system } = makeSystem(clock, new THREE.Vector3(9999, 0, 9999), makeNetwork());
    system.update(0.016, emptyGemField);
    const target = system.getAlivePositions()[0].clone();

    const onGrab = vi.fn(() => true);
    system.update(0.016, {
      drops: [{ id: 'g1', x: target.x + 1, z: target.z + 1, amount: 5 }],
      onGrab,
    });
    expect(onGrab).toHaveBeenCalledWith(expect.any(BigInt), 'g1');
    system.dispose();
  });

  it('rebuilds the batch and disposes old models when the window rolls', () => {
    const clock = { micros: 5_000_000n };
    const { scene, system } = makeSystem(clock, new THREE.Vector3(9999, 0, 9999), makeNetwork());
    system.update(0.016, emptyGemField);
    const before = scene.children.filter(c => c instanceof THREE.Group).length;
    expect(before).toBeGreaterThan(0);

    clock.micros = GOLIATH_BATCH_WINDOW_MICROS * 4n + 1_000_000n; // jump several windows ahead
    expect(() => system.update(0.016, emptyGemField)).not.toThrow();
    // Old batch torn down, new batch present — never an accumulation of stale rigs.
    expect(scene.children.filter(c => c instanceof THREE.Group).length).toBe(
      system.getAlivePositions().length
    );

    system.dispose();
    expect(scene.children.filter(c => c instanceof THREE.Group).length).toBe(0);
  });

  it('accepts a carry sync without throwing (feeds the hoard pill)', () => {
    const clock = { micros: 6_000_000n };
    const { system } = makeSystem(clock, new THREE.Vector3(9999, 0, 9999), makeNetwork());
    const alive = system.getAlivePositions();
    expect(() => {
      system.syncGoliathCarry(new Map([[900001n, 250]]));
      system.update(0.016, emptyGemField);
    }).not.toThrow();
    expect(alive.length).toBeGreaterThan(0);
    system.dispose();
  });
});
