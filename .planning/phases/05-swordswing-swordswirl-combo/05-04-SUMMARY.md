---
phase: 05-swordswing-swordswirl-combo
plan: 04
subsystem: rendering
tags: [client, threejs, telegraph, parity, mirror, tdd]

# Dependency graph
requires:
  - phase: 05-swordswing-swordswirl-combo
    provides: "Plan 05-01 server ATTACKS entries (swordSwing cone coneMinDot 0.5, swordSwirl circle, chainsInto); plan 05-03 published basicCooldownUntilMicros schema + regenerated bindings (rows carry attackId/castX/castZ)"
provides:
  - "src/game/data/attacks.ts client mirror: AttackRenderSpec + ATTACK_RENDER (leapSlam circle, swordSwing cone 60°, swordSwirl circle) — zero imports, parity test-enforced (D5-07)"
  - "serverSync ATTACK_RENDER parity block: key-set equality, per-id shape equality, cos(halfAngle)≈coneMinDot lock, no-angle-on-non-cones (INV-5)"
  - "Cone SECTOR telegraph branch: arc rim + filled sector at the cast apex, yawed to the aim, fill-is-countdown via the existing update() scaling (D5-14)"
  - "Rebuild-on-attackId-change: chain swap on the same telegraph key disposes and re-inserts — the swirl circle appears the tick its windup row arrives (Pitfall 3, ATK-03)"
affects: [05-05]

# Tech tracking
tech-stack:
  added: []
  patterns: ["anchorGroup shape-aware placement: one helper owns circle-at-landing vs cone-at-apex+yaw, shared by insert() and the same-attack re-cast re-anchor", "sector fill-from-apex for free: filled RingGeometry authored at full size + group origin at apex means the existing progress scale.setScalar countdown expands the sector correctly with zero update() changes"]

key-files:
  created:
    - src/game/data/attacks.ts
  modified:
    - src/game/data/__tests__/serverSync.test.ts
    - src/game/systems/createTelegraphSystem.ts

key-decisions:
  - "Same-attack re-cast re-anchor made shape-aware via anchorGroup (Rule 2 deviation): the stock branch repositioned to landing, which would park a re-cast cone at the aim point with stale yaw"
  - "Sector yaw sign atan2(-(aimZ), aimX) applied as DERIVED (RESEARCH A1, MEDIUM confidence) — pixel-filter visual verification owned by plan 05-05; a flip is a one-line sign fix"

patterns-established:
  - "Client render-mirror recipe: doc comment naming the server source of truth + zero-import module + release-blocking serverSync import-and-compare block (goliathArchetypes precedent extended to ATTACKS)"

requirements-completed: []

# Metrics
duration: 5min
completed: 2026-07-10
status: complete
---

# Phase 05 Plan 04: Client Mirror + Cone Sector Telegraph Summary

**Parity-locked ATTACK_RENDER mirror (TDD, four serverSync assertions incl. the cos(60°)→coneMinDot 0.5 lock), cone rows now render an aimed 120° Frost sector filling from the goliath apex, and the chain swap rebuilds the telegraph so the swirl's circle warning appears the instant its windup row lands**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-07-10T16:09:56Z
- **Completed:** 2026-07-10T16:15:30Z
- **Tasks:** 2
- **Files modified:** 3 (1 created)

## Accomplishments
- TDD RED→GREEN: the serverSync parity block landed failing (unresolvable `../attacks` import), then the mirror module made all 155 tests green — key-set equality both directions, per-id shape strict equality, `Math.cos(coneHalfAngleDegrees)` toBeCloseTo `coneMinDot` (locks 60° to 0.5, D5-06, with a vacuous-pass guard asserting at least one cone exists), and non-cone entries carrying NO angle
- `src/game/data/attacks.ts`: exactly three entries (leapSlam circle, swordSwing cone 60°, swordSwirl circle), zero imports — parity is test-enforced, never bundle-coupled to `spacetimedb/` (D5-07); juice magnitudes deliberately absent (handler constants, plan 05-02)
- Rebuild-on-attackId-change (the chain-honesty fix, Pitfall 3): `attackId` tracked on `ActiveTelegraph`; a different attack arriving on the same unit key removes (via the existing `remove()` disposal path — no leak, T-05-05) and re-inserts fresh, so the cone never lingers through the swirl windup
- Cone SECTOR branch in `insert()`: `ATTACK_RENDER[row.attackId]` lookup with unknown-id→circle back-compat; outline = 6-arg arc-rim RingGeometry at the danger edge (range = `row.radius` per D5-06), progress = 6-arg FILLED sector built at full size — the existing `update()` progress scaling expands it from the apex for free because the group origin IS the apex
- Group anchored at the cast apex (`castX/castZ`) and yawed `atan2(-(landingZ−castZ), landingX−castX)` toward the locked aim; circle attacks (leapSlam AND swordSwirl) take the untouched landing-anchored path — the swirl telegraph appears only at its own windup entry because that is when its row arrives (D5-15, no double-telegraph code)
- File stays at 223 functional LOC — under the 300 ceiling, no helper extraction needed

