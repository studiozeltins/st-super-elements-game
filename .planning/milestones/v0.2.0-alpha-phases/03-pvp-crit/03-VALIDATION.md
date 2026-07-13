---
phase: 3
slug: pvp-crit
status: planned
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-09
updated: 2026-07-09
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.2.4 (existing — no Wave 0 install) |
| **Config file** | `vitest.config.ts` (repo root) |
| **Quick run command** | `pnpm vitest run src/game/data/__tests__/serverSync.test.ts` |
| **Full suite command** | `pnpm test` (= `vitest run`; ~475+ tests, all green at phase start) |
| **Estimated runtime** | quick ~5s; full ~30s; module build (`cd spacetimedb && spacetime build`) ~20s |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run src/game/data/__tests__/serverSync.test.ts` + `cd spacetimedb && spacetime build` (when server sources changed)
- **After every plan wave:** Run `pnpm test` + `pnpm build`
- **Before `/gsd-verify-work`:** Full suite green + local publish/generate/build + two-client playtest approved
- **Max feedback latency:** ~60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 1 | CRIT-07 | T-03-01/02/03/05 | attackPlayer takes intent only; server composes amount + rolls crit; attacker identity from ctx.sender | build + source assertions | `cd spacetimedb && spacetime build` | ✅ | ⬜ pending |
| 3-01-02 | 01 | 1 | CRIT-07 | T-03-01 | No client caller sends a damage number for PVP | build + unit | `pnpm build && pnpm test` | ✅ | ⬜ pending |
| 3-01-03 | 01 | 1 | CRIT-07 | — | Rendered crit is cosmetic, driven solely by server isCrit; single subscription | build + unit | `pnpm build && pnpm test` | ✅ | ⬜ pending |
| 3-02-01 | 02 | 2 | CRIT-07 | T-03-07/08 | Additive migrate only (no wipe); live reducer shape has no damage param | CLI | `spacetime describe 2d-impact-game-fr9ti --server local table pvp_hit --json && pnpm build` | ✅ (command) | ⬜ pending |
| 3-02-02 | 02 | 2 | CRIT-07 | T-03-01 | Modified client cannot fake a PVP crit or inflate PVP damage (observed truthful numbers) | **manual** (human checkpoint) | `pnpm build` (gate only; behavior is human-verified) | ❌ human | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Regression gates carried (already-existing suites that must stay green — `resolvePlayerHit`'s pure inputs and the kill path):
- `pnpm vitest run src/game/data/__tests__/crit.test.ts src/game/data/__tests__/damage.test.ts src/game/data/__tests__/skillGate.test.ts`
- `pnpm vitest run src/game/data/__tests__/deathPenalty.test.ts` (shard conservation on killing blow, SC3)
- `pnpm vitest run src/game/data/__tests__/serverSync.test.ts` (INV-5 — no new mirrored constants expected this phase)

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new pure helpers are expected (`resolvePlayerHit` already encapsulates the roll; the reducer delta is glue) — per RESEARCH §Validation Architecture, zero new test files.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Truthful PVP crit number on every subscribed client (victim pvpCrit, attacker upgrade, spectator), exactly one number per event | CRIT-07 (SC2) | Frame-level/visual + event-delivery properties; Phase-2 learning: 3 real bugs of this class shipped past 475 green tests | Plan 03-02 Task 2 how-to-verify, checks 1–3, 6 |
| Distinct per-character crit frequency in PVP (vesper 0.36 vs glacia 0.10) | CRIT-07 (SC3) | Statistical/visual over live RNG | Plan 03-02 Task 2, check 4 |
| Killing blow floats FULL amount; shard-theft loop resolves; victim respawns with data intact | CRIT-07 (SC3) | Multi-client end-to-end on a live migrated DB | Plan 03-02 Task 2, check 7 |
| Additive event-table migrate accepted on a live migrated DB (D3-01 open question) | CRIT-07 | Only observable at publish time against the real DB | Plan 03-02 Task 1 (publish exit 0 + describe shows 4 columns) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none — no gaps)
- [x] No watch-mode flags (all commands use `vitest run` / one-shot builds)
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-09 (planner)
