import type { AttackAnimationView } from './createEntityRenderer';
import type { Goliath, UnitAttack } from '../../module_bindings/types';

// Server-clock anchored "view clock" for `unit_attack` FSM rows (ANIM-01):
// turns raw rows into per-frame AttackAnimationViews for the goliath renderer
// and owns the alive gate the telegraph system shares. Two inputs (goliath
// rows for alive flags, unit_attack rows for timing anchors), one output (the
// views map) — createGame only wires rows in and views out.

// Mirrors UNIT_KIND_GOLIATH in spacetimedb/src/attacks.ts.
const UNIT_KIND_GOLIATH = 0;
// Attack FSM states mirrored from spacetimedb/src/attacks.ts (u32 in the row).
const ATTACK_STATE_WINDUP = 1;
const ATTACK_STATE_STRIKE = 2;
const ATTACK_STATE_RECOVERY = 3;
// The row leaves STRIKE at the (zero-storage, D4-02) grace deadline — ONE world
// tick after strikeAt for every ATTACKS entry (graceTicks: 1, serverSync-locked).
// Strike-phase clip progress must ride THAT window: the old denominator
// (recoveryEndsAtMicros, spanning strike+grace+recovery) made in-strike progress
// crawl to ~11%, so the swing slash and swirl spin never visibly played
// (05-05 playtest fix). leapSlam is unaffected — its arc rides travelFraction.
const STRIKE_PHASE_MICROS = 150_000n;

// Per unit_attack row: a server-clock anchor captured on arrival / fresh cast
// (ANIM-01 — serverNow re-derives from it + performance.now() each frame, the
// same arrival anchoring the telegraph uses, never a free-running timer), plus
// the RECOVERY phase's start. Recovery's true start (the grace deadline) is
// zero-storage on the row (D4-02), so the recovery state change's ARRIVAL
// approximates it.
interface UnitAttackTiming {
  state: number;
  startedAtMicros: bigint;
  baseServerMicros: bigint;
  basePerfMs: number;
  phaseStartMicros: bigint;
}

export interface AttackViewClock {
  /** Refreshes the alive flags from the goliath table rows. */
  syncGoliaths(rows: readonly Goliath[]): void;
  /** Stores + clock-anchors the latest unit_attack rows. */
  syncAttackRows(rows: readonly UnitAttack[]): void;
  /** The last-synced attack rows — lets telegraphs re-gate between row updates. */
  getAttackRows(): readonly UnitAttack[];
  /** Alive gate shared with the telegraph system: nothing may outlive its unit. */
  isUnitAlive(unitKind: number, unitId: bigint): boolean;
  /** Rebuilds this frame's per-goliath views (idle/dead rows produce NO view). */
  refreshViews(): Map<string, AttackAnimationView>;
}

