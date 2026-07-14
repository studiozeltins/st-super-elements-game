/**
 * The shared server clock — the ONE server-micros time source the day/night
 * cycle reads (DAYNITE-02, D-08). It reuses the proven createAttackViewClock
 * estimator: a table callback stamps `anchor(serverMicros)` on the first world
 * tick (NEVER a render), and every frame `nowMicros()` re-derives the current
 * server time from that anchor + the `performance.now()` delta — a monotonic,
 * drift-free clock that never free-runs off a local wall clock.
 *
 * Before the first anchor arrives it falls back to `Date.now() * 1000` so the
 * time-of-day is bounded within NTP skew (≪1s on a 20-min cycle) even if the
 * server timestamp is late or absent — the clock is cosmetic-by-design and the
 * fallback guarantees DAYNITE-02 either way (threat T-09-01, accepted).
 *
 * No THREE import: this is pure timing, held by reference and mutated in place.
 */
export interface ServerClock {
  /**
   * Re-bases the clock on a server-micros timestamp. Called from a table
   * callback on the first (and any later) world tick — NEVER from a render.
   */
  anchor(serverMicros: bigint): void;
  /**
   * Current server time in micros. Returns a `Date.now()`-based estimate until
   * the first `anchor`, then `baseServerMicros + performance.now()` delta.
   */
  nowMicros(): bigint;
}

export function createServerClock(): ServerClock {
  // Null until the first server tick anchors the clock — until then nowMicros
  // falls back to the local wall clock (bounded within NTP skew).
  let baseServerMicros: bigint | null = null;
  let basePerfMs = 0;

  return {
    anchor(serverMicros) {
      baseServerMicros = serverMicros;
      basePerfMs = performance.now();
    },
    nowMicros() {
      if (baseServerMicros === null) {
        return BigInt(Math.round(Date.now() * 1000));
      }
      return baseServerMicros + BigInt(Math.round((performance.now() - basePerfMs) * 1000));
    },
  };
}
