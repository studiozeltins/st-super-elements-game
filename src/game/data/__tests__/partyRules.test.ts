import { describe, expect, it } from 'vitest';

// Import the real helpers across the package boundary (server module → client vitest
// runner), same mechanism as deathPenalty.test.ts — not a local re-implementation.
import { canAccept, nextLeader } from '../../../../spacetimedb/src/partyRules';

describe('nextLeader (oldest-joined promotion, D-05)', () => {
  it('empty roster → returns null (caller disbands the party)', () => {
    expect(nextLeader([])).toBeNull();
  });

  it('single member → returns that member', () => {
    expect(nextLeader([{ identityHex: '0xaa', joinedAtMicros: 100n }])).toBe('0xaa');
  });

  it('multiple members → returns the smallest joinedAtMicros (oldest-joined)', () => {
    expect(
      nextLeader([
        { identityHex: '0xaa', joinedAtMicros: 300n },
        { identityHex: '0xbb', joinedAtMicros: 100n },
        { identityHex: '0xcc', joinedAtMicros: 200n },
      ])
    ).toBe('0xbb');
  });

  it('tie on joinedAtMicros → lexicographically smallest identityHex (deterministic)', () => {
    expect(
      nextLeader([
        { identityHex: '0xcc', joinedAtMicros: 100n },
        { identityHex: '0xaa', joinedAtMicros: 100n },
        { identityHex: '0xbb', joinedAtMicros: 100n },
      ])
    ).toBe('0xaa');
  });
});

describe('canAccept (one-party-per-player + cap, D-06)', () => {
  it('already-partied joiner → rejected (checked FIRST)', () => {
    expect(canAccept(1, true, 4)).toEqual({ ok: false, reason: 'already_partied' });
  });

  it('already-partied takes priority even when roster is full', () => {
    expect(canAccept(4, true, 4)).toEqual({ ok: false, reason: 'already_partied' });
  });

  it('full roster (rosterSize >= cap) → rejected as full', () => {
    expect(canAccept(4, false, 4)).toEqual({ ok: false, reason: 'full' });
  });

  it('free joiner into a non-full roster → accepted', () => {
    expect(canAccept(2, false, 4)).toEqual({ ok: true, reason: null });
  });

  it('boundary: rosterSize === cap-1 with a free joiner → ok', () => {
    expect(canAccept(3, false, 4)).toEqual({ ok: true, reason: null });
  });

  it('boundary: rosterSize === cap → full', () => {
    expect(canAccept(4, false, 4)).toEqual({ ok: false, reason: 'full' });
  });
});
