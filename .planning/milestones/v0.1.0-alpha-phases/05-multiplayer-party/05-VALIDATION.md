---
phase: 05
slug: multiplayer-party
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-07
---

# Phase 05 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | existing (repo already runs `serverSync.test.ts`, `deathPenalty.ts` unit tests) |
| **Quick run command** | `pnpm vitest run spacetimedb/src/partyRules.test.ts` |
| **Full suite command** | `pnpm vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run spacetimedb/src/partyRules.test.ts`
- **After every plan wave:** Run `pnpm vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green + two-client playtest passed
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

*Authoritative per-task `<automated>` verifies live in each PLAN.md; this map summarizes them.*
*Test placement: `src/game/data/__tests__/partyRules.test.ts` (cross-package import, deathPenalty precedent).*

| Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | Status |
|------|------|-------------|------------|-----------------|-----------|-------------------|--------|
| 05-01 | 0 | REQ-multiplayer-party | — | pure rule helpers unit-testable (`nextLeader`, `canAccept`) | unit | `pnpm vitest run src/game/data/__tests__/partyRules.test.ts` | ⬜ pending |
| 05-02 | 1 | REQ-multiplayer-party | T-05-01..04 | reducers enforce authz + one-party + cap + promotion + invalidation | unit (helpers) + manual (reducers) | `pnpm vitest run` + Plan 06 playtest | ⬜ pending |
| 05-03 | 2 | REQ-multiplayer-party | — | additive migrate-publish, no wipe; bindings regenerate | auto | `spacetime publish ... ` + `pnpm spacetime:generate` + tsc/grep | ⬜ pending |
| 05-04 | 3 | REQ-multiplayer-party | T-05-03 | send-side: subscribe + reducer callers + PlayerSheet + HUD chip | build | `pnpm build` | ⬜ pending |
| 05-05 | 4 | REQ-multiplayer-party | T-05-02 | receive-side: toast (10s) + missed-invites (Settings) + roster | build | `pnpm build` | ⬜ pending |
| 05-06 | 5 | REQ-multiplayer-party | T-05-01..04 | full suite + build green; two-client roster/invite playtest | manual | `pnpm vitest run` + `pnpm build` + two-client playtest | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `spacetimedb/src/partyRules.test.ts` — unit stubs for `nextLeader()` (oldest-joined promotion) and accept-eligibility (one-party-per-player, RAID_PARTY_SIZE cap, no double-join)
- [ ] `spacetimedb/src/partyRules.ts` — pure helpers extracted so reducers stay thin and logic is vitest-testable (mirrors `deathPenalty.ts`)

*Reducer wiring itself is not unit-testable (STDB reducers can't run in vitest) — validated via mandatory two-client playtest.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Two clients in a party both see roster with active character + role | REQ-multiplayer-party | STDB reducers + live subscription can't run in vitest | Two browser clients: player A invites B via player sheet, B accepts, both see 2-member roster with role badge + leader crown + online dot |
| Invite toast slides in ~10s, missed invites recoverable | REQ-multiplayer-party | Client-side timing + UX | Send invite; recipient sees toast, ignores 10s; invite appears in missed-invites list under menu/settings |
| Leader leaves → oldest-joined promoted; last leave → disband | REQ-multiplayer-party | Requires live multi-client membership state | 3-member party; leader leaves → next-oldest becomes leader (crown moves); all leave → party row + pending invites gone |
| Disconnect persists membership (D-04) | REQ-multiplayer-party | Requires real socket drop | Member closes tab; roster shows them offline (dot), still a member on reconnect |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-07
