---
phase: 05
slug: swordswing-swordswirl-combo
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-10
---

# Phase 05 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from 05-RESEARCH.md §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.2.4 |
| **Config file** | vite/vitest default (project root; tests under `src/**/__tests__`) |
| **Quick run command** | `pnpm vitest run src/game/data/__tests__/attacks.test.ts src/game/data/__tests__/attackHitbox.test.ts src/game/data/__tests__/unitAttackFsm.test.ts` |
| **Full suite command** | `pnpm test` (= `vitest run`) |
| **Estimated runtime** | ~5 seconds (quick), ~30s full |

---

## Sampling Rate

- **After every task commit:** Run the quick run command above
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** Full suite green + `pnpm build` (`tsc -b`) clean + migrated-DB playtest
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01 Task 1 | 05-01 | 1 | ATK-02 | T-05-01 | cone resolved server-side vs live positions | unit (pure, TDD) | `pnpm vitest run src/game/data/__tests__/attackHitbox.test.ts` | ✅ extend | ⬜ pending |
| 05-01 Task 2 | 05-01 | 1 | ATK-02 | T-05-01 | selection cannot be client-influenced; basics gate on basic cooldown | unit (pure, TDD) | `pnpm vitest run src/game/data/__tests__/attacks.test.ts` | ✅ extend | ⬜ pending |
| 05-01 Task 2 | 05-01 | 1 | ATK-03 | T-05-03 | chain data terminates; swirl not selectable; no-one-shot invariant (680 raw < 900 min HP) | unit (parity) | `pnpm vitest run src/game/data/__tests__/serverSync.test.ts` | ✅ extend | ⬜ pending |
| 05-01 Task 3 | 05-01 | 1 | ATK-03 | T-05-01 | coalesced tick across chain: swing strike resolved, ends WINDUP-swirl, no cooldown written | unit (pure — `walkAttackTransitions` extraction, Wave-0 seam RESOLVED) | `pnpm vitest run src/game/data/__tests__/unitAttackFsm.test.ts` | ✅ extend | ⬜ pending |
| 05-02 Tasks 1-2 | 05-02 | 1 | ATK-02/03 | T-05-04 | clips/juice driven only by server rows/events | grep gates + human (05-05) | `grep -c "swordSwing\|swordSwirl" src/game/systems/createGoliathRenderer.ts src/game/createGame.ts` | manual-feel deferred | ⬜ pending |
| 05-03 Task 1 | 05-03 | 2 | ATK-02, ATK-03 | T-05-01/02 | glue delegates to tested pure layer; leap-only teleport; determinism grep-gate | unit (regression) | quick trio + serverSync (see plan) | ✅ | ⬜ pending |
| 05-03 Task 2 | 05-03 | 2 | ATK-02, ATK-03 | T-05-06 | additive migrate, rows survive, no wipe | CLI (describe/sql/logs) | `spacetime describe 2d-impact-game-fr9ti table unit_attack --json --server local` | ✅ | ⬜ pending |
| 05-04 Task 1 | 05-04 | 2 | ATK-02 | T-05-07 | client mirror parity-locked to server ATTACKS (INV-5) | unit (parity) | `pnpm vitest run src/game/data/__tests__/serverSync.test.ts` | ✅ extend | ⬜ pending |
| 05-04 Task 2 | 05-04 | 2 | ATK-02, ATK-03 | T-05-07 | sector telegraph + rebuild-on-attackId (no lingering cone) | grep gates + human (05-05) | see plan | manual-visual deferred | ⬜ pending |
| 05-05 Task 1 | 05-05 | 3 | ATK-02, ATK-03 | all | full suite + build + migrated-DB deploy checks | full gate | `pnpm test && pnpm build` | ✅ | ⬜ pending |
| 05-05 Task 2 | 05-05 | 3 | ATK-02, ATK-03 | T-05-01 | SC1/SC2/SC3 + planted goliath + rhythm | human playtest (blocking checkpoint) | manual — migrated local DB over LAN | manual-only | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Chain-glue test seam: RESOLVED — extraction chosen. Plan 05-01 Task 3 creates
  `walkAttackTransitions(row, transitions, spec, now, tick, sizeIndex, posX, posZ)` in
  `unitAttackFsm.ts` returning a TransitionPlan (final row + emitStrike / teleportToLanding /
  resolveStrike / strikeSnapshot / chainedInto). The coalesced-tick chain test (this phase's
  highest-value test) becomes a plain vitest unit test in `unitAttackFsm.test.ts`; the plan
  05-03 glue delegates to it instead of duplicating the walk.
- No framework/config gaps — existing vitest infrastructure covers everything else.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Frontal hit / side-back escape (SC1) | ATK-02 | server-authoritative UX gate (pure-helper-testing-discipline) | publish local → `pnpm run spacetime:generate` → `pnpm build` → LAN playtest on MIGRATED DB |
| Chain forces move-OUT (SC2) | ATK-03 | dodge feel over real network | same playtest; stand in swirl radius, verify escape window |
| Telegraphs + clips legible through pixel filter (SC3, ANIM-02) | ATK-02/03 | visual through-filter check | same playtest; cone sector + circle fill readable at max pixelation |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (05-05 Task 2 is the designated manual-only playtest gate per the Manual-Only table)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (chain-glue seam → walkAttackTransitions extraction, 05-01 Task 3)
- [x] No watch-mode flags (all commands use `vitest run`)
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planned 2026-07-10 (5 plans, 3 waves)
