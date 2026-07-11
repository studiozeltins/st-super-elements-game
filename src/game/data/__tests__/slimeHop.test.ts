// Unit tests for the slime hop cycle (micros-based, tick-rate independent) plus
// the server↔client parity lock: src/game/data/slimeHop.ts must stay a VERBATIM
// mirror of spacetimedb/src/slimeHop.ts (same pattern as serverWorldSim.test.ts
// — import both sides across the package boundary and compare).
import { describe, expect, it } from 'vitest';

import * as client from '../slimeHop';
import * as server from '../../../../spacetimedb/src/slimeHop';

const {
  SLIME_HOP_AIRTIME_MICROS,
  SLIME_HOP_LENGTH,
  SLIME_HOP_PAUSE_MAX_MICROS,
  SLIME_HOP_PAUSE_MIN_MICROS,
  SLIME_SLAM_RADIUS,
  SPIKY_HOP_AIRTIME_MICROS,
  SPIKY_HOP_PAUSE_MAX_MICROS,
  SPIKY_HOP_PAUSE_MIN_MICROS,
  SPIKY_SLAM_RADIUS,
  hasLanded,
  hopAirtimeMicrosFor,
  hopLandingToward,
  hopProgress,
  hopTravelSpeedFor,
  isAirborne,
  isSlimeArchetype,
  landingHits,
  nextHopPauseMicros,
  slamAttackIdFor,
  slamRadiusFor,
} = server;

describe('slime hop phase math (micros-based, tick-rate independent)', () => {
  it('duration 0 means grounded/idle: neither airborne nor landed', () => {
    expect(isAirborne(1_000_000n, 500_000n, 0n)).toBe(false);
    expect(hasLanded(1_000_000n, 500_000n, 0n)).toBe(false);
  });

  it('is airborne strictly before the hop end and landed at/after it', () => {
    const started = 2_000_000n;
    const duration = 550_000n;
    expect(isAirborne(started, started, duration)).toBe(true);
    expect(isAirborne(started + duration - 1n, started, duration)).toBe(true);
    expect(isAirborne(started + duration, started, duration)).toBe(false);
    expect(hasLanded(started + duration - 1n, started, duration)).toBe(false);
    expect(hasLanded(started + duration, started, duration)).toBe(true);
    expect(hasLanded(started + duration + 999_999n, started, duration)).toBe(true);
  });

  it('hopProgress runs 0..1 and clamps at both ends (0 when grounded)', () => {
    const started = 1_000_000n;
    const duration = 500_000n;
    expect(hopProgress(started, started, duration)).toBe(0);
    expect(hopProgress(started + 250_000n, started, duration)).toBeCloseTo(0.5, 9);
    expect(hopProgress(started + duration, started, duration)).toBe(1);
    expect(hopProgress(started + duration * 3n, started, duration)).toBe(1);
    expect(hopProgress(started + 250_000n, started, 0n)).toBe(0);
  });

  it('only slime archetypes hop; wisps + golems keep the walk', () => {
    expect(isSlimeArchetype('slime')).toBe(true);
    expect(isSlimeArchetype('spikySlime')).toBe(true);
    expect(isSlimeArchetype('windWisp')).toBe(false);
    expect(isSlimeArchetype('stoneGolem')).toBe(false);
  });

  it('spiky slimes hop faster (shorter airtime) and rest less', () => {
    expect(SPIKY_HOP_AIRTIME_MICROS).toBeLessThan(SLIME_HOP_AIRTIME_MICROS);
    expect(SPIKY_HOP_PAUSE_MIN_MICROS).toBeLessThan(SLIME_HOP_PAUSE_MIN_MICROS);
    expect(SPIKY_HOP_PAUSE_MAX_MICROS).toBeLessThan(SLIME_HOP_PAUSE_MAX_MICROS);
    expect(hopAirtimeMicrosFor(false)).toBe(BigInt(SLIME_HOP_AIRTIME_MICROS));
    expect(hopAirtimeMicrosFor(true)).toBe(BigInt(SPIKY_HOP_AIRTIME_MICROS));
  });

  it('nextHopPauseMicros spans exactly [MIN, MAX] from the injected float', () => {
    expect(nextHopPauseMicros(0, false)).toBe(BigInt(SLIME_HOP_PAUSE_MIN_MICROS));
    expect(nextHopPauseMicros(0.999999, false)).toBeLessThanOrEqual(BigInt(SLIME_HOP_PAUSE_MAX_MICROS));
    expect(nextHopPauseMicros(0.5, false)).toBe(
      BigInt(Math.round((SLIME_HOP_PAUSE_MIN_MICROS + SLIME_HOP_PAUSE_MAX_MICROS) / 2))
    );
    expect(nextHopPauseMicros(0, true)).toBe(BigInt(SPIKY_HOP_PAUSE_MIN_MICROS));
    // Deterministic: same float in, same pause out.
    expect(nextHopPauseMicros(0.37, true)).toBe(nextHopPauseMicros(0.37, true));
  });

  it('hopLandingToward caps at SLIME_HOP_LENGTH and lands ON a near target', () => {
    // Far target: exactly one hop length along the line.
    const far = hopLandingToward(0, 0, 10, 0);
    expect(far).toEqual({ x: SLIME_HOP_LENGTH, z: 0 });
    // Within one hop: lands exactly on the target (a chasing slime lands ON the player).
    expect(hopLandingToward(0, 0, 1, 0)).toEqual({ x: 1, z: 0 });
    // Zero distance: stays put.
    expect(hopLandingToward(3, 4, 3, 4)).toEqual({ x: 3, z: 4 });
    // Diagonal cap keeps the hop length.
    const diagonal = hopLandingToward(0, 0, 30, 40);
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(SLIME_HOP_LENGTH, 9);
  });

  it('landingHits is an inclusive radius test around the landing', () => {
    expect(landingHits(0, 0, SLIME_SLAM_RADIUS, 0, SLIME_SLAM_RADIUS)).toBe(true);
    expect(landingHits(0, 0, SLIME_SLAM_RADIUS + 0.01, 0, SLIME_SLAM_RADIUS)).toBe(false);
    expect(landingHits(5, 5, 5, 5, SLIME_SLAM_RADIUS)).toBe(true);
  });

  it('slam radius + attack id discriminate spiky (1.3 vs 1.5, slimeSlam vs spikySlam)', () => {
    expect(slamRadiusFor(false)).toBe(1.3);
    expect(slamRadiusFor(true)).toBe(1.5);
    expect(slamAttackIdFor(false)).toBe('slimeSlam');
    expect(slamAttackIdFor(true)).toBe('spikySlam');
  });

  it('a full-length hop travels exactly SLIME_HOP_LENGTH over its airtime', () => {
    expect(hopTravelSpeedFor(false) * (SLIME_HOP_AIRTIME_MICROS / 1_000_000)).toBeCloseTo(
      SLIME_HOP_LENGTH,
      9
    );
    expect(hopTravelSpeedFor(true)).toBeGreaterThan(hopTravelSpeedFor(false));
  });
});