export function createAttackViewClock(): AttackViewClock {
  // goliathId -> alive, refreshed by syncGoliaths; gates telegraphs and views
  // so none outlives its goliath even while the stale unit_attack row exists.
  const goliathAlive = new Map<string, boolean>();
  let latestUnitAttackRows: readonly UnitAttack[] = [];
  const attackTimings = new Map<string, UnitAttackTiming>();
  // Rebuilt (in place — no per-frame allocation) on every refreshViews call.
  const goliathAttackViews = new Map<string, AttackAnimationView>();

  function isUnitAlive(unitKind: number, unitId: bigint): boolean {
    if (unitKind !== UNIT_KIND_GOLIATH) return false;
    return goliathAlive.get(unitId.toString()) === true;
  }

  function serverNowEstimate(timing: UnitAttackTiming): bigint {
    return (
      timing.baseServerMicros + BigInt(Math.round((performance.now() - timing.basePerfMs) * 1000))
    );
  }

  // Anchors/re-anchors each row's server clock: a fresh cast (startedAt change)
  // or first sight re-bases it; a state change stamps the new phase's start.
  function syncAttackTimings(rows: readonly UnitAttack[]) {
    const seen = new Set<string>();
    for (const row of rows) {
      if (row.unitKind !== UNIT_KIND_GOLIATH) continue;
      const key = row.unitId.toString();
      seen.add(key);
      const existing = attackTimings.get(key);
      if (!existing || existing.startedAtMicros !== row.startedAtMicros) {
        // A windup row was written at startedAt, so its arrival pins serverNow
        // ≈ startedAt (the telegraph's assumption). A row first seen already
        // mid-strike/recovery pins to strikeAt — conservative: a late joiner
        // sees a slightly longer, clamped settle, never a stuck pose.
        const base = row.state === ATTACK_STATE_WINDUP ? row.startedAtMicros : row.strikeAtMicros;
        attackTimings.set(key, {
          state: row.state,
          startedAtMicros: row.startedAtMicros,
          baseServerMicros: base,
          basePerfMs: performance.now(),
          phaseStartMicros: base,
        });
        continue;
      }
      if (existing.state !== row.state) {
        existing.state = row.state;
        // Strike begins exactly at the row's own strikeAt deadline; recovery's
        // unstored start is approximated by this state change's arrival.
        existing.phaseStartMicros =
          row.state === ATTACK_STATE_STRIKE ? row.strikeAtMicros : serverNowEstimate(existing);
      }
    }
    for (const key of attackTimings.keys()) {
      if (!seen.has(key)) attackTimings.delete(key);
    }
  }

  // Rebuilds the attack views each frame: phase straight from the row state,
  // progress from the row's OWN micros against the anchored server clock —
  // windup runs startedAt → strikeAt; strike runs strikeAt → strikeAt + one
  // grace tick (STRIKE_PHASE_MICROS — the zero-storage deadline the row actually
  // leaves STRIKE at, D4-02); recovery runs its arrival-anchored start →
  // recoveryEndsAt. The goliath's leap arc still rides the actual travel toward
  // the landing, never in-strike progress. Idle rows produce NO view.
  function refreshViews(): Map<string, AttackAnimationView> {
    goliathAttackViews.clear();
    for (const row of latestUnitAttackRows) {
      if (row.unitKind !== UNIT_KIND_GOLIATH) continue;
      if (!isUnitAlive(row.unitKind, row.unitId)) continue;
      const key = row.unitId.toString();
      const timing = attackTimings.get(key);
      if (!timing) continue;
      let phase: AttackAnimationView['phase'];
      let phaseStart: bigint;
      let phaseEnd: bigint;
      if (row.state === ATTACK_STATE_WINDUP) {
        phase = 'windup';
        phaseStart = row.startedAtMicros;
        phaseEnd = row.strikeAtMicros;
      } else if (row.state === ATTACK_STATE_STRIKE) {
        phase = 'strike';
        phaseStart = row.strikeAtMicros;
        phaseEnd = row.strikeAtMicros + STRIKE_PHASE_MICROS;
      } else if (row.state === ATTACK_STATE_RECOVERY) {
        phase = 'recovery';
        phaseStart = timing.phaseStartMicros;
        phaseEnd = row.recoveryEndsAtMicros;
      } else {
        continue;
      }
      const durationMicros = Number(phaseEnd - phaseStart);
      const elapsedMicros = Number(serverNowEstimate(timing) - phaseStart);
      goliathAttackViews.set(key, {
        attackId: row.attackId,
        phase,
        phaseProgress:
          durationMicros <= 0 ? 1 : Math.min(1, Math.max(0, elapsedMicros / durationMicros)),
        castX: row.castX,
        castZ: row.castZ,
        landingX: row.landingX,
        landingZ: row.landingZ,
      });
    }
    return goliathAttackViews;
  }

  return {
    syncGoliaths(rows) {
      goliathAlive.clear();
      for (const row of rows) goliathAlive.set(row.goliathId.toString(), row.alive);
    },
    syncAttackRows(rows) {
      latestUnitAttackRows = rows;
      syncAttackTimings(rows);
    },
    getAttackRows() {
      return latestUnitAttackRows;
    },
    isUnitAlive,
    refreshViews,
  };
}
