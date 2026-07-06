# Context

Running context notes extracted from ingested docs, keyed by topic with source
attribution.

---

## Topic: Goal / vision

- source: docs/TRANSCENDENCE_PLAN.md
- Turn the endless sandbox into a PVPvE loop with a real chase (power past C6), scarce
  stakes (constellation shards), meaningful PVP (steal shards), co-op content (party +
  raid boss), and roles that matter.

## Topic: The core loop this builds

- source: docs/TRANSCENDENCE_PLAN.md
- pull gacha → build roster → grind each char to C6 (early game)
- C6 reached → every further dupe mints 1 SHARD (rare) (mid game)
- install shard → Transcend past C6 (C7+, real power) (endless chase)
- open world PVP-on → your carried shards ride at risk
- death (PVE/PVP) → lose 1/3 gems + drop 1 shard; no shards → erode active char
  (transcend--, then C6→C5); PVP killer STEALS the dropped shard
- party up → RAID BOSS (needs tank+healer+dps) → big shard payout (PVE faucet)
- parties gang the whale → drain shards → whale must defend

## Topic: Phase structure

- source: docs/TRANSCENDENCE_PLAN.md
- Each phase is agent-sized: one vertical slice (server + client + tests + validation),
  ending in one atomic commit. Phases are ordered by dependency — do not start a phase
  until its `Depends on` phases are merged.

## Topic: Suggested execution order

- source: docs/TRANSCENDENCE_PLAN.md
- `A → 0 → (1 → 2 → 3)` and in parallel `4 → 5`, then `6 → 7`.
- Phase A (rename + wipe) goes first so everything after builds on clean naming.
- Phases 1–3 are the transcendence spine; 4–5 are the co-op spine; they converge at 6.

## Topic: Cross-reference targets (implementation surface)

- source: docs/TRANSCENDENCE_PLAN.md classification cross_refs
- Server: `spacetimedb/src/index.ts`, `spacetimedb/src/enemyStats.ts`
- Client data: `src/game/data/constants.ts`, `constellations.ts`, `characters.ts`,
  `gem*.ts`, `shardDrops.ts`, `__tests__/serverSync.test.ts`
- Client combat/game: `src/game/combat/comboSystem.ts`, `src/game/createGame.ts`
- UI: `src/ui/CharacterScreen.tsx`, `src/ui/GachaScreen.tsx`, `CharacterSheet.tsx`,
  `ConstellationRing.tsx`, `App.tsx`
- Ops: `scripts/*.mjs`, `CLAUDE.md`
- Note: all cross_refs point to source/code files, not to other planning docs — no
  cross-doc reference graph exists, so no cycle is possible.
