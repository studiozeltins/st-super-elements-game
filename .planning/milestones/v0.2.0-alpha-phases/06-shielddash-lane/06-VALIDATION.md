---
phase: 06
slug: shielddash-lane
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-11
---

# Phase 06 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.2.4 |
| **Config file** | vite defaults (no dedicated vitest config — existing suite runs today) |
| **Quick run command** | `pnpm vitest run src/game/data/__tests__/<file>.test.ts` |
| **Full suite command** | `pnpm test` (= `vitest run`) |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run the touched file's vitest target (`pnpm vitest run src/game/data/__tests__/attackHitbox.test.ts` etc.)
- **After every plan wave:** Run `pnpm test` + `pnpm build`
- **Before `/gsd-verify-work`:** Full suite green + build green + grep-gate + migrated-DB playtest
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01 T1 | 06-01 | 1 | ATK-04 | T-06-01 | resolveLane inside/edge/outside; zero-length degrades to circle | unit | `pnpm vitest run src/game/data/__tests__/attackHitbox.test.ts` | ✅ (add describes) | ⬜ pending |
| 06-01 T1 | 06-01 | 1 | ATK-04 | T-06-01 | closestPointOnSegment interior/endpoint/degenerate; computeLaneEnd overshoot + zero-length fallback | unit | same file | ✅ (add) | ⬜ pending |
| 06-01 T3 | 06-01 | 1 | ATK-04 | T-06-01 | charge STRIKE relocates (flag + effectiveX/Z); `move:'none'` stays planted; coalesced [STRIKE,RECOVERY,IDLE] relocates+resolves+cooldowns once | unit | `pnpm vitest run src/game/data/__tests__/unitAttackFsm.test.ts` | ✅ (add) | ⬜ pending |
| 06-01 T2 | 06-01 | 1 | ATK-04 | T-06-01 | shieldDash registry numbers; dash selectable at 6.5u / slam wins overlap / shared gate blocks both (Pitfall-1 guards) | unit | `pnpm vitest run src/game/data/__tests__/attacks.test.ts` | ✅ (add) | ⬜ pending |
| 06-01 T2 | 06-01 | 1 | ATK-04 / SC3 | T-06-01 | ATTACKS↔ATTACK_RENDER parity incl. new entry, damage triple, lane data ≤ 8, `move:'charge'` | unit | `pnpm vitest run src/game/data/__tests__/serverSync.test.ts` | ✅ (extend) | ⬜ pending |
| 06-03 T2 / 06-05 T1 | 06-03, 06-05 | 2, 3 | Determinism | T-06-02 | no module randomness / wall-clock reads in `spacetimedb/src` | automated | `grep -rnE "Math\.random\|Date\.now" spacetimedb/src/` → empty | ✅ | ⬜ pending |
| 06-03 T2 | 06-03 | 2 | ATK-04 / FSM-06 | T-06-06 | republished module clean on POPULATED local DB (sql exits 0, logs error-free) | automated | `spacetime sql 2d-impact-game-fr9ti "SELECT attack_id, state FROM unit_attack" --server local` + logs grep | ✅ | ⬜ pending |
| 06-05 T1 | 06-05 | 3 | ATK-04 / SC3 | — | exclusive full gate: `pnpm test` + `pnpm build` green on merged tree | automated | `pnpm test && pnpm build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements — every new test lands as added cases in existing files. No Wave 0 needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Lane telegraph renders + fills through pixel filter; goliath visibly charges (no snap, all sizes); step-out dodges; in-lane bystander hit | ATK-04 SC1/SC2 | Pixel-filter legibility + two-client feel cannot be asserted headlessly (04/05 precedent) | Migrated-DB human playtest: engage at 5.5–8u, verify telegraph, sidestep dodge, bystander hit |
| `unit_attack` rows appear with `shieldDash` on the POPULATED local DB after a real 5.5–8u engage | FSM-06 | Migrated-DB state can't be seeded in unit tests | Deploy capstone: `spacetime sql 2d-impact-game-fr9ti "SELECT attack_id, state FROM unit_attack"` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (N/A — none)
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
