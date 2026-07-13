import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { GoliathArchetype } from '../../data/goliathArchetypes';
import { createGoliathModel } from '../createGoliathModel';

const ARCHETYPE_STUB: GoliathArchetype = {
  sizeIndex: 0,
  displayName: 'Goliath Raider',
  modelScale: 1.15,
  maxHealth: 2200,
  contactDamage: 140,
  moveSpeed: 2.6,
  collisionRadius: 1.1,
  bodyColor: 0x7a5c3a,
  baseGems: 8,
  splashesOnAttack: false,
};

// Every named part the enemy system may animate. Weapons live under the arm
// pivots, so getObjectByName's recursive search must still find them.
const EXPECTED_PART_NAMES = [
  'torso',
  'head',
  'leftLeg',
  'rightLeg',
  'leftArm',
  'rightArm',
  'shield',
  'sword',
];

describe('createGoliathModel', () => {
  it('returns a group with every named part and the reused overlay handle', () => {
    const model = createGoliathModel(ARCHETYPE_STUB);

    expect(model.group).toBeInstanceOf(THREE.Group);
    for (const name of EXPECTED_PART_NAMES) {
      expect(model.group.getObjectByName(name), `missing part: ${name}`).toBeDefined();
    }

    expect(model.overlay.sprite).toBeInstanceOf(THREE.Sprite);
    expect(typeof model.overlay.update).toBe('function');
    expect(typeof model.overlay.dispose).toBe('function');
  });

  it('builds voxel body parts carrying the archetype color in vertex colors', () => {
    const model = createGoliathModel(ARCHETYPE_STUB);

    for (const name of ['torso', 'head', 'leftLeg', 'rightLeg']) {
      const part = model.group.getObjectByName(name) as THREE.Mesh;
      const material = part.material as THREE.MeshLambertMaterial;
      // Voxel clusters dither the body color across per-cube VERTEX colors on
      // one shared white material (same idiom as the world's rocks).
      expect(material.vertexColors).toBe(true);
      expect(part.geometry.getAttribute('color')).toBeDefined();
      expect(part.geometry.getAttribute('position').count).toBeGreaterThan(0);
    }
  });

  it('scales the whole rig by archetype.modelScale so it towers over slimes', () => {
    const model = createGoliathModel(ARCHETYPE_STUB);
    expect(model.group.scale.x).toBe(ARCHETYPE_STUB.modelScale);
    expect(model.group.scale.y).toBe(ARCHETYPE_STUB.modelScale);
    expect(model.group.scale.z).toBe(ARCHETYPE_STUB.modelScale);
  });

  it('casts shadows from the body like the other enemies', () => {
    const model = createGoliathModel(ARCHETYPE_STUB);
    expect(model.body.castShadow).toBe(true);
  });
});
