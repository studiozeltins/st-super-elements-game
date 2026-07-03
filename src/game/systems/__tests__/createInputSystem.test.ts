import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createInputSystem, type InputSystem } from '../createInputSystem';

const DIAGONAL = 1 / Math.SQRT2;

function pressKey(code: string, repeat = false) {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, repeat }));
}

function releaseKey(code: string) {
  window.dispatchEvent(new KeyboardEvent('keyup', { code }));
}

describe('createInputSystem', () => {
  let input: InputSystem;

  beforeEach(() => {
    input = createInputSystem(document.createElement('canvas'));
  });

  afterEach(() => {
    input.dispose();
  });

  describe('keyboard movement', () => {
    it('is zero with no keys pressed', () => {
      expect(input.getMoveVector()).toEqual({ x: 0, z: 0 });
    });

    it.each([
      ['KeyW', { x: 0, z: -1 }],
      ['KeyS', { x: 0, z: 1 }],
      ['KeyA', { x: -1, z: 0 }],
      ['KeyD', { x: 1, z: 0 }],
    ] as const)('maps %s to a unit axis vector', (code, expected) => {
      pressKey(code);
      expect(input.getMoveVector()).toEqual(expected);
    });

    it('normalizes diagonal movement to magnitude 1', () => {
      pressKey('KeyW');
      pressKey('KeyD');
      const { x, z } = input.getMoveVector();
      expect(x).toBeCloseTo(DIAGONAL);
      expect(z).toBeCloseTo(-DIAGONAL);
      expect(Math.hypot(x, z)).toBeCloseTo(1);
    });

    it('cancels out opposing keys', () => {
      pressKey('KeyA');
      pressKey('KeyD');
      expect(input.getMoveVector()).toEqual({ x: 0, z: 0 });
    });

    it('stops moving when the key is released', () => {
      pressKey('KeyW');
      releaseKey('KeyW');
      expect(input.getMoveVector()).toEqual({ x: 0, z: 0 });
    });
  });

  describe('jump and skill edge-triggering', () => {
    it('consumeJump returns true once after Space, then false', () => {
      pressKey('Space');
      expect(input.consumeJump()).toBe(true);
      expect(input.consumeJump()).toBe(false);
    });

    it.each(['KeyQ', 'KeyE', 'KeyK'])('consumeSkill returns true once after %s', code => {
      pressKey(code);
      expect(input.consumeSkill()).toBe(true);
      expect(input.consumeSkill()).toBe(false);
    });

    it('ignores auto-repeated keydown events', () => {
      pressKey('Space', true);
      expect(input.consumeJump()).toBe(false);
    });
  });

  describe('party slot selection', () => {
    it.each([
      ['Digit1', 0],
      ['Digit2', 1],
      ['Digit3', 2],
      ['Digit4', 3],
    ] as const)('maps %s to slot %d and consumes it', (code, slot) => {
      pressKey(code);
      expect(input.consumePartySlot()).toBe(slot);
      expect(input.consumePartySlot()).toBeNull();
    });

    it('ignores digits outside 1-4', () => {
      pressKey('Digit5');
      expect(input.consumePartySlot()).toBeNull();
    });
  });

  describe('touch controls', () => {
    it('uses the touch move vector as-is when within the unit circle', () => {
      input.setTouchMove(0.5, -0.25);
      expect(input.getMoveVector()).toEqual({ x: 0.5, z: -0.25 });
    });

    it('normalizes an oversized touch move vector', () => {
      input.setTouchMove(3, 4);
      const { x, z } = input.getMoveVector();
      expect(Math.hypot(x, z)).toBeCloseTo(1);
      expect(x).toBeCloseTo(0.6);
      expect(z).toBeCloseTo(0.8);
    });

    it('queues one attack click per touch-attack press', () => {
      input.pressTouchButton('attack');
      expect(input.consumeAttackClick()).toBe(true);
      expect(input.consumeAttackClick()).toBe(false);
    });

    it('queues jump and skill as edge-triggered actions', () => {
      input.pressTouchButton('jump');
      input.pressTouchButton('skill');
      expect(input.consumeJump()).toBe(true);
      expect(input.consumeSkill()).toBe(true);
      expect(input.consumeJump()).toBe(false);
      expect(input.consumeSkill()).toBe(false);
    });
  });

  describe('dispose', () => {
    it('stops reacting to keyboard events', () => {
      input.dispose();
      pressKey('KeyW');
      pressKey('Space');
      pressKey('KeyQ');
      pressKey('Digit1');
      expect(input.getMoveVector()).toEqual({ x: 0, z: 0 });
      expect(input.consumeJump()).toBe(false);
      expect(input.consumeSkill()).toBe(false);
      expect(input.consumePartySlot()).toBeNull();
    });

    it('does not clear input state queued before disposal', () => {
      pressKey('Space');
      input.dispose();
      expect(input.consumeJump()).toBe(true);
    });
  });
});
