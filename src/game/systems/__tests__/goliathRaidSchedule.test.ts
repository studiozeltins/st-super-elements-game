import { describe, expect, it } from 'vitest';
import { getCampSites, type CampSite } from '../../world/camps';
import { GOLIATH_ARCHETYPES_BY_SIZE } from '../../data/goliathArchetypes';
import { enemyIdFor } from '../enemyIdentity';
import { GOLIATH_BATCH_WINDOW_MICROS, goliathBatchForTime } from '../goliathIdentity';
import {
  campStrength,
  goliathFullStrength,
  goliathRaidEventsInWindow,
  goliathStatesAtTime,
  goliathWinChance,
  type GoliathRaidEvent,
} from '../goliathRaidSchedule';

const camps = getCampSites();
const WINDOW = GOLIATH_BATCH_WINDOW_MICROS;

function windowStart(bucket: number): bigint {
  return BigInt(bucket) * WINDOW;
}

function eventKey(event: GoliathRaidEvent): string {
  return event.kind === 'raidBossKill'
    ? `B|${event.campIndex}|${event.bossEnemyId}|${event.rewardTier}|${event.position.x.toFixed(3)}|${event.atMicros}`
    : `D|${event.slotId}|${event.sizeIndex}|${event.position.x.toFixed(3)}|${event.atMicros}`;
}

describe('goliathRaidSchedule — determinism', () => {
  it('goliathStatesAtTime is deep-equal for two "clients" at the same instant', () => {
    for (const microsIntoWindow of [0n, 5_000_000n, 45_000_000n, 120_000_000n, 280_000_000n]) {
      const at = windowStart(7) + microsIntoWindow;
      const clientA = goliathStatesAtTime(camps, at);
      const clientB = goliathStatesAtTime(camps, at);
      expect(clientA).toEqual(clientB);
      // Independent recompute must agree on positions, health, and defeated flags.
      expect(clientA.map(s => [s.position.x, s.position.z, s.healthFraction, s.isDefeated])).toEqual(
        clientB.map(s => [s.position.x, s.position.z, s.healthFraction, s.isDefeated])
      );
    }
  });

  it('goliathRaidEventsInWindow is deep-equal for two "clients"', () => {
    const start = windowStart(3);
    const clientA = goliathRaidEventsInWindow(camps, start - 1n, start + WINDOW);
    const clientB = goliathRaidEventsInWindow(camps, start - 1n, start + WINDOW);
    expect(clientA).toEqual(clientB);
  });
});

describe('goliathRaidSchedule — strength-weighted win chance is monotonic', () => {
  const slimeCamp: CampSite = { x: 0, z: 0, archetypeId: 'slime' };
  const golemCamp: CampSite = { x: 0, z: 0, archetypeId: 'stoneGolem' };
  const [small, , large] = GOLIATH_ARCHETYPES_BY_SIZE;

  it('a stronger goliath beats the same camp more often', () => {
    expect(goliathFullStrength(large)).toBeGreaterThan(goliathFullStrength(small));
    expect(goliathWinChance(large, 1, slimeCamp)).toBeGreaterThan(goliathWinChance(small, 1, slimeCamp));
  });

  it('the same goliath beats a stronger camp less often', () => {
    expect(campStrength(golemCamp)).toBeGreaterThan(campStrength(slimeCamp));
    expect(goliathWinChance(large, 1, golemCamp)).toBeLessThan(goliathWinChance(large, 1, slimeCamp));
  });

  it('a healthier goliath wins more often', () => {
    expect(goliathWinChance(large, 1, slimeCamp)).toBeGreaterThan(goliathWinChance(large, 0.4, slimeCamp));
  });

  it('win chance stays a probability in [0,1)', () => {
    for (const archetype of GOLIATH_ARCHETYPES_BY_SIZE) {
      for (const camp of [slimeCamp, golemCamp]) {
        const chance = goliathWinChance(archetype, 1, camp);
        expect(chance).toBeGreaterThan(0);
        expect(chance).toBeLessThan(1);
      }
    }
  });
});

