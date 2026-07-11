import { useEffect, useState } from 'react';
import { playShardChime } from './pullSounds';

/**
 * Purple-shard payoff counter: after `startDelayMs` the value ticks up
 * one-by-one from `before` to `after`, popping and chiming (rising pitch)
 * on every +1. Render only when `after > before`.
 */
export function ShardCounter({
  before,
  after,
  startDelayMs,
}: {
  before: number;
  after: number;
  startDelayMs: number;
}) {
  const [displayShards, setDisplayShards] = useState(before);
  // Bumps on every +1 so the value's pop animation re-runs each tick.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setDisplayShards(before);
    setTick(0);
    const minted = after - before;
    if (minted <= 0) return;
    const stepMs = minted > 6 ? 130 : 300;
    let current = before;
    let step = 0;
    let interval = 0;
    const kickoff = window.setTimeout(() => {
      interval = window.setInterval(() => {
        current += 1;
        step += 1;
        setDisplayShards(current);
        setTick(t => t + 1);
        playShardChime(step);
        if (current >= after) window.clearInterval(interval);
      }, stepMs);
    }, startDelayMs);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(interval);
    };
  }, [before, after, startDelayMs]);

  return (
    <div className={`pull-shards ${tick > 0 ? 'pull-shards--live' : ''}`}>
      <span className="pull-shards__icon">◈</span>
      <span key={tick} className="pull-shards__val">
        {displayShards}
      </span>
      {tick > 0 && (
        <span key={`float-${tick}`} className="pull-shards__float" aria-hidden="true">
          +1
        </span>
      )}
    </div>
  );
}