## Task Commits

1. **Task 1 RED: failing ATTACK_RENDER parity block** - `67d7494`
2. **Task 1 GREEN: client ATTACK_RENDER mirror module** - `f65ac53`
3. **Task 2: cone sector telegraph + rebuild-on-attackId-change** - `040e8e0`

## Files Created/Modified
- `src/game/data/attacks.ts` - NEW: AttackRenderSpec interface + ATTACK_RENDER registry, goliathArchetypes-style doc comment naming the server source of truth
- `src/game/data/__tests__/serverSync.test.ts` - new "client ATTACK_RENDER mirror stays in sync with server ATTACKS" describe (4 behaviors)
- `src/game/systems/createTelegraphSystem.ts` - attackId on ActiveTelegraph, rebuild branch in syncAttacks, shape-dispatched insert() with sector construction, shared anchorGroup placement helper

## Verification Evidence
- `pnpm vitest run src/game/data/__tests__/serverSync.test.ts`: RED failed to resolve the mirror import; GREEN and post-Task-2 runs both 155/155 passed
- Grep gates: `ATTACK_RENDER` ×3 in createTelegraphSystem.ts (≥2), `attackId` ×7 (≥3), two 6-arg RingGeometry sector constructions (`-fullAngle / 2, fullAngle`)
- `npx tsc --noEmit` clean on the client tsconfig
- Rebuild branch removes THEN re-inserts on attackId mismatch; the startedAt re-anchor branch survives for same-attack re-casts
- Full `pnpm build` deliberately NOT run — owned by the exclusive Wave-3 gate (plan 05-05)

## Decisions Made
- Same-attack re-cast re-anchor made shape-aware: extracted `anchorGroup(group, row)` used by both `insert()` and the re-anchor branch, so a hypothetical re-cast cone re-locks apex + yaw instead of being parked at the landing with stale rotation
- Sector authored centered on geometry angle 0 with the yaw on the GROUP — keeps mesh construction orientation-free and the aim math in one place

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Shape-aware re-anchor for same-attack re-casts**
- **Found during:** Task 2
- **Issue:** The plan kept the existing startedAtMicros re-anchor branch "for same-attack re-casts only", but that branch inline-positions the group at `landingX/Z` — for a cone re-cast that parks the sector at the aim point (not the apex) with a stale yaw, rendering a wrong danger zone (the exact T-05-07 threat this plan mitigates)
- **Fix:** Extracted the placement into `anchorGroup(group, row)` (circle→landing, cone→apex+yaw) and called it from both `insert()` and the re-anchor branch; circle behavior byte-identical
- **Files modified:** src/game/systems/createTelegraphSystem.ts
- **Commit:** 040e8e0

## Known Stubs
None — the A1 yaw sign is a flagged derived assumption awaiting the 05-05 visual check, not a stub; straight apex edges on the sector are explicitly deferred pending that same check (RESEARCH Open Question 3).

## Threat Flags
None — no new endpoints, inputs, or dependencies; T-05-07 (wrong danger zone) mitigated by the parity block + rebuild fix, T-05-05 (geometry churn) bounded by the existing remove() disposal path per the plan's threat model.

## Issues Encountered
None.

## User Setup Required
None.

## Next Phase Readiness
- Plan 05-05 (exclusive Wave-3 gate) owns: full `pnpm build`, serverSync re-assertion, and the ANIM-02 pixel-filter visual check — **including the A1 sector yaw sign** (if the cone points backwards, flip the sign in `anchorGroup`, one line)
- The client now renders honestly against the 05-03 schema: cone rows → aimed sector at the apex, chain swap → fresh swirl circle at windup entry

## Self-Check: PASSED

- src/game/data/attacks.ts, serverSync.test.ts, createTelegraphSystem.ts all present on disk
- Commits 67d7494, f65ac53, 040e8e0 in git log
- serverSync 155/155 green; grep gates pass; tsc clean; 223 functional LOC < 300
