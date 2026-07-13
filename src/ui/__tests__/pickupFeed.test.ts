import { describe, expect, it } from 'vitest';

import {
  FEED_FADE_MS,
  FEED_HOLD_MS,
  FEED_MAX_ROWS,
  applyPickup,
  expireRows,
  nextFeedDeadline,
  type PickupRow,
} from '../pickupFeedModel';

const row = (overrides: Partial<PickupRow>): PickupRow => ({
  id: 1,
  kind: 'gem',
  count: 1,
  bump: 0,
  expiresAt: FEED_HOLD_MS,
  leaving: false,
  ...overrides,
});

describe('applyPickup (feed merging)', () => {
  it('adds a row with the full hold lifetime for a first pickup', () => {
    const rows = applyPickup([], 'gem', 3, 1000);
    expect(rows).toEqual([
      { id: 1, kind: 'gem', count: 3, bump: 0, expiresAt: 1000 + FEED_HOLD_MS, leaving: false },
    ]);
  });

  it('merges a same-kind pickup into the visible row, ticking the count and refreshing the lifetime', () => {
    const first = applyPickup([], 'gem', 3, 1000);
    const merged = applyPickup(first, 'gem', 2, 2200);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual({
      id: 1,
      kind: 'gem',
      count: 5,
      bump: 1, // bump remounts the count element → scale pop replays
      expiresAt: 2200 + FEED_HOLD_MS,
      leaving: false,
    });
  });

  it('keeps different kinds in separate rows, newest at the bottom', () => {
    const rows = applyPickup(applyPickup([], 'gem', 1, 1000), 'shard', 1, 1100);
    expect(rows.map(r => r.kind)).toEqual(['gem', 'shard']);
  });

  it('keeps shard loss rows separate from shard gain rows', () => {
    const rows = applyPickup(applyPickup([], 'shard', 1, 1000), 'shardLoss', 1, 1050);
    expect(rows.map(r => r.kind)).toEqual(['shard', 'shardLoss']);
    expect(rows).toHaveLength(2);
  });

  it('never merges into a row that is already fading out — a fresh row appears instead', () => {
    const leaving = [row({ id: 4, kind: 'gem', count: 7, leaving: true })];
    const rows = applyPickup(leaving, 'gem', 2, 5000);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(leaving[0]); // untouched
    expect(rows[1]).toMatchObject({ id: 5, kind: 'gem', count: 2, leaving: false });
  });

  it('caps the feed at FEED_MAX_ROWS by dropping the oldest row', () => {
    const full = Array.from({ length: FEED_MAX_ROWS }, (_, i) =>
      row({ id: i + 1, kind: 'gem', leaving: true })
    );
    const rows = applyPickup(full, 'gem', 1, 1000);
    expect(rows).toHaveLength(FEED_MAX_ROWS);
    expect(rows.map(r => r.id)).toEqual([2, 3, 4, 5, 6]); // oldest (id 1) dropped
  });
});

describe('expireRows (feed expiry)', () => {
  it('marks a row leaving once its hold elapses and keeps it during the fade window', () => {
    const rows = applyPickup([], 'gem', 1, 0);
    const swept = expireRows(rows, FEED_HOLD_MS + 1);
    expect(swept).toHaveLength(1);
    expect(swept[0].leaving).toBe(true);
  });

  it('keeps a row untouched before its hold elapses', () => {
    const rows = applyPickup([], 'gem', 1, 0);
    expect(expireRows(rows, FEED_HOLD_MS - 1)).toEqual(rows);
  });

  it('removes a row after hold + fade', () => {
    const rows = expireRows(applyPickup([], 'gem', 1, 0), FEED_HOLD_MS + 1);
    expect(expireRows(rows, FEED_HOLD_MS + FEED_FADE_MS + 1)).toEqual([]);
  });

  it('a merge refreshes the lifetime so the row survives its original deadline', () => {
    const merged = applyPickup(applyPickup([], 'gem', 1, 0), 'gem', 1, 2000);
    const swept = expireRows(merged, FEED_HOLD_MS + 1); // past the ORIGINAL deadline
    expect(swept).toHaveLength(1);
    expect(swept[0].leaving).toBe(false);
  });
});

describe('nextFeedDeadline (sweep scheduling)', () => {
  it('is Infinity for an empty feed (no timer armed)', () => {
    expect(nextFeedDeadline([])).toBe(Infinity);
  });

  it('is the earliest expiry for visible rows and expiry + fade for leaving rows', () => {
    const rows = [
      row({ id: 1, expiresAt: 3000, leaving: true }), // removal due 3000 + fade
      row({ id: 2, kind: 'shard', expiresAt: 3200, leaving: false }),
    ];
    expect(nextFeedDeadline(rows)).toBe(3200);
    expect(nextFeedDeadline([rows[0]])).toBe(3000 + FEED_FADE_MS);
  });
});
