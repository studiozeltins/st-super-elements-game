# Phase 2 — Transcendence install + power scaling

> Part of Transcendence. Contracts + tracker: [PROGRESS.md](./PROGRESS.md) · Full plan:
> [../../docs/TRANSCENDENCE_PLAN.md](../../docs/TRANSCENDENCE_PLAN.md)

**Status:** ⬜ TODO · **Depends on:** Phase 1

Read the **Shared contracts** in PROGRESS.md before starting. This is the make-or-break
phase — shards must buy REAL power (invariant 3).

## Goal
Spend shards to push a C6 character past the ceiling (C7+). Endless power chase.

## Server (`spacetimedb/src/index.ts`)
- Add `transcendLevel: t.u32()` to `ownedCharacter` (default 0, cap `MAX_TRANSCEND_LEVEL`).
- New reducer `transcendCharacter({ characterId })`: require the char is C6; require
  `player.transcendShards >= TRANSCEND_SHARD_COST(nextLevel)`; deduct shards; increment
  `transcendLevel`; reject at cap or if char < C6 (`SenderError`).
- Extend healer scaling in `healParty` (~1490-1492): heal multiplier adds
  `transcendLevel * TRANSCEND_HEAL_STEP`.

## Client
- Regenerate bindings.
- Extend damage multiplier in `createGame.ts` (~391-393, used at 417 & 485):
  `1 + activeConstellation*0.08 + transcendLevel*TRANSCEND_DAMAGE_STEP`.
- Extract the multiplier into a pure module under `src/game/combat/` (dependency-free,
  like `comboSystem.ts`) so it unit-tests.
- UI: in `CharacterSheet.tsx` / `ConstellationRing.tsx` show `C6 · T{n}` and an Install
  button calling `transcendCharacter`, gated by shard balance + cap.

## Tests
- Pure math: `transcendDamageMultiplier(constellation, transcend)` extends correctly.
- Server logic: install deducts `TRANSCEND_SHARD_COST(n)` shards, raises level, rejects
  when short on shards / at cap / char < C6.
- `serverSync.test.ts` green.

## Validation
- `spacetime publish ... --server local -y` (additive) → regenerate → build.
- Playtest: earn shards, install a level, confirm damage numbers rise and shards drop by
  the cost curve (level n costs n).

## Commit
`feat(transcend): install shards to transcend characters past C6`

## Definition of done
- [ ] `transcendCharacter` reducer live; `ownedCharacter.transcendLevel` scales damage+heal
- [ ] install UI works, gated by shards/cap
- [ ] pure + server + sync tests green; build green
- [ ] published local; playtested power increase
- [ ] committed; PROGRESS.md updated
