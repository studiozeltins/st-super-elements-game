---
phase: 4
slug: attack-state-machine-leapslam-end-to-end-delete-goliath-drai
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-09
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest via package.json scripts |
| **Quick run command** | `pnpm test -- --run` |
| **Full suite command** | `pnpm test -- --run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test -- --run`
- **After every plan wave:** Run `pnpm test -- --run` + `pnpm build`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (filled by planner) | | | FSM-01..06, ATK-01/05/06, ANIM-01..04, HIT-01 | — | server-authoritative damage/stun only | unit | `pnpm test -- --run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `spacetimedb/src/__tests__/attacks.test.ts` — ATTACKS registry shape/duration invariants (windup ≥ 2 ticks, exact tick multiples)
- [ ] `spacetimedb/src/__tests__/unitAttackFsm.test.ts` — FSM transition pure helpers (windup → strike → recovery, passed-deadline "jumped two intervals" resolution)
- [ ] `spacetimedb/src/__tests__/attackHitbox.test.ts` — strike-frame hit resolution vs live positions (in/out of circle, dodge-grace)
- [ ] `src/**/serverSync.test.ts` extension — assert `ATTACKS` duration/shape parity client vs server

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Telegraph legibility through pixel filter | ANIM-01/02 | visual taste | Stand near goliath, watch windup circle fill in icy-cyan #86e2ff |
| Dodge fairness on maincloud RTT | SC5 | needs real two-client remote engage on migrated DB | Two clients vs goliath on maincloud; leave telegraph before land → no damage |
| Knockback/stun feel | HIT-01 | server-authoritative feel check | Get hit by landed strike; observe knockback + brief input freeze |
| Camera shake / SFX taste | ANIM-04 | subjective | Strike lands → single VFX/SFX fire |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
