import { describe, expect, it } from 'vitest';

// Import the real helper across the package boundary (server module → client vitest
// runner), same mechanism as gachaOverflow.test.ts — not a local re-implementation.
import { resolveTranscendInstall } from '../../../../spacetimedb/src/transcendInstall';
// Consume the shared client mirrors instead of hardcoding the cap / cost curve.
import { MAX_TRANSCEND_LEVEL, TRANSCEND_SHARD_COST } from '../constants';

// MAX_CONSTELLATION is not exported from the client mirror; mirrors the server
// constant in spacetimedb/src/index.ts (C6 is the cap).
const MAX_CON = 6;

describe('resolveTranscendInstall', () => {
  it('C6 with enough shards installs the first transcend level', () => {
    const result = resolveTranscendInstall(6, MAX_CON, 0, MAX_TRANSCEND_LEVEL, 5, TRANSCEND_SHARD_COST);
    expect(result).toEqual({ ok: true, nextLevel: 1, shardCost: 1 });
  });

  describe('cap boundary', () => {
    it('one below the cap still installs (reaches MAX)', () => {
      const result = resolveTranscendInstall(
        6,
        MAX_CON,
        MAX_TRANSCEND_LEVEL - 1,
        MAX_TRANSCEND_LEVEL,
        999,
        TRANSCEND_SHARD_COST
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.nextLevel).toBe(MAX_TRANSCEND_LEVEL);
    });

    it('at the cap rejects with at_cap', () => {
      const result = resolveTranscendInstall(
        6,
        MAX_CON,
        MAX_TRANSCEND_LEVEL,
        MAX_TRANSCEND_LEVEL,
        999,
        TRANSCEND_SHARD_COST
      );
      expect(result).toEqual({ ok: false, reason: 'at_cap' });
    });
  });

  describe('exact-shard boundary', () => {
    it('shards exactly equal to cost installs', () => {
      // currentTranscend=2 → nextLevel=3 → cost=3
      const result = resolveTranscendInstall(6, MAX_CON, 2, MAX_TRANSCEND_LEVEL, 3, TRANSCEND_SHARD_COST);
      expect(result).toEqual({ ok: true, nextLevel: 3, shardCost: 3 });
    });

    it('one shard short rejects with insufficient_shards', () => {
      const result = resolveTranscendInstall(6, MAX_CON, 2, MAX_TRANSCEND_LEVEL, 2, TRANSCEND_SHARD_COST);
      expect(result).toEqual({ ok: false, reason: 'insufficient_shards' });
    });
  });

  it('below C6 rejects with below_c6 regardless of abundant shards (priority over other gates)', () => {
    const result = resolveTranscendInstall(5, MAX_CON, 0, MAX_TRANSCEND_LEVEL, 999, TRANSCEND_SHARD_COST);
    expect(result).toEqual({ ok: false, reason: 'below_c6' });
  });

  it.each([1, 2, 5, 10])('cost curve: installing level %i costs %i shards', n => {
    const result = resolveTranscendInstall(6, MAX_CON, n - 1, MAX_TRANSCEND_LEVEL, n, TRANSCEND_SHARD_COST);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.nextLevel).toBe(n);
      expect(result.shardCost).toBe(n);
    }
  });
});
