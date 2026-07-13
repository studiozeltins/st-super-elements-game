---
phase: 03-pvp-crit
fixed_at: 2026-07-09T10:30:30Z
review_path: .planning/phases/03-pvp-crit/03-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 3: Code Review Fix Report

**Fixed at:** 2026-07-09T10:30:30Z
**Source review:** .planning/phases/03-pvp-crit/03-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 2 (fix_scope: critical_warning — IN-01 excluded)
- Fixed: 2
- Skipped: 0

## Fixed Issues

### WR-01: Sibling event tables still double-subscribed

**Files modified:** `src/App.tsx`
**Commit:** c8c2f35
**Applied fix:** Removed `tables.skillCast`, `tables.rangedAttack`, `tables.healEvent` — and also `tables.pullResult` — from the manual `.subscribe([...])` list; their `useTable` hooks are now the sole subscription, mirroring the phase's own `pvp_hit`/`enemy_hit` invariant (documented in a replacement comment at the removal site). The review's conditional instruction on `pullResult` was verified and executed: `pull_result` is `event: true` in `spacetimedb/src/index.ts:526` and its buffer is reset in `pullBanner` before every request, so the double subscription was the slot-dedup's only duplicate source — the dedup workaround (`pullBufferRef.current.some(view => view.slot === row.slot)`) was retired with it (no dead code per CLAUDE.md). Fixes doubled green heal numbers, doubled remote skill VFX, and doubled remote projectiles.

### WR-02: `lastPvpHitAt` conflates health-bar display with the client hit-rate gate

**Files modified:** `src/game/createGame.ts`
**Commit:** b467595
**Applied fix:** Split `RemotePlayerView.lastPvpHitAt` into two fields exactly as the review prescribed:
- `lastPvpSentAt` — local send-rate gate; checked by the 0.3s cooldown in `applyPvpDamage` and written ONLY when this client sends its own `attackPlayer`.
- `lastPvpHitShownAt` — health-bar flash display; written by `applyPvpDamage` and by `flashRemoteHealth` (which fires for every broadcast `pvp_hit`), and read by the 5s `showBar` check in `updateRemotePlayerViews`.

`flashRemoteHealth` no longer touches the rate gate, so rival attackers' hit streams and this client's own event echo can no longer re-arm the 0.3s lockout on a shared victim. Grep confirms no stale `lastPvpHitAt` references remain.

**Status note:** fixed — requires human verification. The gate change is state-handling logic; syntax/build/tests confirm structure, but the multi-attacker behavior (your swings landing on a victim a rival is also hitting) needs the two-client playtest this project already gates server-authoritative UX on. Same UAT session can visually confirm WR-01 (single heal number / single remote projectile per event).

## Verification

- `pnpm build` — green (vite build succeeded).
- `pnpm test` — green, 475/475 tests pass (29 files).
- Grep — no remaining `lastPvpHitAt` references; no event table appears in both the manual subscription list and a `useTable` hook.

---

_Fixed: 2026-07-09T10:30:30Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
