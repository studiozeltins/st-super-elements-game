---
phase: 2
slug: transcendence-install
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-06
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vite.config.ts / vitest (existing — Wave 0 adds specs only) |
| **Quick run command** | `pnpm exec vitest run <file>` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~5–15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm exec vitest run <changed spec>`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green + `pnpm build` green
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| _(planner + nyquist fill)_ | | | REQ-transcend-install | | | unit | `pnpm test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/game/combat/__tests__/transcendScaling.test.ts` — pure `transcendDamageMultiplier(constellation, transcend)` boundary cases (T0, T1, cap T10; C5/C6)
- [ ] `spacetimedb/src/__tests__/transcendInstall.test.ts` (or co-located) — pure `resolveTranscendInstall` 4 branches: ok / char<C6 reject / at-cap reject / short-shards reject
- [ ] Extend `src/game/data/__tests__/serverSync.test.ts` — already guards constant mirrors; confirm green after wiring
- [ ] Framework: none needed — vitest already installed

*Cross-boundary import path for `spacetimedb/src/*.ts` pure modules must mirror the existing `gachaOverflow.ts` test setup (per RESEARCH.md).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| In-play damage numbers rise after install | REQ-transcend-install (SC3) | Requires live game loop + SpacetimeDB; damage is client-authoritative | Publish local, earn/grant shards, install a level on a C6 char, confirm hit numbers rise and shard balance drops by cost curve (level n costs n) |
| Healer heal amount rises with transcendLevel | REQ-transcend-install (SC3) | Server reducer `healParty` needs live party state | Playtest with a healer character transcended; confirm heal output increases |
| Install button gating (C6 / cap / balance) | REQ-transcend-install (SC4) | Visual UI state in `CharacterScreen.tsx` | Confirm button disabled at <C6, at T10 cap, and when shards < cost |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags (`vitest run`, not `vitest`)
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
