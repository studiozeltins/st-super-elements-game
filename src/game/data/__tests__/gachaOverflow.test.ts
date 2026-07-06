import { describe, expect, it } from 'vitest';

// Import the real helper across the package boundary (server module → client vitest
// runner), same mechanism as serverWorldSim.test.ts — not a local re-implementation.
import { resolveDupeGrant } from '../../../../spacetimedb/src/gachaOverflow';
// Consume the shared client mirror constant instead of hardcoding the mint amount.
import { SHARD_PER_OVERFLOW_DUPE } from '../constants';

// MAX_CONSTELLATION is not exported from the client mirror; mirrors the server
// constant in spacetimedb/src/index.ts (C6 is the cap).
const MAX = 6;

describe('resolveDupeGrant', () => {
  it.each([0, 1, 2, 5])(
    'sub-C6 dupe at constellation %i increments and mints no shard',
    current => {
      const outcome = resolveDupeGrant(current, MAX, SHARD_PER_OVERFLOW_DUPE);
      expect(outcome.constellation).toBe(current + 1);
      expect(outcome.shardMinted).toBe(0);
    }
  );

  it('C6-overflow dupe pins constellation at max and mints one shard', () => {
    const outcome = resolveDupeGrant(MAX, MAX, SHARD_PER_OVERFLOW_DUPE);
    expect(outcome.constellation).toBe(MAX);
    expect(outcome.shardMinted).toBe(SHARD_PER_OVERFLOW_DUPE);
  });
});
