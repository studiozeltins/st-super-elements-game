import { useCallback, useEffect, useState } from 'react';
import {
  applyPickup,
  expireRows,
  nextFeedDeadline,
  type PickupKind,
  type PickupRow,
} from './pickupFeedModel';
import './pickupFeed.css';

const GLYPH: Record<PickupKind, string> = { gem: '✦', shard: '◈', shardLoss: '◈' };
const LABEL: Record<PickupKind, string> = { gem: 'Dārgakmeņi', shard: 'Šķemba', shardLoss: 'Šķemba' };

/**
 * Feed state + sweep scheduling. `push` is referentially stable so it can be
 * handed straight to game callbacks; a single timeout re-arms itself to the
 * nearest row deadline (no polling while the feed is idle).
 */
export function usePickupFeed() {
  const [rows, setRows] = useState<readonly PickupRow[]>([]);
  const push = useCallback((kind: PickupKind, amount: number) => {
    setRows(current => applyPickup(current, kind, amount, performance.now()));
  }, []);

  useEffect(() => {
    const deadline = nextFeedDeadline(rows);
    if (deadline === Infinity) return;
    // +16ms so a slightly-early timer still lands past the deadline; expireRows
    // always returns a fresh array, so this effect re-arms after every sweep.
    const delay = Math.max(0, deadline - performance.now()) + 16;
    const timer = window.setTimeout(
      () => setRows(current => expireRows(current, performance.now())),
      delay
    );
    return () => window.clearTimeout(timer);
  }, [rows]);

  return { rows, push };
}

/** Genshin-style pickup feed — left of center, newest row at the bottom. */
export function PickupFeed({ rows }: { rows: readonly PickupRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="pickup-feed" aria-hidden="true">
      {rows.map(row => (
        <div
          key={row.id}
          className={`pickup-row pickup-row--${row.kind}${row.leaving ? ' pickup-row--leaving' : ''}`}
        >
          <span className="pickup-row__glyph">{GLYPH[row.kind]}</span>
          <span className="pickup-row__label">{LABEL[row.kind]}</span>
          {/* key = bump → remount replays the count pop on every merge */}
          <span key={row.bump} className="pickup-row__count">
            {row.kind === 'shardLoss' ? `−${row.count}` : `×${row.count}`}
          </span>
        </div>
      ))}
    </div>
  );
}
