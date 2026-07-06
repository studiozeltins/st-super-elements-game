import { describe, expect, it } from 'vitest';

// Import the real helper across the package boundary (server module → client vitest
// runner), same mechanism as transcendInstall.test.ts — not a local re-implementation.
import { applyDeathShardPenalty } from '../../../../spacetimedb/src/deathPenalty';
// Consume the shared client mirror instead of re-hardcoding the loss amount.
import { SHARD_DEATH_LOSS } from '../constants';

describe('applyDeathShardPenalty', () => {
  it('has-shards branch: spends shards, erodes nothing', () => {
    expect(applyDeathShardPenalty(2, 3, 6, SHARD_DEATH_LOSS)).toEqual({
      shardsLost: SHARD_DEATH_LOSS,
      erodedTranscend: false,
      erodedConstellation: false,
      nextShards: 2 - SHARD_DEATH_LOSS,
      nextTranscendLevel: 3,
      nextConstellation: 6,
    });
  });

  it('only-transcend branch: erodes ONE transcend level, loses 0 shards', () => {
    expect(applyDeathShardPenalty(0, 3, 6, SHARD_DEATH_LOSS)).toEqual({
      shardsLost: 0,
      erodedTranscend: true,
      erodedConstellation: false,
      nextShards: 0,
      nextTranscendLevel: 2,
      nextConstellation: 6,
    });
  });

  it('only-constellation branch: erodes ONE constellation (C6->C5), loses 0 shards', () => {
    expect(applyDeathShardPenalty(0, 0, 6, SHARD_DEATH_LOSS)).toEqual({
      shardsLost: 0,
      erodedTranscend: false,
      erodedConstellation: true,
      nextShards: 0,
      nextTranscendLevel: 0,
      nextConstellation: 5,
    });
  });

  it('nothing branch: all zero, no negatives', () => {
    expect(applyDeathShardPenalty(0, 0, 0, SHARD_DEATH_LOSS)).toEqual({
      shardsLost: 0,
      erodedTranscend: false,
      erodedConstellation: false,
      nextShards: 0,
      nextTranscendLevel: 0,
      nextConstellation: 0,
    });
  });

  it('order guarantee: shards present takes priority — no level is ever eroded', () => {
    const result = applyDeathShardPenalty(5, 4, 6, SHARD_DEATH_LOSS);
    expect(result.erodedTranscend).toBe(false);
    expect(result.erodedConstellation).toBe(false);
  });

  it('empty-victim PVP credit: shardsLost is 0 when the victim holds no shards (A1 / T-03-02)', () => {
    // Whatever levels an empty-shard victim has, the value a killer is credited is 0.
    expect(applyDeathShardPenalty(0, 4, 6, SHARD_DEATH_LOSS).shardsLost).toBe(0);
    expect(applyDeathShardPenalty(0, 0, 6, SHARD_DEATH_LOSS).shardsLost).toBe(0);
    expect(applyDeathShardPenalty(0, 0, 0, SHARD_DEATH_LOSS).shardsLost).toBe(0);
  });
});
