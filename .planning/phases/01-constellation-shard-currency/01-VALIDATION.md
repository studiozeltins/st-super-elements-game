---
phase: 1
slug: constellation-shard-currency
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-06
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | vite/vitest config in repo (tests run via `vitest run`) |
| **Quick run command** | `pnpm vitest run src/game/data/__tests__/gachaOverflow.test.ts` |
| **Full suite command** | `pnpm test` (`vitest run`) |
| **Estimated runtime** | ~a few seconds (unit); full suite ~tens of seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run src/game/data/__tests__/gachaOverflow.test.ts`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** Full suite green + `pnpm build` green + local playtest
- **Max feedback latency:** < 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-xx | 01 | 0 | REQ-shard-currency-mint | — | pure helper, no client-supplied shard amount | unit | `pnpm vitest run src/game/data/__tests__/gachaOverflow.test.ts` | ❌ W0 | ⬜ pending |
| 1-01-xx | 01 | 1 | REQ-shard-currency-mint | T-1-01 (Tampering) | shard mint derives only from server constants + owned constellation | unit | `pnpm vitest run src/game/data/__tests__/gachaOverflow.test.ts` | ❌ W0 | ⬜ pending |
| 1-01-xx | 01 | 1 | REQ-shard-currency-mint | — | constants still mirror server (no regression from const deletion) | unit | `pnpm vitest run src/game/data/__tests__/serverSync.test.ts` | ✅ | ⬜ pending |
| 1-01-xx | 01 | 1 | REQ-shard-currency-mint | — | existing gacha/pity behavior unbroken | regression | `pnpm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `spacetimedb/src/gachaOverflow.ts` — pure `resolveDupeGrant` (implementation under test)
- [ ] `src/game/data/__tests__/gachaOverflow.test.ts` — covers both branches of REQ-shard-currency-mint (C6-dupe → shard mint; sub-C6 dupe → constellation++)
- [ ] No framework install needed — Vitest already present.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Client renders shard balance in Character + Gacha screens | REQ-shard-currency-mint | Visual render, no headless assertion | Local playtest: open both screens, confirm shard chip visible |
| Dupe of already-C6 char raises shard count, gems unchanged, no 800-gem refund | REQ-shard-currency-mint | Requires live DB + gacha pull | Publish local, regenerate, build; pull dupe of a C6 char; observe shard +1, gems flat |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
