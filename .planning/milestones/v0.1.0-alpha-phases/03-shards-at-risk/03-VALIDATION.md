---
phase: 3
slug: shards-at-risk
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-07
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (as-installed) |
| **Config file** | repo `vitest`/`vite` config (existing — Wave 0 adds specs only) |
| **Quick run command** | `pnpm vitest run <file>` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~5–15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run <changed spec>`
- **After every plan wave:** Run `pnpm test` (full vitest suite, incl. `serverSync`)
- **Before `/gsd-verify-work`:** Full suite green + `pnpm build` green + additive publish + regenerate, then two-client playtest
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-xx | 01 | 0 | REQ-shard-risk | T-03-01 | has-shards branch: `shardsLost=1`, no erosion | unit | `pnpm vitest run src/game/data/__tests__/deathPenalty.test.ts` | ❌ W0 | ⬜ pending |
| 03-01-xx | 01 | 0 | REQ-shard-risk | — | only-transcend: `erodedTranscend`, `transcendLevel-1`, `shardsLost=0` | unit | same | ❌ W0 | ⬜ pending |
| 03-01-xx | 01 | 0 | REQ-shard-risk | — | only-constellation: `erodedConstellation` (C6→C5), `shardsLost=0` | unit | same | ❌ W0 | ⬜ pending |
| 03-01-xx | 01 | 0 | REQ-shard-risk | T-03-01 | nothing branch: all false, no negatives (u32 safety) | unit | same | ❌ W0 | ⬜ pending |
| 03-01-xx | 01 | 0 | REQ-shard-risk | — | branch ORDER: shards present ⇒ never erodes a level | unit | same | ❌ W0 | ⬜ pending |
| 03-01-xx | 01 | 0 | REQ-shard-risk | T-03-02 | PVP credit == `shardsLost` (0 on empty victim) | unit | same | ❌ W0 | ⬜ pending |
| 03-xx-xx | — | 1 | REQ-shard-risk | — | `SHARD_DEATH_LOSS` server/client mirror in sync | mirror | `pnpm vitest run src/game/data/__tests__/serverSync.test.ts` | ✅ | ⬜ pending |
| 03-xx-xx | — | 1 | REQ-shard-risk | T-03-03 | `gemIsCollectible` grace governs shard pickup (reused) | unit | `pnpm vitest run src/game/data/__tests__/serverWorldSim.test.ts` | ✅ | ⬜ pending |
| 03-xx-xx | — | 2 | REQ-shard-risk | T-03-02 | PVE creates a `shard_drop` (not a killer credit); PVP transfers, no drop | manual | two-client playtest | manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `spacetimedb/src/deathPenalty.ts` — the pure `applyDeathShardPenalty` helper under test (mirror `transcendInstall.ts`).
- [ ] `src/game/data/__tests__/deathPenalty.test.ts` — cross-import unit test: all four branches + branch order + empty-victim credit (mirror `transcendInstall.test.ts` structure).

*Existing infra covers the rest: `serverSync.test.ts` already asserts `SHARD_DEATH_LOSS`; `serverWorldSim.test.ts` already exercises the `gemIsCollectible` grace.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| PVE death creates a `shard_drop` row, not a killer credit | REQ-shard-risk | No in-process reducer harness with a mock DB — server-logic tests are pure cross-imports only; building a DB mock is out of scope | Two-client playtest: PVE-kill a carrier → a collectible `shard_drop` scatters (no killer credit); grabbable by anyone after 1.2s grace |
| PVP kill transfers exactly 1 shard to the killer | REQ-shard-risk | Same — wiring is only verifiable via helper math (`shardsLost`) + code review + live play | Two-client PVP kill of a carrier → shard moves to killer counter; victim counter drops; NO ground drop |
| 0-shard death erodes transcend level then a C-level (never below floor beyond one C) | REQ-shard-risk | Cross-reducer state mutation, no DB harness | Zero out shards, PVE-die: transcendLevel decrements; die again with transcend 0 → one C-level erodes (C6→C5); floor holds |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (`deathPenalty.ts` + its test)
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
