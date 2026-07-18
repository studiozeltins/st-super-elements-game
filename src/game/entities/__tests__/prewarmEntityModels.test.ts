import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  buildAllEntityVariants,
  prewarmEntityModels,
  type PrewarmRenderer,
} from '../prewarmEntityModels';
import { createGoliathModel } from '../createGoliathModel';
import { GOLIATH_ARCHETYPES_BY_SIZE } from '../../data/goliathArchetypes';
import { ENEMY_ARCHETYPES } from '../../data/enemyArchetypes';

// jsdom has no 2D canvas; the overlay only touches it on update(), never during
// construction, but stub a no-op context so anything that peeks stays safe.
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

function fakeRenderer(): PrewarmRenderer & {
  compile: ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
} {
  return {
    shadowMap: { needsUpdate: false },
    compile: vi.fn(),
    render: vi.fn(),
  };
}

const groupCount = (scene: THREE.Scene) =>
  scene.children.filter(child => child instanceof THREE.Group).length;

describe('buildAllEntityVariants', () => {
  it('builds exactly one model per enemy archetype and goliath size', () => {
    const models = buildAllEntityVariants();
    const expected =
      Object.keys(ENEMY_ARCHETYPES).length + GOLIATH_ARCHETYPES_BY_SIZE.length;
    expect(models).toHaveLength(expected);
    // Every variant is a real renderable group with a body mesh + overlay.
    for (const model of models) {
      expect(model.group).toBeInstanceOf(THREE.Group);
      expect(model.body).toBeInstanceOf(THREE.Mesh);
      expect(model.group.children.length).toBeGreaterThan(0);
    }
  });

  it('shares one geometry instance across rebuilds of the same variant (the cache prewarm relies on)', () => {
    // The whole point of prewarm is that building a variant warms a shared cache
    // so later live spawns reuse the geometry instead of rebuilding the voxel
    // cluster. If this identity ever breaks, prewarm stops helping.
    const archetype = GOLIATH_ARCHETYPES_BY_SIZE[0];
    const first = createGoliathModel(archetype);
    const second = createGoliathModel(archetype);
    expect(second.body.geometry).toBe(first.body.geometry);
  });
});

describe('prewarmEntityModels', () => {
  it('compiles + renders once against the scene, forces the shadow pass, then leaves no models behind', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const renderer = fakeRenderer();
    // needsUpdate is flipped true inside prewarm; capture what compile saw.
    let shadowDuringCompile = false;
    renderer.compile.mockImplementation(() => {
      shadowDuringCompile = renderer.shadowMap.needsUpdate;
    });

    prewarmEntityModels(renderer, scene, camera);

    expect(renderer.compile).toHaveBeenCalledTimes(1);
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(shadowDuringCompile).toBe(true); // shadow-cast program warmed too
    // All throwaway models disposed + removed — prewarm must not leak into the
    // live scene (disposeEnemyModel calls group.removeFromParent()).
    expect(groupCount(scene)).toBe(0);
  });

  it('adds every variant to the scene before compiling (so the lit program variant is the one that compiles)', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const renderer = fakeRenderer();
    let groupsAtCompile = 0;
    renderer.compile.mockImplementation(() => {
      groupsAtCompile = groupCount(scene);
    });

    prewarmEntityModels(renderer, scene, camera);

    const expected =
      Object.keys(ENEMY_ARCHETYPES).length + GOLIATH_ARCHETYPES_BY_SIZE.length;
    expect(groupsAtCompile).toBe(expected);
  });
});
