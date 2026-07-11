# Phase 6: shieldDash lane - Research

**Researched:** 2026-07-11
**Domain:** Server-authoritative attack FSM extension (SpacetimeDB TS module) + Three.js render-only client (telegraph/clip/juice)
**Confidence:** HIGH (every claim below verified by direct read of the live codebase at commit `a1b6f1e`; zero external dependencies; no web research required)

## Summary

Phase 6 adds `shieldDash` (ATK-04) — the lane/capsule gap-closer — onto the proven Phase-4/5 spine with **zero schema change**. The `unit_attack` row already encodes the whole shape: `castX/Z` = lane start, `landingX/Z` = lane end (computed with overshoot at selection), `radius` = lane half-width. Server work is one `ATTACKS` entry + a ~15-line `resolveLane`/`closestPointOnSegment` pair in `attackHitbox.ts` + a one-token generalization of the leap gate in `walkAttackTransitions` + a lane arm in the glue's `resolveStrike` and a lane-end computation at the IDLE selection site. Client work is render-only: a lane rectangle branch in `createTelegraphSystem`, an `animateDash` clip riding the existing `travelFraction` seam, a lane juice tier, and the `ATTACK_RENDER` mirror + serverSync parity extension.

**One critical contradiction was found in the locked decisions and MUST be resolved by the plan or shieldDash never fires:** D6-06 (shared `cooldownUntilMicros`) + D6-07 (dash listed AFTER leapSlam, band 3.5–8.0) + leapSlam's existing band (0–8) + `selectAttack`'s first-match-wins semantics make `shieldDash` **unreachable dead code** — whenever dash's cooldown gate is open, slam's identical gate is open too, slam is in band everywhere dash is, and slam is listed first. See Pitfall 1 for the verified line-level proof and the recommended data-only fix (shrink leapSlam's `maxBand` seed to 5.5, creating a dash-only 5.5–8 zone — seed-tuning latitude explicitly granted by D6-03/D-02).

**Primary recommendation:** Follow the exact Phase-5 slice shape (pure helpers test-first → registry entry + glue → mirror/telegraph/clip/parity → deploy + playtest capstone), resolve the selection-shadow contradiction as a data-only band edit with a regression test ("dash is selectable at d=6 with cooldowns clear"), and keep the renderer reading lane half-width from `row.radius` (per-size correct) rather than a scalar mirror field.

## User Constraints (from CONTEXT.md)

<user_constraints>

### Locked Decisions (D6-01..D6-14 — verbatim from 06-CONTEXT.md)

> Cross-cutting constraints (server-authoritative, additive schema, INV-5 `ATTACKS` parity, test-first pure helpers, ≤300 LOC/file, tick-multiple windups ≥2 ticks, resolve-never-drop, migrated-DB verification, zero new deps, icy-cyan `#86e2ff`) are LOCKED in ROADMAP.md/REQUIREMENTS.md. Phase-4/5 decisions carry verbatim: D4-02 grace, D4-03 bystanders, D4-09 per-attack reaction DATA, D4-11 no knockback safety rails, D4-12 rooted windup, D4-14 telegraph language, D5-08 per-role cooldown split, monotonic-stun guard (WR-01).

- **D6-01 — charge = relocate-at-strike, resolve-once:** `move:'charge'` reuses the PROVEN leap seam — at the STRIKE transition the goliath's position is set to the lane END (`landingX/Z`), layered on the `goliathPosition` map before the single apply; damage resolves ONCE at strike+grace vs LIVE positions along the whole segment (D4-02 verbatim). No multi-tick server travel, no per-tick collision, zero new FSM states. The client renders the travel (D6-12). Rejected: per-tick travelling collision and a multi-tick active window.
- **D6-02 — lane end = fixed length with OVERSHOOT, aim locked at windup entry:** aim = normalize(target − cast) sampled ONCE at cast (D5-05 pattern); the GLUE computes `laneEnd = cast + aim × laneLength[size]` (clamped to world) and passes it to `enterWindup` as the target — so `landingX/Z` stores the lane end and `enterWindup` stays UNCHANGED. Rejected: stop-at-target and new geometry columns.
- **D6-03 — lane dimensions (SNAP_DISTANCE ceiling):** `laneLength` per size = **6.5 / 7.25 / 8.0** — hard ceiling 8u because `SNAP_DISTANCE = 8` (`createEntityRenderer.ts:96`). `radiusBySize` is reused as lane HALF-WIDTH: seed **1.6 / 1.8 / 2.0**. Seeds; user tunes in playtest (D-02 pattern).
- **D6-04 — `resolveLane` = segment-distance test, ALL victims:** point-to-segment distance via the standard clamp-to-[0,1] projection (the `bridges.ts:78-96` math pattern — ATK-06 geometry reuse honored) ≤ half-width, INCLUSIVE edges. Every live player in the lane is resolved (D4-03; SC3). Rejected `pickRayHit` (nearest-only). Zero-length segment degrades to the circle test.
- **D6-05 — knockback = perpendicular bulldoze:** knockback center per victim = the CLOSEST POINT on the lane centerline → victims shove sideways OUT of the path. A victim exactly on the centerline falls back to the supplied heading (existing `knockbackDisplacement` fallback branch). Rejected push-along-charge.
- **D6-06 — role 'skill', SHARED skill cooldown (no new column):** `shieldDash` writes the existing `cooldownUntilMicros` at IDLE — slam and dash gate each other, enforcing kit variety (slam → swing chain → dash → chain → slam…). Rejected per-attack cooldown columns.
- **D6-07 — band 3.5..8.0, listed AFTER leapSlam — the after-whiff preference EMERGES:** `UNIT_ATTACKS[goliath].default = ['leapSlam', 'swordSwing', 'shieldDash']`. minBand 3.5, maxBand 8.0. NO special weighting code; verify the emergence in playtest. *(See Pitfall 1 — as literally stated this makes dash unreachable; a seed-level band edit is required.)*
- **D6-08 — timing seeds (exact tick multiples):** windup **6 ticks (0.9s)**, active 1, grace 1 (D4-02), recovery **8 ticks (1.2s)**. Cooldown seed **6.0s**.
- **D6-09 — damage seed 2.5× contactDamage** (→ 225/325/425 per size) — same shared `playerDamage` map → 'contact' resistance channel. No new one-shot path.
- **D6-10 — reaction = D4-10 recorded intent verbatim (knockback + stun):** seeds knockback **3.5** (perpendicular, D6-05) + stunTicks **3 (0.45s)**. Monotonic-stun guard (WR-01) already covers concurrent attackers. Seeds; user tunes.
- **D6-11 — lane telegraph = rectangle variant of the D4-14 language:** instant full-lane outline + fill sweeping from the cast end toward the lane end over the windup + rim flash at strike — `#86e2ff`, additive blending, depth-test off, timing re-derived from the server row (ANIM-01). Oriented by the cast→landing yaw — reuse the cone `anchorGroup` yaw seam INCLUDING the 05-04 shape-aware re-anchor rule. Length derives from the row (|landing − cast|); only the half-width needs the client mirror (D6-13). *(See Pitfall 6 — the row already carries the half-width in `radius`.)*
- **D6-12 — charge clip rides travelFraction:** windup = shield-raised braced crouch leaning into the aim (rooted, D4-12); strike→arrival = rapid GROUNDED lunge riding the actual mesh travel toward the locked landing (04-05 leap-arc precedent minus the parabola); recovery = heavy skid/settle. Neutral-restore via the shared `resetAttackPose` contract (05-02) carries.
- **D6-13 — client mirror gains `shape:'lane'` + `laneHalfWidth`:** `ATTACK_RENDER.shieldDash` carries the rectangle's half-width (parity-locked to server `radiusBySize` the way `coneHalfAngleDegrees` locks to `coneMinDot`) + `stunSeconds: 0.45`. `juiceColor` = Claude's discretion (shield reads physical/cryo — icy-white; telegraphs stay Frost cyan regardless). *(See Pitfall 6 — half-width is per-size; a scalar mirror field cannot parity-lock to three values.)*
- **D6-14 — bounds policy: clamp the goliath, not the victims:** the computed lane end is clamped via the existing `clampToWorld` at the glue; victim knockback keeps D4-11 verbatim. Safe-zone victims are skipped by the existing `resolveStrike` guard; a mid-windup goliath death drops the lane telegraph via the existing dead-row hygiene + alive-map re-gate (04-04).

### Claude's Discretion

- Exact `resolveLane` signature + where the segment-projection helper lives (inline in `attackHitbox.ts` vs importing from `bridges.ts` — prefer a pure local implementation over coupling combat to the bridges module; both are ~10 lines).
- Whether `teleportToLanding` generalizes (`move !== 'none'`) or a sibling `chargeToLanding` flag is added to `TransitionPlan` — pick whichever keeps `walkAttackTransitions` tests cleanest; either way the swing's `move:'none'` stays planted (Pitfall-1 gate holds).
- Lane rectangle mesh construction (PlaneGeometry strips vs shaped ring reuse) + the fill-sweep technique so the rectangle reads through the pixel filter at max pixelation (ANIM-02).
- Strike-juice composition (shield clang WebAudio + dust wake along the lane; smaller than the slam's full juice) keyed by `attack_strike.attackId`.
- serverSync `ATTACKS` parity extension fields (at minimum: windup/active/grace/recovery ticks, cooldown, laneLength, half-width seeds, band, multiplier, knockback, stunTicks, `move:'charge'`) + the ATTACK_RENDER half-width parity assertion.
- Whether `attack_strike.radius` carries the half-width for the lane (it should) — decide if the wake effect needs the cast point and derive from the unit_attack row if so.
- Inert band values / unused-field authoring on `shieldDash` for parity sanity.

### Deferred Ideas (OUT OF SCOPE)

- Reposition/strafe AI between attacks — revisit ONLY if the goliath still feels static in the Phase-6 playtest.
- Camp-enemy conversion to the FSM (XCMB-01) — v2.
- 3-hit+ chains / per-archetype attack lists (XCMB-03) — v2.
- Miss/evasion system — pending USER decision; Phase 6 must NOT introduce miss RNG.
- Poise accrual/interrupt (Phase 7), hero FSM (XCMB-04), multi-tick per-tick-collision charge (rejected, D6-01).

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ATK-04 | `shieldDash` — a lane/capsule moving hitbox gap-closer (`move:'charge'` body commit) resolved along the charge path | Complete seam map below: `resolveLane` mirrors `bridges.ts:80-97` `distanceToSegment` (verified exported, clamp-to-[0,1]); `move:'charge'` rides the `teleportToLanding` gate at `unitAttackFsm.ts:158-162`; row fields carry the full segment (verified `enterWindup` needs zero changes); all-victims loop already exists at `unitAttacks.ts:83-121`; parity harness auto-covers the new entry (`serverSync.test.ts:352-485`). Also carries the tail of ATK-06 (lane resolver = geometry reuse, no dead stubs — verified `attackHitbox.ts` header comment reserves the slot). |

</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Reducers deterministic** — no `Math.random`/`Date.now` in `spacetimedb/src` (grep-gate verified GREEN at research time: zero matches). Client render randomness is exempt (`createGame.ts:906-908` documents this).
- **≤300 LOC functional code per file; no monoliths.** `createTelegraphSystem.ts` is at 288 raw lines and `createGoliathRenderer.ts` at 280 — both grow this phase; see Pitfall 8 for the carve-out recommendation. Never grow `spacetimedb/src/index.ts` (only the existing `runUnitAttacks` call at line 3239 is touched — i.e., not at all).
- **No legacy/dead code** — no stubs, no unused mirror fields (bears directly on the D6-13 laneHalfWidth question, Pitfall 6).
- **pnpm only** (`pnpm add` — npm i crashes on the symlink layout). Zero new deps this phase anyway.
- **Server module path is `./spacetimedb`** — ignore the wrong-path `spacetime:publish` npm scripts. Publish: `spacetime publish 2d-impact-game-fr9ti --module-path spacetimedb --server local --yes`.
- **Self-hosted SpacetimeDB — NO maincloud publish** (self-host pivot 04-07; maincloud DB dropped 2026-07-09).
- **Never `--delete-data` on a DB with accounts**; verify the republished module against the POPULATED local DB, not a fresh seed.
- **Identity perf rules** — no new per-row-per-render `toHexString()` loops (this phase adds none; the juice handler's existing row lookup pattern is event-scoped, not per-frame).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Lane hit geometry (`resolveLane`, `closestPointOnSegment`) | Server pure sibling (`attackHitbox.ts`) | — | Combat truth is server-authoritative; pure = vitest-able cross-boundary |
| `shieldDash` registry data (timing/bands/damage/reaction/laneLength) | Server pure data (`attacks.ts`) | Client mirror (`src/game/data/attacks.ts`) via parity test | FSM-04 registry-as-data; INV-5 forbids silent drift |
| Lane-end computation (aim lock + overshoot + clamp) | Server pure helper (new fn, `attackHitbox.ts` or `unitAttackFsm.ts`) | Server glue calls it (`unitAttacks.ts` IDLE site) | Glue header contract: ZERO decision arithmetic in glue |
| `move:'charge'` relocate-at-strike | Server pure applier (`walkAttackTransitions`) sets flag; glue layers `goliathPosition` override | — | Exact seam `teleportToLanding` already proves (leap) |
| Strike resolution (all victims, per-victim knockback center, monotonic stun) | Server glue (`unitAttacks.ts` `resolveStrike`) | — | Existing loop; lane adds a third shape arm |
| Lane telegraph rectangle (outline + fill sweep + flash) | Client (`createTelegraphSystem.ts`) | — | Render-only; timing re-derived from server row (ANIM-01) |
| Charge animation clip (brace → grounded lunge → skid) | Client (`createGoliathRenderer.ts`) | — | Rides existing mesh lerp + `travelFraction` seam |
| Strike juice (clang SFX + dust wake) | Client (`createGame.ts` handler + `createAudioSystem.ts` + `createEffectSystem.ts`) | — | ANIM-04 event-driven, `onInsert` once |
| Parity enforcement | Test tier (`serverSync.test.ts`, `attacks.test.ts`, `attackHitbox.test.ts`, `unitAttackFsm.test.ts`) | — | Release-blocking INV-5 |
| Deploy | Ops (local `spacetime publish` → `pnpm run spacetime:generate` → `pnpm build`) | — | Zero schema change = simplest deploy of the milestone; local only |

## Standard Stack

### Core (all existing — zero new deps, verified)

| Library/Tool | Version | Purpose | Status |
|---------|---------|---------|--------------|
| spacetimedb (server SDK + client SDK) | in-repo (`module_bindings` current) | tables/reducers/subscriptions | `[VERIFIED: codebase]` — no regeneration strictly needed (zero schema change) but regenerate anyway per deploy checklist |
| three | bundled | telegraph meshes, clip math (`THREE.MathUtils` only interpolation helper allowed) | `[VERIFIED: codebase]` |
| vitest | 3.2.4 | pure-helper + parity tests (`pnpm test` = `vitest run`) | `[VERIFIED: package.json]` |
| pnpm | 11.9.0 | package/scripts runner | `[VERIFIED: pnpm --version]` |
| spacetime CLI | installed at `C:\Users\rolan\AppData\Local\SpacetimeDB\bin\current` | publish/sql/logs | `[VERIFIED: spacetime --version]` |
| node | v24.15.0 | toolchain | `[VERIFIED: node --version]` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Local `closestPointOnSegment` in `attackHitbox.ts` | `import { distanceToSegment } from './bridges'` (verified exported, `bridges.ts:80`) | Import couples combat to the bridges module (which imports `worldGen` and builds `BRIDGES` at module scope). Discretion note prefers local; recommend LOCAL — and the lane needs the closest POINT (for D6-05 knockback center), which `distanceToSegment` does not return, so a local helper is required anyway. |
| `resolveLane` returning boolean + separate closest-point helper | Single fn returning `{hit, closestX, closestZ}` | Two small pure fns keep each testable and let `resolveLane` share `closestPointOnSegment`; recommend the two-fn shape (see Code Examples). |

**Installation:** none. **Version verification:** N/A (no packages added).

## Package Legitimacy Audit

**No external packages are installed this phase** (zero-new-deps is a locked cross-cutting constraint). Audit table: empty. Packages removed due to [SLOP]: none. Packages flagged [SUS]: none.

## Architecture Patterns

### System Architecture Diagram (lane data flow)

```
                         SERVER (worldTick, 150ms, ctx.timestamp sampled once)
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │ goliath rows ──► runUnitAttacks (unitAttacks.ts glue)                       │
  │   IDLE: selectAttack(distance, now, sharedSkillCd, basicCd, list)           │
  │     └─ 'shieldDash' ──► computeLaneEnd(cast, target, laneLength[size])      │
  │                          (normalize + overshoot + clampToWorld)  [NEW,pure] │
  │                          └─► enterWindup(..., laneEnd) [UNCHANGED]          │
  │                               row: castX/Z=start, landingX/Z=end,           │
  │                                    radius=halfWidth                         │
  │   WINDUP: goliathPosition ← cast (rooted, D4-12) [EXISTING]                 │
  │   due deadlines ──► walkAttackTransitions                                   │
  │     STRIKE: move !== 'none' → teleportToLanding=true,                       │
  │             effectiveX/Z = landing            [ONE-TOKEN CHANGE]            │
  │     RECOVERY: resolveStrike=true (dash has no chainsInto)                   │
  │     IDLE: role 'skill' → cooldownUntilMicros = now + 6.0s [EXISTING]        │
  │   glue applies plan:                                                        │
  │     goliathPosition ← landing (charge commit, before single apply)          │
  │     attack_strike insert (UNCONDITIONAL, landing=lane end, radius=hw)       │
  │     resolveStrike: for EVERY live player:                                   │
  │       resolveLane(p, cast, landing, radius)?           [NEW, pure]          │
  │         hit → playerDamage += contact×2.5                                   │
  │             → knockbackDisplacement(victim,                                 │
  │                 closestPointOnSegment(victim, cast, landing), 3.5, heading) │
  │             → stunnedUntilMicros = max(old, now+3 ticks)  [WR-01 EXISTING]  │
  └───────────────┬────────────────────────────────────┬────────────────────────┘
       unit_attack row (subscription)          attack_strike event (onInsert once)
                  │                                     │
                  ▼ CLIENT (render-only)                ▼
  ┌───────────────────────────────────┐  ┌─────────────────────────────────────┐
  │ createAttackViewClock             │  │ createGame.handleAttackStrike       │
  │  → AttackAnimationView            │  │  attackId==='shieldDash' tier:      │
  │    (phase, progress, cast,        │  │   clang SFX (playDash) + dust wake  │
  │     landing)                      │  │   (cast point via getAttackRows())  │
  │       │                           │  │   + rim flash + light shake         │
  │       ▼                           │  └─────────────────────────────────────┘
  │ createGoliathRenderer             │
  │  animateDash: brace crouch →      │  ┌─────────────────────────────────────┐
  │  grounded lunge (travelFraction,  │  │ createTelegraphSystem               │
  │  mesh lerp ≤8u < SNAP) → skid     │  │  shape 'lane': rectangle outline    │
  └───────────────────────────────────┘  │  at cast, yaw=atan2(-aimZ,aimX),    │
                                         │  length=|landing−cast|, width=      │
                                         │  2×row.radius; fill scales along    │
                                         │  lane axis only (NOT setScalar)     │
                                         └─────────────────────────────────────┘
```

### Recommended File Touch Map (no new project structure — extension of existing modules)

```
spacetimedb/src/
├── attacks.ts            # +shieldDash entry, +laneLengthBySize?: field, +'shieldDash' in UNIT_ATTACKS,
│                         #  leapSlam maxBand seed edit (Pitfall 1)     (~+35 lines)
├── attackHitbox.ts       # +closestPointOnSegment, +resolveLane, +computeLaneEnd (~+45 lines, file → ~115)
├── unitAttackFsm.ts      # leap gate → move !== 'none' (1 token) + comment update
├── unitAttacks.ts        # lane-end call at IDLE site + lane arm in resolveStrike
│                         #  (per-victim knockback center)              (~+20 lines, file → ~265)
└── index.ts              # ZERO changes (verified: runUnitAttacks call site untouched)

src/game/
├── data/attacks.ts       # +shieldDash mirror entry; AttackRenderSpec.shape widens to |'lane'
├── systems/createTelegraphSystem.ts   # lane branch in insert()/anchorGroup()/update()
│                                      #  (consider telegraphShapes.ts carve — Pitfall 8)
├── systems/createGoliathRenderer.ts   # +animateDash + dispatch line
├── audio/createAudioSystem.ts         # +playDash (procedural clang, WebAudio, zero assets)
└── createGame.ts         # +shieldDash juice tier in handleAttackStrike

tests (all existing files, new cases only):
├── src/game/data/__tests__/attackHitbox.test.ts   # resolveLane/closestPoint/computeLaneEnd describes
├── src/game/data/__tests__/attacks.test.ts        # shieldDash registry numbers + DASH SELECTABILITY tests
├── src/game/data/__tests__/unitAttackFsm.test.ts  # charge relocate + coalesced-tick charge walk
└── src/game/data/__tests__/serverSync.test.ts     # auto-covers new entry + explicit lane assertions
```

### Pattern 1: Relocate-at-strike via the transition plan (the leap seam, generalized)

**What:** `walkAttackTransitions` (`spacetimedb/src/unitAttackFsm.ts:156-163`) already flags `teleportToLanding` and moves `effectiveX/Z` to the landing when `spec.move === 'leap'`. The glue (`unitAttacks.ts:221-223`) layers that onto the `goliathPosition` map before the single apply.
**When to use:** `move:'charge'` is the identical relocate contract — recommend the one-token generalization `spec.move !== 'none'` (Claude's-discretion pick; it keeps the swing's `move:'none'` planted, needs zero new TransitionPlan fields, zero glue changes, and one new test case). A sibling `chargeToLanding` flag would duplicate the gate and force a second glue branch for identical behavior — reject.
**Verified consequence:** the coalesced-tick contract (FSM-05) works unchanged — a tick jumping past all deadlines walks [STRIKE, RECOVERY, IDLE]: STRIKE relocates, RECOVERY resolves once vs the pre-walk `strikeSnapshot` geometry, IDLE writes the shared skill cooldown (`role:'skill'` branch, line 183).

### Pattern 2: Lane-end computation is a PURE helper, not glue arithmetic

**What:** `unitAttacks.ts`'s header contract (lines 1-8, verified): "This module contains ZERO decision arithmetic of its own — every deadline, selection, hit test, and displacement comes from attacks/unitAttackFsm/attackHitbox." D6-02 says "the GLUE computes laneEnd" — honor the *placement* (the IDLE selection site, where target + spec + size are all in hand, `unitAttacks.ts:176-185`) but put the *math* in a pure sibling: `computeLaneEnd(castX, castZ, targetX, targetZ, length)` in `attackHitbox.ts`, world-clamped by the caller via the existing `clampToWorld` (`worldRules.ts:14-16`, per-axis ±135) per D6-14. Test-first: zero-length target fallback, exact-length overshoot, clamp near the world edge.
**Zero-division note:** minBand 3.5 guarantees the selection-time distance ≥ 3.5, but author the helper with the standard zero-length fallback anyway (same defensive branch shape as `knockbackDisplacement:64-66`) — a helper this pure must not NaN on any input.

### Pattern 3: Shape-branching in resolveStrike with a per-victim knockback center

**What:** the current `resolveStrike` (`unitAttacks.ts:76-97`) computes ONE knockback center before the victim loop (`isCone ? cast : landing`). The lane's center is per-victim (closest point on the centerline, D6-05).
**How:** grow a third arm mirroring the cone branch: `const isLane = spec.shape === 'lane'`; hit test = `resolveLane(victim, cast, landing, row.radius)`; then compute the center *inside* the loop for lanes only (`closestPointOnSegment(victim, cast, landing)`), keeping circle/cone on the pre-loop constant. The centerline-exact victim falls into `knockbackDisplacement`'s existing zero-delta fallback (heading push) — no new helper, verified branch at `attackHitbox.ts:64-66`.
**Monotonic stun (WR-01):** untouched — the lane hit flows through the same `newStun > victim.stunnedUntilMicros ? newStun : ...` write (`unitAttacks.ts:114-120`).

### Pattern 4: Telegraph anchoring + the 05-04 shape-aware re-anchor rule

**What:** `anchorGroup` (`createTelegraphSystem.ts:95-111`) anchors cones at the CAST apex with `yaw = atan2(-(landingZ−castZ), landingX−castX)` — the sign convention was visually verified through the pixel filter in the 05-05 playtest. The lane anchors identically (cast end, same yaw formula).
**Lane-specific wrinkle (verified):** the same-attack re-cast path (`:229-234`) only re-anchors position/yaw and re-times — it does NOT rebuild geometry. A circle/cone's geometry depends only on `row.radius` (same across re-casts), but a lane's geometry length depends on `|landing − cast|`, which CAN differ between casts when `clampToWorld` shortens a lane at the world edge. The lane branch must therefore rebuild (remove + insert, the chain-swap path at `:223-227`) — or store built-length and rebuild only when it changes. Recommend: for `shape:'lane'`, treat a `startedAtMicros` change as rebuild, not re-anchor (simplest correct rule; re-casts are rare).
**Fill-sweep wrinkle (verified):** the shared `update()` does `progress.scale.setScalar(fraction)` (`:260-264`) — uniform scaling. The lane fill must scale ONLY along the lane axis (width constant) and grow FROM the cast end (D6-11: "fill sweeping from the cast end toward the lane end"). Author the fill PlaneGeometry along local +X with `geometry.translate(length/2, 0, 0)` so `scale.x = fraction` sweeps cast→end, and add a per-telegraph scale strategy (e.g., store `fillAxis: 'uniform' | 'x'` on `ActiveTelegraph`) so `update()` stays one loop.

### Pattern 5: Grounded lunge rides travelFraction (leap minus parabola)

**What:** `travelFraction` (`createGoliathRenderer.ts:99-107`) measures the mesh's ACTUAL horizontal travel from cast toward the locked landing — the server row teleports at strike, and the entity renderer's lerp (`LERP_RATE = 10`, `createEntityRenderer.ts:97`) animates the ≤8u gap because it is under `SNAP_DISTANCE` (strict `>` comparison verified at `:256`).
**Lerp arithmetic (verified):** an 8u gap under exponential lerp at rate 10 leaves ~1.8u after the 150ms strike phase — the visible travel spills well into recovery, exactly like the leap arc does today. So `animateDash` must ride `travelFraction` through BOTH strike and early recovery (mirror `animateLeapSlam`'s structure at `:199-222`: strike = release crouch fast + lean into travel; recovery = keep the lunge lean until `travel ≥ ~0.97` (the `LANDED_TRAVEL_FRACTION` precedent), then eased skid/settle). No `model.group.position.y` writes (grounded — that line is the only leap-vs-dash difference that matters).
**Neutral restore:** `animateMovement`/`animateDeath` already call `applyCrouch(0)` + `resetAttackPose()` every frame (`:229-244`) — any new transforms `animateDash` writes MUST be limited to what `resetAttackPose` clears (body rotation.x/y, arm rotation.x/z) or the crouch helper, or `resetAttackPose` must be extended in the same slice (05-02 contract).

### Pattern 6: Event-driven juice, cast point via getAttackRows()

**What:** `handleAttackStrike` (`createGame.ts:1306-1362`) branches per attackId with handler-local seed constants (NOT parity material, per 05-02 decision). The `attack_strike` event carries `unitKind, unitId, attackId, landingX, landingZ, radius` (verified insert at `unitAttacks.ts:229-236`) — for a lane, landing = lane END and radius = half-width (free, zero schema change; answers the discretion bullet — yes, radius carries the half-width).
**Cast point for the dust wake:** NOT on the event. `attackViewClock.getAttackRows()` is already exposed (`createAttackViewClock.ts:44, 166-168`) and createGame already calls it (line 1298) — the dash juice tier can find the row by `unitKind/unitId` and read `castX/Z` (the row still carries dash geometry through RECOVERY; dash has no chainsInto so no swap hazard). Guard with a fallback (burst-only at landing) if the row is missing — see Assumption A1 on cache-ordering.
**SFX:** add `playDash` to `createAudioSystem.ts` following the `playSwing/playSwirl/playSlam` procedural-WebAudio precedent (gesture-unlocked lazy AudioContext already handled there; zero assets).

### Anti-Patterns to Avoid

- **Per-tick travelling collision / multi-tick active window** — explicitly rejected (D6-01); resolve ONCE at strike+grace vs live positions.
- **`pickRayHit` reuse for the lane** — nearest-only; SC3 requires ALL victims in the lane (D6-04).
- **Importing `bridges.ts` into `attackHitbox.ts`** — couples combat to world topology; local ~10-line helper instead (and the lane needs the closest point, which bridges' fn doesn't return).
- **Re-aiming the lane after windup entry** — perfect-homing is a REQUIREMENTS.md anti-feature; aim locks once at cast (D6-02/D5-05).
- **Writing dash cooldown anywhere but the IDLE transition** — the applier owns it (`walkAttackTransitions` role-'skill' branch); glue must not duplicate (05-01 Pitfall-2 lesson).
- **A circular shockwave for the lane strike** — the swing tier deliberately skips `spawnShockwave` because a circle misreads a non-circular shape (`createGame.ts:1339-1341`); same logic applies to the lane. Use burst + wake, not shockwave.
- **Client-local timers for telegraph/clip timing** — ANIM-01: always re-derive from the row (`startedAtMicros`/`strikeAtMicros`/arrival anchors).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Point-to-segment distance | New vector lib / matrix math | The clamp-to-[0,1] projection pattern verbatim from `bridges.ts:80-97` (reimplemented locally, ~12 lines) | Battle-tested in production pathing; degenerate zero-length case already solved |
| Knockback displacement w/ fallback | New push helper | `knockbackDisplacement` (`attackHitbox.ts:52-71`) with a per-victim center argument | Zero-length fallback branch already handles the on-centerline victim (D6-05) |
| Relocate-at-strike plumbing | New FSM state / position pass | `teleportToLanding` flag + `goliathPosition` map override (`unitAttacks.ts:221-223`) | Proven by leap through 04-07 + 05-05 playtests, incl. coalesced ticks |
| Charge travel animation | Tween/spring lib, position keyframes | Entity renderer's existing lerp + `travelFraction` (`createGoliathRenderer.ts:99-107`) | Zero-new-deps is locked; the leap already proves ≤8u relocations animate |
| Windup fill timing | Client countdown timer | Arrival-anchored row re-derivation (`createTelegraphSystem.ts:196-203`) | ANIM-01 locked; drift-free vs server clock |
| Stun stacking rules | New stun arbitration | Monotonic max write (`unitAttacks.ts:114-120`, WR-01) | Already fixed once; regression = movement unlock exploit |
| SFX assets | Audio files/deps | Procedural WebAudio in `createAudioSystem.ts` (04-06 precedent) | Zero assets, zero deps, gesture-unlock already solved |

**Key insight:** every hard sub-problem of a "travelling hitbox" was already decomposed away by D6-01: the hitbox doesn't travel on the server (segment test at one instant), and the client travel is the entity renderer's ordinary lerp. What remains is pure data + one segment-distance function.

## Common Pitfalls

### Pitfall 1: shieldDash is UNREACHABLE under the locked D6-06 + D6-07 combination (CRITICAL — plan must resolve)

**What goes wrong:** With `UNIT_ATTACKS = ['leapSlam', 'swordSwing', 'shieldDash']` (D6-07), dash band 3.5–8.0, the SHARED `cooldownUntilMicros` (D6-06), and leapSlam's existing band 0–8 (`attacks.ts:54-55`), `selectAttack` (`attacks.ts:121-141`) can never return `'shieldDash'`. Proof: both skills read the same `skillCooldownUntilMicros` argument, so at any tick either both are off cooldown or both are on it. Dash's entire band [3.5, 8] is inside slam's band [0, 8]. `selectAttack` returns the FIRST in-band off-cooldown skill — slam is listed first — so wherever dash qualifies, slam qualifies and wins. D6-07's emergence story ("slam on 5.5s cooldown → dash is the only in-band off-cooldown skill") is internally contradictory with D6-06: slam on cooldown ⇒ dash on the SAME cooldown. Shipping the decisions literally means SC1/SC2/SC3 are all unverifiable — the attack never fires. `[VERIFIED: selectAttack source + ATTACKS data, this session]`
**Why it happens:** D6-06 and D6-07 were authored against slightly different mental models (per-skill vs shared gate).
**How to avoid:** a data-only band edit — within the seed-tuning latitude D6-03/D-02 explicitly grant ("Seeds; user tunes in playtest"), and honoring D6-07's "NO special weighting code":
  - **Recommended: shrink `leapSlam.maxBand` 8 → 5.5.** Result: 0–3.5 = swing (+ slam point-blank as today), 3.5–5.5 = slam-priority overlap, 5.5–8 = dash-only. The after-whiff story then genuinely emerges: whiffed slam → 5.5s shared cd → victim flees → at cd expiry a victim beyond 5.5u draws the gap-closer. Existing test `attacks.test.ts:99` ("leapSlam for EVERY distance 0..maxBand") survives because it sweeps to `maxBand`, and `:129` ("null at d=5 with the skill on cooldown") survives because the shared gate also blocks dash at d=5.
  - Alternative (full partition): slam maxBand → 3.5 (slam becomes the melee skill, dash the only ranged skill). Cleaner rhythm alternation, but demotes the slam's ranged-leap identity — feel call.
  - Rejected: reordering dash before slam (inverts the shadow — slam then never fires at 3.5–8, contradicting D6-07's literal ordering) and per-attack cooldown columns (rejected in D6-06).
**Warning signs / regression guard:** the plan MUST add selection tests to `attacks.test.ts`: "returns shieldDash at d=6.5 with both cooldowns clear", "returns leapSlam at d=4.5 with cooldowns clear (overlap priority)", "returns null at d=6.5 with the skill cooldown active (shared gate)". Surface the band edit to the user at the playtest checkpoint as a documented deviation from D6-07's literal numbers.

### Pitfall 2: Size-2 lane length 8.0 sits exactly ON the SNAP_DISTANCE boundary

**What goes wrong:** the client snaps instead of lerping when `horizontalGap > SNAP_DISTANCE` (strict `>`, verified `createEntityRenderer.ts:256`). The size-2 seed `laneLength = 8.0` produces a strike-frame position jump of exactly `|aim×8.0|` where `|aim| = 1 ± float-ε` — the gap can compute to `8.000000000000002 > 8` and SNAP, rendering the size-2 charge as a teleport and killing SC2 for the biggest goliath.
**Why it happens:** D6-03 authored the ceiling AT the boundary of a strict comparison.
**How to avoid:** seed size 2 at **7.95** (or 7.9) instead of 8.0 — within the granted tuning latitude, imperceptible in play, and removes the float coin-flip. If the plan keeps 8.0 to honor D6-03 literally, the playtest checklist MUST include "size-2 charge visibly travels (does not teleport)" and the one-line fix on failure. Also note world-edge clamped lanes are SHORTER, never longer — clamping cannot re-trigger the snap.

### Pitfall 3: The shared `update()` fill scaling is uniform — a lane fill scaled by `setScalar` grows in WIDTH too

**What goes wrong:** `progress.scale.setScalar(fraction)` (`createTelegraphSystem.ts:260-264`) works for circles (radial) and cones (apex-origin sectors) but would make the lane fill sweep out from the cast POINT in both length and width — reading as a growing wedge, not a fill running down a fixed-width lane (D6-11 language violation).
**How to avoid:** author the lane fill geometry along local +X, `translate(length/2, 0, 0)` so the origin is the cast end, and scale ONLY `scale.x`. Add a per-shape scale strategy to `ActiveTelegraph` rather than branching on `ATTACK_RENDER[...].shape` in the per-frame loop.

### Pitfall 4: Same-attack re-cast re-anchors but does NOT rebuild — stale lane length

**What goes wrong:** the re-cast path (`createTelegraphSystem.ts:229-234`) reuses the existing mesh. Lane geometry bakes `|landing − cast|`; a re-cast whose lane got world-clamped (different length) renders the wrong lane. Circle/cone never hit this because their geometry depends only on `row.radius`.
**How to avoid:** for `shape:'lane'`, route a `startedAtMicros` change through remove+insert (the existing chain-swap rebuild at `:223-227`). One extra conditional, disposes correctly.

### Pitfall 5: Emitting `laneLength` semantics through `landingX/Z` means parity tests can't read lane length off the row — assert it on the registry

**What goes wrong:** planners sometimes bolt parity assertions onto row shapes; here the row is untyped glue (`idleAttackRow` is `any`-typed — 05-01's documented Pitfall 5: a missing field only fails at runtime insert). There is NO new column, so nothing new can silently miss — but the NEW REGISTRY FIELD (`laneLengthBySize`) is invisible to every existing serverSync assertion.
**How to avoid:** explicit new assertions in the `ATTACKS registry invariants` describe (`serverSync.test.ts:352`): `shieldDash.move === 'charge'`, `laneLengthBySize` length === `GOLIATH_SIZE_STATS.length` and every value ≤ 8 (SNAP ceiling, with a comment naming `SNAP_DISTANCE` — it is not exported, assert the literal), `radiusBySize` length 3, damage `2.5×` → `[225, 325, 425]` (mirrors the swirl test at `:382-388`; contactDamage verified 90/130/170), band `[3.5, maxBand]` consistency with the Pitfall-1 resolution. The auto-`it.each` blocks already cover: tick-multiple durations, windup ≥ 2, shape parity, stunSeconds `3×0.15 = 0.45`, juiceColor palette membership, graceTicks === 1, non-cone entries carry no cone angle, id-set equality with ATTACK_RENDER (`:429-485` — the new entry is asserted the moment it exists on either side).

### Pitfall 6: D6-13's scalar `laneHalfWidth` mirror field cannot parity-lock to a per-size array — and the renderer doesn't need it

**What goes wrong:** server half-width is `radiusBySize: [1.6, 1.8, 2.0]` (per size). A single client `laneHalfWidth` scalar can't equal three values, so the promised "parity-locked the way coneHalfAngleDegrees locks to coneMinDot" assertion is unwritable as specified. Worse: an unused mirror field violates CLAUDE.md no-dead-code.
**Why it happens:** D6-13 assumed the row wouldn't carry the half-width — but it does: `row.radius = radiusBySize[sizeIndex]` (written by `enterWindup:96`), exactly how the circle's radius and cone's range already reach the renderer (neither has a mirror field — verified `ATTACK_RENDER` carries no radius for leapSlam).
**How to avoid:** renderer reads `row.radius` for width (per-size correct, zero mirror field), `ATTACK_RENDER.shieldDash = { shape:'lane', stunSeconds: 0.45, juiceColor: ELEMENTS.cryo.color }` — widening `AttackRenderSpec.shape` to `'circle' | 'cone' | 'lane'` (`src/game/data/attacks.ts:11`). `ELEMENTS.cryo.color = 0xa8e6ff` (verified) satisfies both the "icy-white/cryo" discretion intent AND the palette-membership parity test (`serverSync.test.ts:467-474`). Document this as a reasoned deviation from D6-13's letter (the row supersedes the mirror; the mirror pattern exists only for data NOT on the row, like the cone angle). If the planner prefers strict adherence, the honoring variant is `laneHalfWidthBySize: readonly number[]` deep-equal-asserted to server `radiusBySize` — but it would be test-only dead data; recommend against.

### Pitfall 7: Coalesced tick + charge — the relocate must come from `strikeSnapshot`, and resolution vs live positions is asymmetric with the render

**What goes wrong:** two subtleties. (a) The glue teleports using `plan.strikeSnapshot.landingX/Z` (`unitAttacks.ts:221-223`) — for dash (no chain) snapshot === final row, so this is safe, but the charge branch test should still pin it (the 05-03 lesson: teleport reads the snapshot, not `plan.row`). (b) Damage resolves at strike+grace vs LIVE positions (D4-02) while the goliath has ALREADY relocated to the lane end — a victim who watched the windup and stands still mid-lane is hit by a goliath now behind/past them. This is correct per D6-01/D6-02 (the segment test covers the whole path) but the plan's playtest script should verify the FEEL: hit registration one tick after the mesh starts lunging must read as "clipped by the charge", which the 150ms grace + knockback-out-of-lane sells.
**How to avoid:** unit tests in `unitAttackFsm.test.ts`: "charge STRIKE sets teleportToLanding and effectiveX/Z = landing", "[STRIKE, RECOVERY, IDLE] one-call walk relocates once, resolves once, writes skill cooldown once", "move:'none' still never sets the flag" (the existing Pitfall-1 gate).

### Pitfall 8: LOC ceilings — `createTelegraphSystem.ts` (288 lines) and `createGoliathRenderer.ts` (280 lines) are both near 300

**What goes wrong:** the lane telegraph branch (~60-80 lines: rectangle outline strips + fill plane + anchor/rebuild/scale-strategy changes) and the dash clip (~40-50 lines) push both files toward the ≤300-functional-LOC rule (comments/blanks excluded — both files are comment-heavy, so functional LOC is lower, but the margin is thin).
**How to avoid:** plan a carve if either crosses: extract mesh construction into `src/game/systems/telegraphShapes.ts` (buildCircle/buildCone/buildLane returning `{outline, progress, fillAxis}`) — a natural single-job module that also simplifies the insert() branch. For the renderer, the four clip functions could move to `src/game/systems/goliathAttackClips.ts` taking the rig handles. Do the carve in the same slice that crosses the line, not as a follow-up (CLAUDE.md).

### Pitfall 9: Zero schema change ≠ zero deploy steps — and the migrated-DB check still applies

**What goes wrong:** assuming "client-only rebuild" because no tables changed. The MODULE changed (new registry entry + resolver + glue) — the server must be republished or the client selects/renders an attack the server never fires (the classic "no such reducer"-family drift, here as behavior drift).
**How to avoid:** deploy order (no hazard window since bindings don't change, but keep the ritual): `spacetime publish 2d-impact-game-fr9ti --module-path spacetimedb --server local --yes` → `pnpm run spacetime:generate` (bindings identical; regenerating is free insurance) → `pnpm build`. NO maincloud (self-host pivot). Verify on the POPULATED local DB: engage a goliath at 5.5–8u, confirm `spacetime sql 2d-impact-game-fr9ti "SELECT attack_id, state FROM unit_attack"` shows `shieldDash` rows, and `spacetime logs` shows no reducer panics. `init`/`seed_world` are NOT needed (goliaths already live; the FSM lazily upserts rows — FSM-06 verified in the glue at `unitAttacks.ts:150-154`).

### Pitfall 10: Damage/stun kit interactions — verified safe, but pin them

**What goes wrong:** unmodeled worst cases have forced retunes twice (04-07, 05-05).
**Verified numbers:** dash = 2.5× contact (90/130/170) = **225/325/425** — identical to the swirl's numbers, below slam's 405/585/765, and alone ≪ the 900 minimum HP pool (verified: smallest `maxHealth` in CHARACTERS = 900). Dash chains into nothing, so the existing no-one-shot chain invariant (`serverSync.test.ts:390-402`) is untouched. Worst single-goliath sequence (dash 425 → recovery 1.2s → swing chain 680) is the same class as the already-accepted slam→chain (765 + 680) with more escape time and two knockbacks in between. Stun 3 ticks (0.45s) < swing's 4: the monotonic guard means a dash landing on a slam-stunned victim extends nothing incorrectly. Shared skill cooldown means slam and dash can NEVER both fire inside one 5.5-6.0s window from the same goliath. Add the `[225, 325, 425]` parity test (Pitfall 5) and keep the chain invariant as-is.

### Pitfall 11: Windup escape math sanity (SC1 fairness)

**What goes wrong:** an undodgeable lane = the anti-feature this milestone exists to delete.
**Verified arithmetic:** escape = sidestep of (half-width − current perpendicular offset) + ε ≤ 1.6-2.0u. Player speed 8.4u/s (per the Phase-5 escape-race comment, `attacks.ts:88-92`) → worst-case sidestep ≈ 0.19-0.24s against a 0.9s windup + 0.15s grace. Generous but aggressive vs the slam's 1.2s — matches D6-08's intent. No change needed; cite in the plan so the playtest evaluates feel, not fairness.

## Code Examples

All examples are prescriptive syntheses of verified in-repo patterns (source files cited inline).

### resolveLane + closestPointOnSegment (mirrors `bridges.ts:80-97`, extends `attackHitbox.ts` style)

```typescript
// attackHitbox.ts — LOCAL reimplementation (do not import bridges.ts; combat
// stays decoupled from world topology, and the lane needs the closest POINT
// for the D6-05 knockback center, which distanceToSegment does not return).

// Closest point on segment (ax,az)-(bx,bz) to point (px,pz): the standard
// clamp-to-[0,1] projection (same math as bridges.ts distanceToSegment). A
// zero-length segment returns the start point — resolveLane then degrades to
// the circle test (D6-04 degenerate semantics, same style as resolveCone).
export function closestPointOnSegment(
  px: number, pz: number,
  ax: number, az: number,
  bx: number, bz: number
): { x: number; z: number } {
  const segmentX = bx - ax;
  const segmentZ = bz - az;
  const lengthSquared = segmentX * segmentX + segmentZ * segmentZ;
  if (lengthSquared === 0) return { x: ax, z: az };
  const projection = ((px - ax) * segmentX + (pz - az) * segmentZ) / lengthSquared;
  const clamped = Math.max(0, Math.min(1, projection));
  return { x: ax + clamped * segmentX, z: az + clamped * segmentZ };
}

// True when (px,pz) lies within halfWidth of the cast→landing centerline —
// INCLUSIVE edge (<=), matching resolveCircleHit/resolveCone (D6-04).
export function resolveLane(
  px: number, pz: number,
  castX: number, castZ: number,
  landingX: number, landingZ: number,
  halfWidth: number
): boolean {
  const closest = closestPointOnSegment(px, pz, castX, castZ, landingX, landingZ);
  return Math.hypot(px - closest.x, pz - closest.z) <= halfWidth;
}

// Lane end with overshoot (D6-02): cast + normalize(target − cast) × length.
// Caller clamps each axis via worldRules.clampToWorld (D6-14). Zero-length
// aim falls back to the cast point (defensive; minBand 3.5 makes it unreachable).
export function computeLaneEnd(
  castX: number, castZ: number,
  targetX: number, targetZ: number,
  length: number
): { x: number; z: number } {
  const deltaX = targetX - castX;
  const deltaZ = targetZ - castZ;
  const deltaLength = Math.hypot(deltaX, deltaZ);
  if (deltaLength === 0) return { x: castX, z: castZ };
  return { x: castX + (deltaX / deltaLength) * length, z: castZ + (deltaZ / deltaLength) * length };
}
```

### ATTACKS entry (registry-as-data, incorporating the Pitfall-1/2 seed recommendations)

```typescript
// attacks.ts — AttackSpec gains ONE optional field (pattern: coneMinDot):
//   laneLengthBySize?: readonly number[]; // D6-03: charge distance per size; each <= 8 (client SNAP_DISTANCE)
// and leapSlam.maxBand changes 8 -> 5.5 (Pitfall 1 — creates the dash-only
// 5.5..8 zone the D6-07 emergence story requires under the shared cooldown).

shieldDash: {
  shape: 'lane',            // ATK-04: capsule test via resolveLane
  role: 'skill',            // D6-06: writes the SHARED cooldownUntilMicros at IDLE
  windupTicks: 6,           // 0.9s (D6-08) — sidestep escape, not a sprint
  activeTicks: 1,
  graceTicks: 1,            // D4-02 verbatim (serverSync locks graceTicks === 1)
  recoveryTicks: 8,         // 1.2s whiffed-charge punish at the lane end (D6-08)
  cooldownMicros: 6_000_000n, // D6-08 seed
  radiusBySize: [1.6, 1.8, 2.0], // lane HALF-WIDTH (D6-03) — row.radius carries it to the client
  laneLengthBySize: [6.5, 7.25, 7.95], // D6-03 seeds; size 2 backed off 8.0 (float-snap risk, Pitfall 2)
  damageMultiplier: 2.5,    // 225/325/425 (D6-09)
  minBand: 3.5,             // D6-07: point-blank belongs to the swing
  maxBand: 8,               // ≈ lane reach (reach = length + halfWidth ≥ 8 for every size — verified)
  knockback: 3.5,           // D6-10 perpendicular bulldoze (center = closest point, D6-05)
  stunTicks: 3,             // 0.45s (D6-10) — parity: ATTACK_RENDER.stunSeconds 0.45
  move: 'charge',           // D6-01 relocate-at-strike
  poiseThreshold: 600,
},
// UNIT_ATTACKS: { default: ['leapSlam', 'swordSwing', 'shieldDash'] } (D6-07 order kept)
```

### walkAttackTransitions charge gate (one-token generalization — recommended discretion pick)

```typescript
// unitAttackFsm.ts:158 — before:
//   if (spec.move === 'leap') {
// after (comment updated: "'leap'/'charge' relocate the unit to the locked
// landing at strike; 'none' stays planted — Pitfall-1 gate):
if (spec.move !== 'none') {
  teleportToLanding = true;   // name kept: "relocate at strike" (leap AND charge)
  effectiveX = current.landingX;
  effectiveZ = current.landingZ;
}
// TransitionPlan unchanged; glue unchanged (unitAttacks.ts:221-223 already
// applies the flag to the goliathPosition map before the single apply).
```

### Glue: lane-end at selection + lane arm in resolveStrike

```typescript
// unitAttacks.ts IDLE site (after selectAttack, before enterWindup — the spot
// where target + spec + sizeIndex are all in hand, ~line 176). enterWindup
// UNCHANGED (D6-02): the lane end is just its target argument.
const spec = ATTACKS[attackId];
let targetX = target.positionX;
let targetZ = target.positionZ;
if (spec.shape === 'lane' && spec.laneLengthBySize) {
  const clampedIndex = Math.min(Math.max(goliathRow.sizeIndex, 0), spec.laneLengthBySize.length - 1);
  const laneEnd = computeLaneEnd(from.x, from.z, target.positionX, target.positionZ, spec.laneLengthBySize[clampedIndex]);
  targetX = clampToWorld(laneEnd.x); // D6-14: clamp the goliath, not the victims
  targetZ = clampToWorld(laneEnd.z);
}
const entry = enterWindup(now, tick, spec, goliathRow.sizeIndex, from.x, from.z, targetX, targetZ);

// resolveStrike victim loop — third shape arm with a PER-VICTIM center:
const isLane = spec.shape === 'lane';
const hit = isLane
  ? resolveLane(victim.positionX, victim.positionZ, row.castX, row.castZ, row.landingX, row.landingZ, row.radius)
  : isCone ? resolveCone(/* existing */) : resolveCircleHit(/* existing */);
// knockback center: closest point on the centerline for lanes (D6-05 bulldoze);
// pre-loop constant for circle/cone as today. On-centerline victims fall into
// knockbackDisplacement's zero-delta heading fallback (attackHitbox.ts:64-66).
const kb = isLane
  ? closestPointOnSegment(victim.positionX, victim.positionZ, row.castX, row.castZ, row.landingX, row.landingZ)
  : { x: centerX, z: centerZ };
```

### Lane telegraph geometry sketch (insert() branch; verified against the cone branch at `createTelegraphSystem.ts:123-137`)

```typescript
// shape 'lane' (ATTACK_RENDER[row.attackId]?.shape === 'lane'):
// Local axes BEFORE the shared -PI/2 X-rotation: +X = along the lane (yawed by
// anchorGroup toward the aim, same atan2(-aimZ, aimX) as the cone — 05-05
// playtest-verified sign), Y = width. Group origin = CAST end (anchorGroup lane
// arm mirrors the cone arm: position at cast, yaw from cast->landing).
const length = Math.hypot(row.landingX - row.castX, row.landingZ - row.castZ);
const width = row.radius * 2; // row.radius IS the half-width (enterWindup writes radiusBySize[size])

// Outline: four thin strips (RIM_WIDTH 0.3 >= the 0.2u pixel-filter floor,
// ANIM-02) — two long rails + two end caps, merged into one Mesh per rail via
// PlaneGeometry, all sharing outlineMaterial. (Alternative: THREE.Shape with a
// hole -> ShapeGeometry; strips are simpler to keep RIM_WIDTH exact.)
// Fill: ONE PlaneGeometry(length, width - 2 * PROGRESS_RIM_WIDTH), translated
// +length/2 on X so scale.x sweeps from the cast end (D6-11):
const fill = new THREE.PlaneGeometry(length, width - 2 * PROGRESS_RIM_WIDTH);
fill.translate(length / 2, 0, 0);
// update(): lanes scale progress.scale.x = fraction (y/z stay 1) — NOT
// setScalar (Pitfall 3). Store fillAxis on ActiveTelegraph at insert time.
// Re-cast (startedAtMicros change) with shape 'lane': rebuild, don't re-anchor
// (length may differ after world clamping — Pitfall 4).
```

### serverSync additions (delta only — the it.each harness auto-covers the rest)

```typescript
// ATTACKS registry invariants describe (serverSync.test.ts:352):
it('shieldDash damage = 2.5x per-size contactDamage -> 225/325/425 (D6-09)', () => {
  expect(GOLIATH_SIZE_STATS.map(s => Math.round(s.contactDamage * ATTACKS.shieldDash.damageMultiplier)))
    .toEqual([225, 325, 425]);
});
it('shieldDash is the charge: lane shape, move charge, per-size lane data under the 8u snap ceiling (D6-01/D6-03)', () => {
  expect(ATTACKS.shieldDash.shape).toBe('lane');
  expect(ATTACKS.shieldDash.move).toBe('charge');
  expect(ATTACKS.shieldDash.laneLengthBySize).toHaveLength(GOLIATH_SIZE_STATS.length);
  for (const len of ATTACKS.shieldDash.laneLengthBySize!) expect(len).toBeLessThanOrEqual(8); // client SNAP_DISTANCE
  expect(ATTACKS.shieldDash.radiusBySize).toHaveLength(GOLIATH_SIZE_STATS.length);
});
// attacks.test.ts selectAttack describe — the Pitfall-1 regression guards:
//   dash selectable at d=6.5 cooldowns clear; slam wins the 3.5..5.5 overlap;
//   shared cooldown gates BOTH skills at d=6.5.
```

## State of the Art (this codebase's own evolution — no external ecosystem applies)

| Old Approach | Current Approach | When Changed | Impact on this phase |
|--------------|------------------|--------------|--------|
| Per-tick contact drain | Discrete telegraphed strikes, resolve-once | Phase 4 | D6-01's per-tick-collision rejection is the same doctrine |
| Client-local telegraph timers | Arrival-anchored row re-derivation | Phase 4 (ANIM-01) | Lane fill uses the same `progressFraction` path unchanged |
| `recoveryEndsAtMicros` as strike-clip denominator | `STRIKE_PHASE_MICROS = 150_000n` grace window | 05-05 fix | Dash clip phase windows come free from `createAttackViewClock` |
| Uniform telegraph re-anchor on re-cast | Shape-aware re-anchor (`anchorGroup`) | 05-04 | Lane extends it again: re-cast → REBUILD (length can change) |
| Unconditional stun write | Monotonic max (WR-01) | Phase 5 review fix | Lane hits inherit it; zero new work |
| leap-only teleport (`move === 'leap'`) | generalize to `move !== 'none'` | THIS phase | The only FSM change Phase 6 makes |

**Deprecated/outdated:** `pickRayHit` (`hitscan.ts`) for AoE lane use — REJECTED in D6-04 (nearest-only; the lane hits all victims). It remains valid for player hitscan.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `[ASSUMED]` When `attack_strike.onInsert` fires, the same-transaction `unit_attack` row update is already applied to the client cache (so `getAttackRows()` returns the dash row with fresh `castX/Z` for the dust wake). SpacetimeDB delivers transaction updates as a unit, but callback-vs-cache ordering within one transaction was not verified this session. | Pattern 6 (juice cast point) | Wake draws from a stale cast point for one event, or the row lookup misses → mitigated by the recommended fallback (burst-only at landing). Cosmetic only. |
| A2 | `[ASSUMED]` Player run speed 8.4u/s (cited from the Phase-5 escape-race comment in `attacks.ts:88-92`, not re-derived from movement code this session). | Pitfall 11 | Escape-window math shifts slightly; windup is a tunable seed either way. |
| A3 | `[ASSUMED]` The lane rectangle reads legibly through the pixel filter at max pixelation with RIM_WIDTH 0.3 strips (extrapolated from the circle/cone precedent, ANIM-02). Visual verification is owned by the playtest plan, per the 04-04/05-04 precedent. | Pattern 4 / telegraph | A wider rim or higher fill opacity needed — one-constant fixes at the checkpoint. |

All other claims in this document are `[VERIFIED: codebase]` — read directly from the files cited, this session.

## Open Questions

1. **How should the plan resolve the D6-06/D6-07 selection shadow? (blocking — see Pitfall 1)**
   - What we know: literal implementation makes shieldDash unreachable (proof in Pitfall 1); band seeds are explicitly user-tunable.
   - What's unclear: whether the user prefers overlap-partition (slam maxBand 5.5) or full partition (3.5), or something else.
   - Recommendation: implement slam maxBand → 5.5 with a loud seed comment + the three regression tests, and surface the deviation for user confirmation at the playtest checkpoint (the same checkpoint D6-07 already mandates for "verify the emergence").
2. **D6-13 letter vs no-dead-code: mirror `laneHalfWidth` or read `row.radius`?**
   - What we know: half-width is per-size and already on the row; a scalar mirror can't parity-lock to an array; unused fields violate CLAUDE.md.
   - Recommendation: read `row.radius` (renderer) — no mirror field; note the deviation in the plan (Pitfall 6 has the full argument and the honoring-variant fallback).
3. **Keep size-2 laneLength at the locked 8.0 or back off to 7.95?**
   - What we know: strict `>` snap comparison; float error can tip 8.0 over.
   - Recommendation: 7.95 seed (Pitfall 2); if the plan keeps 8.0, add the explicit playtest check.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| pnpm | all scripts | ✓ | 11.9.0 | — |
| node | toolchain | ✓ | v24.15.0 | — |
| spacetime CLI | publish/sql/logs | ✓ | installed (`...\SpacetimeDB\bin\current`) | — |
| vitest | tests | ✓ | 3.2.4 (devDep) | — |
| Local spacetimedb-standalone on :3000 | migrated-DB playtest | not probed (service state changes; verify at the deploy step) | — | `spacetime start` / restart standalone before the capstone |

**Missing dependencies with no fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.2.4 |
| Config file | vite defaults (no dedicated vitest config needed — existing suite runs today) |
| Quick run command | `pnpm vitest run src/game/data/__tests__/<file>.test.ts` |
| Full suite command | `pnpm test` (= `vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ATK-04 | `resolveLane` hits inside/edge/outside; zero-length degrades to circle; ALL victims (loop is glue, resolver is per-point) | unit | `pnpm vitest run src/game/data/__tests__/attackHitbox.test.ts` | ✅ (add describes) |
| ATK-04 | `closestPointOnSegment` interior/endpoint/degenerate; `computeLaneEnd` overshoot + zero-length fallback | unit | same file | ✅ (add) |
| ATK-04 | charge STRIKE relocates (flag + effectiveX/Z), `move:'none'` stays planted, coalesced [STRIKE,RECOVERY,IDLE] relocates+resolves+cooldowns once | unit | `pnpm vitest run src/game/data/__tests__/unitAttackFsm.test.ts` | ✅ (add) |
| ATK-04 | shieldDash registry numbers; **dash selectable at 6.5u / slam wins overlap / shared gate blocks both** (Pitfall-1 guards) | unit | `pnpm vitest run src/game/data/__tests__/attacks.test.ts` | ✅ (add) |
| ATK-04 / SC3 | ATTACKS↔ATTACK_RENDER parity incl. new entry, damage triple, lane data ≤ 8, `move:'charge'` | unit | `pnpm vitest run src/game/data/__tests__/serverSync.test.ts` | ✅ (extend) |
| SC1/SC2 | Telegraph lane renders + fills through pixel filter; goliath visibly charges (no snap, all sizes); step-out dodges; in-lane bystander hit | manual-only (visual + two-client feel — the 04/05 precedent; pixel-filter legibility cannot be asserted headlessly) | migrated-DB human playtest | — |
| FSM-06 | `unit_attack` rows appear with `shieldDash` on the POPULATED local DB after a real 5.5–8u engage | manual + `spacetime sql 2d-impact-game-fr9ti "SELECT attack_id, state FROM unit_attack"` | deploy capstone | — |
| Determinism | grep-gate stays green | automated | `grep -rn "Math.random\|Date.now" spacetimedb/src/` → empty (verified green today) | ✅ |

### Sampling Rate
- **Per task commit:** the touched file's vitest target (`pnpm vitest run src/game/data/__tests__/attackHitbox.test.ts` etc.)
- **Per wave merge:** `pnpm test` + `pnpm build`
- **Phase gate:** full suite green + build green + grep-gate + migrated-DB playtest before `/gsd-verify-work`

### Wave 0 Gaps
None — existing test infrastructure covers all phase requirements; every new test lands as added cases in existing files.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (no new reducers, no new identity paths) | — |
| V3 Session Management | no | — |
| V4 Access Control | yes (inherited) | Server-authoritative combat: clients render only; no new client-writable input exists this phase (the FSM runs inside `worldTick`) — the strongest control is that there is NO new attack surface |
| V5 Input Validation | yes (inherited) | Zero new reducer args; `updatePosition` stun rejection + `MAX_HIT_DAMAGE` clamp unchanged |
| V6 Cryptography | no | — |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client spoofing dodge (reporting a position outside the lane) | Tampering | Damage resolves server-side vs the server-accepted `player` row; stun window blocks `updatePosition` (existing, `T-04-12`) |
| Determinism break (module randomness/wall-clock) | Tampering/Repudiation | grep-gate (verified green); all new helpers take injected bigints, no clock/RNG |
| Mid-stun character-switch HP-pool dodge | Elevation | `setActiveCharacter` stun gate (05-05, existing) — dash stun rides the same `stunnedUntilMicros` |

## Sources

### Primary (HIGH confidence — direct file reads this session)
- `spacetimedb/src/attacks.ts`, `attackHitbox.ts`, `unitAttackFsm.ts`, `unitAttacks.ts`, `bridges.ts` (:80-97), `worldRules.ts`, `enemyStats.ts` (:69-74), `index.ts` (:3239)
- `src/game/systems/createTelegraphSystem.ts`, `createGoliathRenderer.ts`, `createEntityRenderer.ts` (:96, :256), `createAttackViewClock.ts`
- `src/game/createGame.ts` (:906-939, :1295-1362), `src/game/data/attacks.ts`, `src/game/data/elements.ts`, `src/game/data/characters.ts` (min pool 900)
- `src/game/data/__tests__/serverSync.test.ts`, `attacks.test.ts`, `attackHitbox.test.ts` (structure)
- `.planning/phases/06-shielddash-lane/06-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`, `CLAUDE.md`
- Tool probes: `pnpm --version`, `node --version`, `spacetime --version`, grep-gate run

### Secondary / Tertiary
None — no external research required (zero new deps; all questions were codebase questions; config has all web-search providers disabled).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new deps; all tooling verified installed and in active use.
- Architecture: HIGH — every seam read at line level; the leap precedent covers relocate+render end to end.
- Pitfalls: HIGH for 1-2, 5-10 (proven from source); MEDIUM for 3-4 (Three.js geometry behavior reasoned from the existing branch, not executed) and A1-A3 (logged as assumptions).

**Research date:** 2026-07-11
**Valid until:** code-state-bound — re-verify line references if any Phase-6-touched file changes before planning (30 days otherwise; the stack is internal and stable)
