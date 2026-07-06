// Pure death-penalty decision, kept dependency-free so it can be unit-tested
// directly under the client's vitest runner (same pattern as transcendInstall.ts).
// No ctx/db/import, no random, no time — this preserves the calling reducer's
// determinism (CLAUDE.md rule 2) and keeps the penalty server-authoritative: the
// caller supplies only the victim's current state + the SHARD_DEATH_LOSS constant,
// never a client-supplied amount.
//
// Branch ORDER is load-bearing (mitigates T-03-01, the u32-underflow safety): a
// value is only ever decremented inside the branch that already proved it `> 0`,
// so no field can go negative — same discipline as resolveTranscendInstall. The
// `shardsLost` output is 0 on every erosion branch, so an empty victim credits a
// PVP killer nothing (mitigates T-03-02 / the A1 economy invariant).

export interface DeathShardPenalty {
  shardsLost: number;
  erodedTranscend: boolean;
  erodedConstellation: boolean;
  nextShards: number;
  nextTranscendLevel: number;
  nextConstellation: number;
}

// Resolves what a death costs the victim. Gates in priority order:
// (1) has shards → spend up to `loss` shards, erode nothing;
// (2) else has a transcend level → erode ONE level, lose 0 shards;
// (3) else has a constellation → erode ONE constellation, lose 0 shards;
// (4) else all-zero no-op. `shardsLost` is only non-zero on gate (1).
export function applyDeathShardPenalty(
  transcendShards: number,
  transcendLevel: number,
  constellation: number,
  loss: number
): DeathShardPenalty {
  if (transcendShards > 0) {
    return {
      shardsLost: loss,
      erodedTranscend: false,
      erodedConstellation: false,
      nextShards: Math.max(0, transcendShards - loss),
      nextTranscendLevel: transcendLevel,
      nextConstellation: constellation,
    };
  }
  if (transcendLevel > 0) {
    return {
      shardsLost: 0,
      erodedTranscend: true,
      erodedConstellation: false,
      nextShards: 0,
      nextTranscendLevel: transcendLevel - 1,
      nextConstellation: constellation,
    };
  }
  if (constellation > 0) {
    return {
      shardsLost: 0,
      erodedTranscend: false,
      erodedConstellation: true,
      nextShards: 0,
      nextTranscendLevel: 0,
      nextConstellation: constellation - 1,
    };
  }
  return {
    shardsLost: 0,
    erodedTranscend: false,
    erodedConstellation: false,
    nextShards: 0,
    nextTranscendLevel: 0,
    nextConstellation: 0,
  };
}
