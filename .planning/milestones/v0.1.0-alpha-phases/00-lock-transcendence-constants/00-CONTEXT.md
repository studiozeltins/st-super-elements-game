# Phase 0: Lock transcendence constants - Context

**Gathered:** 2026-07-06
**Status:** Ready for planning
**Source:** Synthesized from existing transcendence planning docs (`.planning/transcendence/phase-0-constants.md`, `PROGRESS.md`, `REQUIREMENTS.md`)

<domain>
## Phase Boundary

Add every transcendence tunable as a **constant only** on both server and client, name-locked
and mirrored identically. NO logic wires them yet — later phases (1–7) reference this single
source. No schema change, no reducer change, no publish. Ends in one atomic commit.

**In scope:** constant definitions (server + client), one pure helper, sync test extension,
trivial range unit test, `pnpm test` + `pnpm build` green.

**Out of scope:** any reducer referencing the constants, schema columns (`transcendShards`,
`transcendLevel` come in Phases 1–2), UI, publish/deploy.
</domain>

<decisions>
## Implementation Decisions (all LOCKED — from PROGRESS.md shared contracts)

### Constants + values (locked tunables table — verbatim)
- `MAX_TRANSCEND_LEVEL = 10` — levels past C6
- `TRANSCEND_DAMAGE_STEP = 0.05` — +5% dmg / transcend level
- `TRANSCEND_HEAL_STEP = 0.08` — +8% heal / transcend level (healers)
- `SHARD_PER_OVERFLOW_DUPE = 1` — shards per C6-dupe
- `SHARD_DEATH_LOSS = 1` — shards dropped on death
- `RAID_SHARD_PAYOUT = 6` — shards a raid boss drops, split among party

### Helper (NOT a constant)
- `TRANSCEND_SHARD_COST(n) = n` — installing level `n` costs `n` shards. Implement as a small
  pure function, both server and client. (Trivially `n` today, but a named helper so the cost
  curve is one editable place later.)

### Naming (verbatim, non-negotiable)
- Constant prefixes: `SHARD_*`, `TRANSCEND_*`.
- NEVER `primogem` (renamed Phase A). NEVER "fragment"/"crystal" — always `shard`.
- Transcendence currency noun (user-facing, later phases): "Constellation Shards".

### Placement
- **Server:** add to `spacetimedb/src/index.ts` near the existing constellation/economy
  constants (currently lines ~69–74: `MAX_CONSTELLATION`, `HEAL_CONSTELLATION_STEP`,
  `STARTING_GEMS`, `DUPLICATE_REFUND`, `KILL_REWARD_GEMS`). Expose as plain
  `const NAME = value;` so the grep-based sync test can extract them. Do NOT reference them
  in any reducer.
- **Client:** mirror in `src/game/data/constants.ts` (existing mirror file — same pattern as
  `SAFE_ZONE_RADIUS`, `GACHA_PULL_COST` marked `// server`). A dedicated
  `src/game/data/transcendence.ts` re-exported from `constants.ts` is acceptable if cleaner,
  but the sync test must be able to import each value.

### Tests
- Extend `src/game/data/__tests__/serverSync.test.ts` using the existing
  `extractServerConstant(name)` helper (regex `const ${name} = (\d+(?:\.\d+)?);` — already
  handles decimal steps like `0.05`). Add one `it.each` row per new constant asserting
  server literal === client value, mirroring the existing `SAFE_ZONE_RADIUS` / `GACHA_PULL_COST`
  block.
- Trivial unit test: all constants present and in valid ranges (`MAX_TRANSCEND_LEVEL > 0`,
  all `*_STEP > 0`, payouts/costs `> 0`), plus `TRANSCEND_SHARD_COST(n) === n` for a few `n`.

### Claude's Discretion
- Whether shards constants live inline in `constants.ts` or a new `transcendence.ts` re-export.
- Exact test file organization (extend serverSync vs a small new `transcendence.test.ts` for
  the range/helper unit — both acceptable).
- Ordering/grouping of the constants within the server block (keep them contiguous + commented).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Transcendence design (source of truth for values + naming)
- `.planning/transcendence/PROGRESS.md` — Shared contracts: locked tunables table, naming
  rules, invariants. **The authority for values.**
- `.planning/transcendence/phase-0-constants.md` — this phase's spec (constants list, placement,
  test guidance, commit message).
- `docs/TRANSCENDENCE_PLAN.md` — full multi-phase plan (background only).

### Code to modify
- `spacetimedb/src/index.ts` (~lines 61–75) — server constant block.
- `src/game/data/constants.ts` — client mirror file.
- `src/game/data/__tests__/serverSync.test.ts` — sync test (has `extractServerConstant`).

</canonical_refs>

<specifics>
## Specific Ideas

- Follow the EXACT existing sync pattern: server `const NAME = value;`, client
  `export const NAME = value; // server`, test row `['NAME', NAME]` in an `it.each` calling
  `extractServerConstant`.
- Decimal values (`0.05`, `0.08`) already supported by `extractServerConstant` regex — no test
  helper change needed.
- Commit message (from spec): `feat(transcend): lock constants for transcendence system`.
- After landing: update `.planning/transcendence/PROGRESS.md` status box + checklist (Phase 0
  ✅, commit hash).
</specifics>

<deferred>
## Deferred Ideas

- `transcendShards` / `transcendLevel` schema columns → Phases 1–2.
- Any reducer/logic/UI using these constants → Phases 1–7.
- Publish/deploy → not this phase (no schema/logic change).
</deferred>

---

*Phase: 00-lock-transcendence-constants*
*Context gathered: 2026-07-06 via synthesis of existing transcendence planning docs*
