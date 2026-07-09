---
phase: 4
slug: attack-state-machine-leapslam-end-to-end-delete-goliath-drai
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-09
updated: 2026-07-09
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (`vitest.config.ts` at repo root) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm vitest run src/game/data/__tests__/<file>.test.ts` |
| **Full suite command** | `pnpm test` (= `vitest run`) |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run the task's `<automated>` command (per-task map below)
- **After every plan wave:** Run `pnpm test` + `pnpm build`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01 T1 | 04-01 | 1 | FSM-03, FSM-04, ATK-05 (sweep), INV-5 | T-04-01 | locked D4 numbers pinned by serverSync INV-5 | unit (TDD) | `pnpm vitest run src/game/data/__tests__/attacks.test.ts src/game/data/__tests__/serverSync.test.ts` | ❌ W0 (test-first in-task) | ⬜ pending |
| 04-01 T2 | 04-01 | 1 | FSM-05, ATK-01 | T-04-02 | injected-clock determinism, no ctx/table refs | unit (TDD) | `pnpm vitest run src/game/data/__tests__/unitAttackFsm.test.ts` | ❌ W0 (test-first in-task) | ⬜ pending |
| 04-01 T3 | 04-01 | 1 | ATK-06 (circle share), HIT-01 math | T-04-02 | geometry reuse (distanceBetween), no new distance code | unit (TDD) | `pnpm vitest run src/game/data/__tests__/attackHitbox.test.ts && pnpm test` | ❌ W0 (test-first in-task) | ⬜ pending |
| 04-02 T1 | 04-02 | 2 | FSM-01, FSM-06, HIT-01 | — | server-authoritative stun: updatePosition rejects while stunned | typecheck + suite | `pnpm exec tsc --noEmit -p spacetimedb && pnpm test` | ✅ suite exists | ⬜ pending |
| 04-02 T2 | 04-02 | 2 | FSM-02, ATK-01, HIT-01 | — | all damage/knockback/stun written server-side only | typecheck + suite | `pnpm exec tsc --noEmit -p spacetimedb && pnpm test` | ✅ suite exists | ⬜ pending |
| 04-03 T1 | 04-03 | 3 | ATK-05 | — | contact-drain deletion grep-gated to zero | typecheck + suite + grep gate | `pnpm exec tsc --noEmit -p spacetimedb && pnpm test && bash -c '[ "$(grep -c GOLIATH_PLAYER_CONTACT_RANGE spacetimedb/src/index.ts)" -eq 0 ]'` | ✅ suite exists | ⬜ pending |
| 04-03 T2 | 04-03 | 3 | FSM-01, FSM-06 | — | additive publish only (no wipe on populated DB) | build + SQL probe | `pnpm build && pnpm test && spacetime sql 2d-impact-game-fr9ti "SELECT * FROM unit_attack" --server local` | ✅ suite exists | ⬜ pending |
| 04-04 T1 | 04-04 | 4 | ANIM-01, ANIM-02 | — | render-only, timing derived from server row | typecheck + build | `pnpm exec tsc -b && pnpm build` | ✅ build exists | ⬜ pending |
| 04-04 T2 | 04-04 | 4 | ANIM-01 | — | ONE cached-table subscription (no event-table pattern) | build + suite | `pnpm build && pnpm test` | ✅ suite exists | ⬜ pending |
| 04-05 T1 | 04-05 | 5 | ANIM-03 | — | render-only optional hook, zero schema change | build + suite | `pnpm build && pnpm test` | ✅ suite exists | ⬜ pending |
| 04-05 T2 | 04-05 | 5 | ANIM-03 | — | animation derived from server micros, no local timer | build + suite | `pnpm build && pnpm test` | ✅ suite exists | ⬜ pending |
| 04-06 T1 | 04-06 | 6 | ANIM-04 | — | zero-dep WebAudio, gesture-resumed context | build + suite | `pnpm build && pnpm test` | ✅ suite exists | ⬜ pending |
| 04-06 T2 | 04-06 | 6 | ANIM-04 | — | onInsert-only event consumption, single-subscription grep gate | build + suite + grep gate | `pnpm build && pnpm test && bash -c '[ "$(grep -c "tables.attackStrike" src/App.tsx)" -eq 1 ]'` | ✅ suite exists | ⬜ pending |
| 04-06 T3 | 04-06 | 6 | HIT-01 | — | client only reconciles to server row (server rejects stunned writes) | build + suite | `pnpm build && pnpm test` | ✅ suite exists | ⬜ pending |
| 04-07 T1 | 04-07 | 7 | FSM-02, HIT-01 (SC1–SC4) | — | migrated-DB probe, server rows drive everything | human checkpoint + SQL probe | `spacetime sql 2d-impact-game-fr9ti "SELECT * FROM unit_attack" --server local` | ✅ CLI exists | ⬜ pending |
| 04-07 T2 | 04-07 | 7 | FSM-06 (SC5 setup) | — | backup BEFORE publish; additive maincloud migrate | SQL probe | `spacetime sql 2d-impact-game-fr9ti "SELECT * FROM unit_attack" --server maincloud` | ✅ CLI exists | ⬜ pending |
| 04-07 T3 | 04-07 | 7 | FSM-02, ANIM-02 (SC5) | — | dodge fairness over real RTT, server-resolved | human checkpoint + SQL probe | `spacetime sql 2d-impact-game-fr9ti "SELECT * FROM unit_attack" --server maincloud` | ✅ CLI exists | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Wave 0 IS Plan 04-01: all three tasks are `tdd="true"` — the failing tests are written first
inside each task, then the pure module is created to turn them green. No separate scaffold plan
is needed.

- [ ] `src/game/data/__tests__/attacks.test.ts` — ATTACKS registry shape/duration invariants (windup ≥ 2 ticks, exact tick multiples), selectAttack dead-zone sweep + cooldown gating (04-01 T1)
- [ ] `src/game/data/__tests__/unitAttackFsm.test.ts` — FSM transition pure helpers (windup → strike → recovery, passed-deadline "jumped two intervals" resolution, all deadlines written at windup entry) (04-01 T2)
- [ ] `src/game/data/__tests__/attackHitbox.test.ts` — circle hit resolution incl. edge-of-circle inclusive boundary + zero-vector knockback fallback (04-01 T3)
- [ ] `src/game/data/__tests__/serverSync.test.ts` extension — "ATTACKS registry invariants (INV-5)" describe block: duration/shape parity + 405/585/765 arithmetic (04-01 T1)

> Note: the pure modules live in `spacetimedb/src/` but their tests live in
> `src/game/data/__tests__/` — the client vitest runner tests server pure helpers across the
> package boundary (crit.test.ts precedent).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Telegraph legibility through pixel filter | ANIM-01/02 | visual taste | Stand near goliath, watch windup circle fill in icy-cyan #86e2ff (04-07 T1/T3) |
| Dodge fairness on maincloud RTT | SC5 | needs real two-client remote engage on migrated DB | Two clients vs goliath on maincloud; leave telegraph before land → no damage (04-07 T3) |
| Knockback/stun feel | HIT-01 | server-authoritative feel check | Get hit by landed strike; observe knockback + brief input freeze (04-07 T1) |
| Camera shake / SFX taste | ANIM-04 | subjective (D4-15 "taste pass") | Strike lands → single VFX/SFX fire, shake tuned at checkpoint (04-07 T1) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (test-first inside 04-01's TDD tasks)
- [x] No watch-mode flags (all commands use `vitest run` / `pnpm test` = `vitest run`)
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planner (revision pass, 2026-07-09)
