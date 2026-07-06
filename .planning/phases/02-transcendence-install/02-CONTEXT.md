# Phase 2: Transcendence install - Context

**Gathered:** 2026-07-06
**Status:** Ready for planning
**Source:** PRD Express Path (.planning/transcendence/phase-2-transcendence.md + PROGRESS.md shared contracts)

<domain>
## Phase Boundary

Spend `transcendShards` to push a **C6** character past the constellation ceiling into
transcend levels T1..T`MAX_TRANSCEND_LEVEL`. Each level buys REAL, observable power:
more damage for all, more heal for healers. This is the "shards buy real power"
invariant (invariant 3) — the make-or-break phase of the Transcendence milestone.

In scope: new `transcendLevel` column on `owned_character`, a `transcendCharacter`
reducer, damage/heal scaling wired to that level, extracted pure multiplier module for
unit testing, and install UI gated by shard balance + cap.

Out of scope: shard-at-risk-on-death / PVP steal / erosion (Phase 3), roles (Phase 4),
party/raid (Phases 5–6), balance pass (Phase 7).
</domain>

<decisions>
## Implementation Decisions

Everything below is LOCKED (from the phase PRD + Phase 0 tunables + shared contracts).

### Server schema (`spacetimedb/src/index.ts`)
- Add `transcendLevel: t.u32()` to the `owned_character` table, `default(0)`.
- Additive column → migrate-publish (drop `-c`), do NOT wipe.

### Reducer `transcendCharacter({ characterId })`
- Reject with `SenderError` if the character is **below C6** (constellation < 6).
- Reject with `SenderError` if already at `MAX_TRANSCEND_LEVEL` (cap).
- Compute `nextLevel = transcendLevel + 1`; require
  `player.transcendShards >= TRANSCEND_SHARD_COST(nextLevel)`; else `SenderError`.
- On success: deduct `TRANSCEND_SHARD_COST(nextLevel)` from `player.transcendShards`
  and increment `owned_character.transcendLevel` by 1.
- `ctx.sender` is authority for who owns the character. Never trust caller-supplied identity.

### Damage scaling (client `src/game/createGame.ts` ~391–393; used at 417 & 485)
- Current: `constellationDamageMultiplier() = 1 + activeConstellation * CONSTELLATION_DAMAGE_STEP` (0.08).
- New: multiplier also adds `transcendLevel * TRANSCEND_DAMAGE_STEP` (0.05).
- **Extract** the pure math into a dependency-free module under `src/game/combat/`
  (mirror `comboSystem.ts` / `damageKind.ts` style) so it unit-tests without a DB or game loop.
  Exported as `transcendDamageMultiplier(constellation, transcend)`.

### Heal scaling (server `healParty` reducer, ~1496)
- Heal multiplier adds `transcendLevel * TRANSCEND_HEAL_STEP` (0.08) for healers.

### UI (`src/ui/CharacterSheet.tsx`, `src/ui/ConstellationRing.tsx`)
- Show `C6 · T{n}` when transcended.
- Install button calling `transcendCharacter`, **gated**: disabled when char < C6,
  at `MAX_TRANSCEND_LEVEL`, or `transcendShards < TRANSCEND_SHARD_COST(nextLevel)`.
- User-facing rare currency noun: "Constellation Shards".

### Bindings + build
- After schema/reducer change: publish local → `pnpm run spacetime:generate` → `pnpm build`.

### Claude's Discretion
- Exact file name/signature of the extracted combat module (suggest `transcendScaling.ts`).
- Where in `createGame.ts` `transcendLevel` is sourced (state setter mirroring
  `setActiveConstellation`) — must stay in sync with the active character.
- UI layout/copy details of the Install button and `C6 · T{n}` badge.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone contracts (READ FIRST)
- `.planning/transcendence/PROGRESS.md` — Shared contracts: naming (verbatim), invariants,
  locked tunables table, workflow per phase. Non-negotiable.
- `.planning/transcendence/phase-2-transcendence.md` — this phase's authored spec + DoD.
- `docs/TRANSCENDENCE_PLAN.md` — full milestone plan.

### Locked constants (Phase 0 — already live, DO NOT re-declare)
- `spacetimedb/src/index.ts:78-84` — server `MAX_TRANSCEND_LEVEL`, `TRANSCEND_DAMAGE_STEP`,
  `TRANSCEND_HEAL_STEP`, `TRANSCEND_SHARD_COST(n)`.
- `src/game/data/constants.ts:8-15` — client mirrors of the same.
- `src/game/data/__tests__/serverSync.test.ts` — guards client/server number mirror (must stay green).
- `src/game/data/__tests__/transcendence.test.ts` — existing constant tests.

### Code to modify
- `spacetimedb/src/index.ts` — `owned_character` table (~375), `player.transcendShards` (~290),
  `healParty` reducer (~1496).
- `src/game/createGame.ts:391-393` — `constellationDamageMultiplier` (consumed at 417 & 485).
- `src/game/combat/comboSystem.ts` — pattern to mirror for the new pure module.
- `src/ui/CharacterSheet.tsx`, `src/ui/ConstellationRing.tsx` — install UI.
</canonical_refs>

<specifics>
## Specific Ideas

Locked tunables (Phase 0, referenced not redefined):

| Constant | Value | Meaning |
|---|---|---|
| `MAX_TRANSCEND_LEVEL` | 10 | levels past C6 |
| `TRANSCEND_DAMAGE_STEP` | 0.05 | +5% dmg / transcend level |
| `TRANSCEND_HEAL_STEP` | 0.08 | +8% heal / transcend level (healers) |
| `TRANSCEND_SHARD_COST(n)` | `n` | installing level n costs n shards |

Tests required (DoD):
- Pure math: `transcendDamageMultiplier(constellation, transcend)` extends correctly.
- Server logic: install deducts `TRANSCEND_SHARD_COST(n)`, raises level; rejects when
  short on shards / at cap / char < C6.
- `serverSync.test.ts` green; `pnpm build` green.

Validation: publish local (additive) → regenerate → build → playtest (earn shards,
install a level, confirm damage numbers rise and shards drop by the cost curve, level n costs n).
</specifics>

<deferred>
## Deferred Ideas

- Shard at risk on death / PVP steal / erosion → Phase 3.
- Character roles, party, raid faucet, balance → Phases 4–7.
</deferred>

---

*Phase: 02-transcendence-install*
*Context gathered: 2026-07-06 via PRD Express Path*
