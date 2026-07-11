// Pure pickup-feed reducer logic — zero imports so it unit-tests in isolation
// (pure-helper testing discipline). The React side (PickupFeed.tsx) only
// schedules sweeps and renders; every state transition lives here.

export type PickupKind = 'gem' | 'shard' | 'shardLoss';

export interface PickupRow {
  /** Stable render key, monotonic per feed. */
  id: number;
  kind: PickupKind;
  count: number;
  /** Increments on every merge — the count element is keyed by it so the scale pop replays. */
  bump: number;
  /** When the row starts fading out; refreshed to now + FEED_HOLD_MS on every merge. */
  expiresAt: number;
  /** True once the fade-out started — a leaving row never absorbs new pickups. */
  leaving: boolean;
}

export const FEED_HOLD_MS = 2500;
export const FEED_FADE_MS = 400;
export const FEED_MAX_ROWS = 5;

/**
 * Merge a pickup into the still-visible row of the same kind (count tick +
 * lifetime refresh), or append a new row at the bottom. Overflow past
 * FEED_MAX_ROWS drops the oldest row.
 */
export function applyPickup(
  rows: readonly PickupRow[],
  kind: PickupKind,
  amount: number,
  now: number
): PickupRow[] {
  const existing = rows.find(row => row.kind === kind && !row.leaving);
  if (existing) {
    return rows.map(row =>
      row === existing
        ? { ...row, count: row.count + amount, bump: row.bump + 1, expiresAt: now + FEED_HOLD_MS }
        : row
    );
  }
  const id = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
  const next = [
    ...rows,
    { id, kind, count: amount, bump: 0, expiresAt: now + FEED_HOLD_MS, leaving: false },
  ];
  return next.length > FEED_MAX_ROWS ? next.slice(next.length - FEED_MAX_ROWS) : next;
}

/**
 * One sweep: rows past their hold start leaving (fade-out class), rows past
 * hold + fade are removed. Always returns a fresh array so the scheduler
 * effect re-arms even when a sweep fired early.
 */
export function expireRows(rows: readonly PickupRow[], now: number): PickupRow[] {
  return rows
    .filter(row => now < row.expiresAt + FEED_FADE_MS)
    .map(row => (!row.leaving && now >= row.expiresAt ? { ...row, leaving: true } : row));
}

/** Earliest moment the next sweep must run (Infinity for an empty feed). */
export function nextFeedDeadline(rows: readonly PickupRow[]): number {
  let deadline = Infinity;
  for (const row of rows) {
    deadline = Math.min(deadline, row.leaving ? row.expiresAt + FEED_FADE_MS : row.expiresAt);
  }
  return deadline;
}