describe('client slimeHop mirror stays in sync with the server (parity)', () => {
  it('every shared constant matches', () => {
    expect(client.SLIME_HOP_AIRTIME_MICROS).toBe(server.SLIME_HOP_AIRTIME_MICROS);
    expect(client.SPIKY_HOP_AIRTIME_MICROS).toBe(server.SPIKY_HOP_AIRTIME_MICROS);
    expect(client.SLIME_HOP_PAUSE_MIN_MICROS).toBe(server.SLIME_HOP_PAUSE_MIN_MICROS);
    expect(client.SLIME_HOP_PAUSE_MAX_MICROS).toBe(server.SLIME_HOP_PAUSE_MAX_MICROS);
    expect(client.SPIKY_HOP_PAUSE_MIN_MICROS).toBe(server.SPIKY_HOP_PAUSE_MIN_MICROS);
    expect(client.SPIKY_HOP_PAUSE_MAX_MICROS).toBe(server.SPIKY_HOP_PAUSE_MAX_MICROS);
    expect(client.SLIME_HOP_LENGTH).toBe(server.SLIME_HOP_LENGTH);
    expect(client.SLIME_SLAM_RADIUS).toBe(server.SLIME_SLAM_RADIUS);
    expect(client.SPIKY_SLAM_RADIUS).toBe(server.SPIKY_SLAM_RADIUS);
    expect(client.SLIME_SLAM_ATTACK_ID).toBe(server.SLIME_SLAM_ATTACK_ID);
    expect(client.SPIKY_SLAM_ATTACK_ID).toBe(server.SPIKY_SLAM_ATTACK_ID);
  });

  it('the mirror exports the same names the server does (no drift in either direction)', () => {
    expect(Object.keys(client).sort()).toEqual(Object.keys(server).sort());
  });

  it('phase + landing functions agree across a grid of inputs', () => {
    const starts = [0n, 1_000_000n, 123_456_789n];
    const durations = [0n, 480_000n, 550_000n];
    for (const started of starts) {
      for (const duration of durations) {
        for (const offset of [0n, 1n, 275_000n, 549_999n, 550_000n, 2_000_000n]) {
          const now = started + offset;
          expect(client.isAirborne(now, started, duration)).toBe(server.isAirborne(now, started, duration));
          expect(client.hasLanded(now, started, duration)).toBe(server.hasLanded(now, started, duration));
          expect(client.hopProgress(now, started, duration)).toBe(server.hopProgress(now, started, duration));
        }
      }
    }
    for (const float of [0, 0.25, 0.5, 0.75, 0.999]) {
      expect(client.nextHopPauseMicros(float, false)).toBe(server.nextHopPauseMicros(float, false));
      expect(client.nextHopPauseMicros(float, true)).toBe(server.nextHopPauseMicros(float, true));
    }
    for (const [fromX, fromZ, toX, toZ] of [
      [0, 0, 10, 0],
      [0, 0, 1, 1],
      [-3, 4, 2, -6],
      [5, 5, 5, 5],
    ] as const) {
      expect(client.hopLandingToward(fromX, fromZ, toX, toZ)).toEqual(
        server.hopLandingToward(fromX, fromZ, toX, toZ)
      );
    }
    for (const spiky of [false, true]) {
      expect(client.slamRadiusFor(spiky)).toBe(server.slamRadiusFor(spiky));
      expect(client.slamAttackIdFor(spiky)).toBe(server.slamAttackIdFor(spiky));
      expect(client.hopAirtimeMicrosFor(spiky)).toBe(server.hopAirtimeMicrosFor(spiky));
      expect(client.hopTravelSpeedFor(spiky)).toBe(server.hopTravelSpeedFor(spiky));
    }
    for (const archetype of ['slime', 'spikySlime', 'windWisp', 'stoneGolem']) {
      expect(client.isSlimeArchetype(archetype)).toBe(server.isSlimeArchetype(archetype));
    }
  });
});
