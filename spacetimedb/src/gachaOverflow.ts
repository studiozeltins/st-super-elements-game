// Pure dupe-grant decision, kept dependency-free so it can be unit-tested directly
// under the client's vitest runner (same pattern as combatMath.ts). No ctx/db/import,
// no random, no time — this preserves the calling reducer's determinism (CLAUDE.md
// rule 2) and keeps the shard amount server-authoritative (mitigates T-1-01: the
// amount derives only from a server constant, never a client-supplied value).

export interface DupeGrantOutcome {
  constellation: number;
  shardMinted: number;
}

// Resolves what a duplicate character pull grants. Below the constellation cap the
// dupe advances the constellation and mints nothing; at (or past) the cap it pins
// the constellation to max and mints `shardPerOverflow` transcendence shards.
export function resolveDupeGrant(
  currentConstellation: number,
  maxConstellation: number,
  shardPerOverflow: number
): DupeGrantOutcome {
  if (currentConstellation < maxConstellation) {
    return { constellation: currentConstellation + 1, shardMinted: 0 };
  }
  return { constellation: maxConstellation, shardMinted: shardPerOverflow };
}
