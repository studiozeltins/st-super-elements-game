---
phase: 05
slug: swordswing-swordswirl-combo
status: draft
nyquist_compliant: false
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
| (filled by planner) | — | — | ATK-02 | — | cone resolved server-side vs live positions | unit (pure) | `pnpm vitest run src/game/data/__tests__/attackHitbox.test.ts` | ✅ extend | ⬜ pending |
| (filled by planner) | — | — | ATK-02 | — | selection cannot be client-influenced | unit (pure) | `pnpm vitest run src/game/data/__tests__/attacks.test.ts` | ✅ extend | ⬜ pending |
| (filled by planner) | — | — | ATK-03 | — | chain data terminates; swirl not selectable; no-one-shot invariant (680 raw < 900 min HP) | unit (parity) | `pnpm vitest run src/game/data/__tests__/serverSync.test.ts` | ✅ extend | ⬜ pending |
| (filled by planner) | — | — | ATK-03 | — | coalesced tick across chain: swing strike resolved, ends WINDUP-swirl, no cooldown written | unit (pure + glue) | `pnpm vitest run src/game/data/__tests__/unitAttackFsm.test.ts` | ✅ pure exists; ❌ glue seam = Wave 0 decision | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Chain-glue test seam: extract a pure transition-applier helper (recommended — e.g.
  `nextAfterStrike(spec) → 'chain' | 'recovery'` or a pure applier taking the transitions
  list + spec, returning the row mutation plan) tested in `unitAttackFsm.test.ts`.
  Pure-helper-testing-discipline memory strongly favors extraction; the coalesced-tick chain
  test is this phase's highest-value test.
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

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
