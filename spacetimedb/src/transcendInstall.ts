// Pure transcend-install decision, kept dependency-free so it can be unit-tested
// directly under the client's vitest runner (same pattern as gachaOverflow.ts). No
// ctx/db/import, no random, no time — this preserves the calling reducer's determinism
// (CLAUDE.md rule 2) and keeps the install cost/level server-authoritative: the caller
// (transcendCharacter reducer) supplies only a characterId, and every value here derives
// from server state + constants, never a client-supplied amount.
//
// Branch ORDER is load-bearing (mitigates T-02-03): the insufficient_shards check is the
// LAST gate and computes shardCost only after the C6/cap gates pass, so the ok branch is
// the only path that reports a deduct and the reducer can never subtract below cost
// (u32 underflow).

export type TranscendInstall =
  | { ok: true; nextLevel: number; shardCost: number }
  | { ok: false; reason: 'below_c6' | 'at_cap' | 'insufficient_shards' };

// Resolves whether an install may proceed and what it costs. Gates in priority order:
// (1) must be at the constellation cap (C6), (2) must be under the transcend cap,
// (3) must hold enough shards for the next level. Only the fully-passing path returns ok.
export function resolveTranscendInstall(
  constellation: number,
  maxConstellation: number,
  currentTranscend: number,
  maxTranscend: number,
  shards: number,
  cost: (n: number) => number
): TranscendInstall {
  if (constellation < maxConstellation) return { ok: false, reason: 'below_c6' };
  if (currentTranscend >= maxTranscend) return { ok: false, reason: 'at_cap' };
  const nextLevel = currentTranscend + 1;
  const shardCost = cost(nextLevel);
  if (shards < shardCost) return { ok: false, reason: 'insufficient_shards' };
  return { ok: true, nextLevel, shardCost };
}