describe('goliathRaidSchedule — attrition', () => {
  /** First (bucket, slotId) whose goliath survived the window having cleared camps. */
  function findSurvivor(): { bucket: number; slotId: bigint } {
    for (let bucket = 0; bucket < 200; bucket++) {
      const lateStates = goliathStatesAtTime(camps, windowStart(bucket) + 290_000_000n);
      for (const state of lateStates) {
        if (!state.isDefeated && state.healthFraction < 1) return { bucket, slotId: state.slotId };
      }
    }
    throw new Error('no survivor found');
  }

  it('health strictly decreases per camp a surviving goliath clears', () => {
    const { bucket, slotId } = findSurvivor();
    const distinctHealth: number[] = [];
    for (let seconds = 0; seconds <= 290; seconds += 1) {
      const at = windowStart(bucket) + BigInt(seconds) * 1_000_000n;
      const state = goliathStatesAtTime(camps, at).find(s => s.slotId === slotId)!;
      const last = distinctHealth[distinctHealth.length - 1];
      if (last === undefined || state.healthFraction !== last) distinctHealth.push(state.healthFraction);
    }
    // Piecewise-constant per leg, dropping only on a cleared camp — so the run of
    // distinct values must be strictly decreasing, with at least two steps.
    expect(distinctHealth.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < distinctHealth.length; i++) {
      expect(distinctHealth[i]).toBeLessThan(distinctHealth[i - 1]);
    }
  });

  it('a defeated goliath emits exactly one goliathDefeated and nothing later', () => {
    let checked = 0;
    for (let bucket = 0; bucket < 120 && checked < 12; bucket++) {
      const start = windowStart(bucket);
      const events = goliathRaidEventsInWindow(camps, start - 1n, start + WINDOW);
      const defeats = events.filter(e => e.kind === 'goliathDefeated');
      const bySlot = new Map<bigint, number>();
      for (const defeat of defeats) {
        if (defeat.kind !== 'goliathDefeated') continue;
        bySlot.set(defeat.slotId, (bySlot.get(defeat.slotId) ?? 0) + 1);
        // Once defeated, that slot is dead for the rest of the window.
        const afterDeath = goliathStatesAtTime(camps, defeat.atMicros + 1_000_000n).find(
          s => s.slotId === defeat.slotId
        )!;
        expect(afterDeath.isDefeated).toBe(true);
        expect(afterDeath.healthFraction).toBe(0);
        checked++;
      }
      for (const count of bySlot.values()) expect(count).toBe(1);
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('goliathRaidSchedule — balance (~40% die to camps, emergent)', () => {
  it('lands the defeat fraction in the 25–55% band across the size mix', () => {
    const total = [0, 0, 0];
    const dead = [0, 0, 0];
    const WINDOWS = 2000;
    for (let bucket = 0; bucket < WINDOWS; bucket++) {
      const start = windowStart(bucket);
      for (const descriptor of goliathBatchForTime(start)) total[descriptor.archetype.sizeIndex]++;
      for (const event of goliathRaidEventsInWindow(camps, start - 1n, start + WINDOW)) {
        if (event.kind === 'goliathDefeated') dead[event.sizeIndex]++;
      }
    }
    const totalAll = total.reduce((a, b) => a + b, 0);
    const deadAll = dead.reduce((a, b) => a + b, 0);
    const fraction = deadAll / totalAll;
    expect(fraction).toBeGreaterThan(0.25);
    expect(fraction).toBeLessThan(0.55);
    // Small raiders should die more often than large ones (size-graded attrition).
    expect(dead[0] / total[0]).toBeGreaterThan(dead[2] / total[2]);
  });
});

describe('goliathRaidSchedule — event integrity', () => {
  it('every atMicros sits inside its window and the list is time-sorted', () => {
    for (let bucket = 0; bucket < 40; bucket++) {
      const start = windowStart(bucket);
      const events = goliathRaidEventsInWindow(camps, start - 1n, start + WINDOW);
      let previous = -1n;
      for (const event of events) {
        expect(event.atMicros).toBeGreaterThan(start);
        expect(event.atMicros).toBeLessThanOrEqual(start + WINDOW);
        expect(event.atMicros >= previous).toBe(true);
        previous = event.atMicros;
      }
    }
  });

  it('raidBossKill.bossEnemyId equals enemyIdFor(campIndex, 0)', () => {
    for (let bucket = 0; bucket < 40; bucket++) {
      const start = windowStart(bucket);
      for (const event of goliathRaidEventsInWindow(camps, start - 1n, start + WINDOW)) {
        if (event.kind !== 'raidBossKill') continue;
        expect(event.bossEnemyId).toBe(BigInt(enemyIdFor(event.campIndex, 0)));
      }
    }
  });

  it('edge-triggers: a union of consecutive slices equals the full window, no dup/gap', () => {
    const start = windowStart(11);
    const end = start + WINDOW;
    const full = goliathRaidEventsInWindow(camps, start - 1n, end);
    expect(full.length).toBeGreaterThan(0);

    const sliceCount = 9;
    const step = WINDOW / BigInt(sliceCount);
    let cursor = start - 1n;
    const union: GoliathRaidEvent[] = [];
    for (let slice = 0; slice < sliceCount; slice++) {
      const through = slice === sliceCount - 1 ? end : cursor + step;
      union.push(...goliathRaidEventsInWindow(camps, cursor, through));
      cursor = through;
    }

    // The union multiset equalling the full window is exactly the edge-trigger
    // guarantee: every event lands in exactly one slice — none dropped (gap),
    // none counted twice (an event in two slices would make the union longer).
    // (Two goliaths sacking the same camp at the same instant yield two identical
    // events on purpose; they dedup to one payout server-side.)
    const fullKeys = full.map(eventKey).sort();
    const unionKeys = union.map(eventKey).sort();
    expect(unionKeys).toEqual(fullKeys);
  });
});
