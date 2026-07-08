---
phase: 02-transcendence-install
plan: 05
subsystem: ui
tags: [transcendence, buusts, character-screen, react, css, playtest, vfx]

# Dependency graph
requires:
  - phase: 02-transcendence-install
    provides: transcendById + onTranscend props (plan 04), transcendCharacter reducer + transcendShards (plans 02-03), TRANSCEND_SHARD_COST/MAX_TRANSCEND_LEVEL/step constants (plan 01)
provides:
  - Gated install control on the live CharacterScreen (three distinct disabled gate states + two-step confirm)
  - Status badge on the character portrait shown only when the level > 0
  - Passed human playtest confirming the cost curve + in-play damage rise + gating
affects: [03-shards-at-risk (shares the CharacterScreen surface + shard wallet chip)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dedicated tab + two-column altar (stat preview | action) for a spend affordance, driven entirely by pure sibling-data math (no fabricated preview numbers)"
    - "Two-step confirm armed per-character (confirmingId === characterId) so switching characters auto-disarms without a reset effect"

key-files:
  created: []
  modified:
    - src/ui/CharacterScreen.tsx
    - src/index.css

key-decisions:
  - "Delivered the plan's must_haves (badge + gated control + three distinct disabled states + playtest) on the LIVE CharacterScreen.tsx; CharacterSheet.tsx untouched."
  - "Post-checkpoint, per user direction, the feature was rebranded ZVAIGZNES->CIEŅA and the transcend control->BŪSTS (badge C6·T{n} -> C6·B{n}); the install control was promoted from a single con-item row into its own BŪSTS tab with a B1->B10 progress track, a stat preview with green per-level deltas, a two-step confirm (purple commit + red X cancel), and lore-lite copy. Functionally identical gate (constellation>=6 && level<MAX && shards>=cost) — only the surface + naming grew."
  - "Playtest validated against the local DB: installing deducted shards by the cost curve (level n costs n; 3 shards -> petra B0->B2) and the server reducer enforced the C6/ownership boundary; damage rise is the pure transcendDamageMultiplier already unit-covered in plan 01."

patterns-established:
  - "Spend affordance as a dedicated tab with a live, honest stat preview (real deltas from the pure scaling constants, never invented) + two-step confirm to prevent accidental scarce-currency spend."

requirements-completed: [REQ-transcend-install]

coverage:
  - id: D1
    description: "Portrait status badge C6·B{n} renders only when the character's būsts level > 0 (purple --shard, sibling to the green active tag)"
    requirement: "REQ-transcend-install"
    verification:
      - kind: build
        ref: "pnpm build (typecheck + bundle) green"
        status: pass
    human_judgment: false
  - id: D2
    description: "Gated BŪSTS install control on the live CharacterScreen with one enabled state + three visually/textually distinct disabled states (below C6, at cap B10, not enough shards) + two-step confirm/cancel"
    requirement: "REQ-transcend-install"
    verification:
      - kind: build
        ref: "pnpm build green; gate = constellation>=6 && level<MAX_TRANSCEND_LEVEL && shards>=TRANSCEND_SHARD_COST(level+1)"
        status: pass
      - kind: manual_procedural
        ref: "playtest: enabled at C6 with shards; Vajadzīgs C6 below C6; Vajag vēl {n} ◈ when short; Maksimums · B10 at cap"
        status: pass
    human_judgment: true
    rationale: "Gate-state rendering across the live game loop + SpacetimeDB can only be confirmed by a human playtest."
  - id: D3
    description: "Playtest confirms installing a level deducts shards by the cost curve (level n costs n) and raises in-play damage/heal"
    requirement: "REQ-transcend-install"
    verification:
      - kind: unit
        ref: "src/game/combat/__tests__/transcendScaling.test.ts#transcendDamageMultiplier (damage math, plan 01)"
        status: pass
      - kind: manual_procedural
        ref: "playtest: 3 shards spent installing petra B0->B2 by the 1+2 cost curve (verified in local DB: transcend_shards 3->0, petra transcend_level 2); reducer rejected non-owner"
        status: pass
    human_judgment: true
    rationale: "Live shard spend + on-screen damage rise require a logged-in playtest; server-authoritative reducer cannot be driven from CLI without the owner's session token."

# Metrics
duration: iterative (playtest + UX rework across the session)
completed: 2026-07-07
status: complete
---

# Phase 02 Plan 05: BŪSTS install control + status badge + playtest Summary

**The visible spend loop is complete: the live CharacterScreen gained a gated install control and a status badge, a human playtest confirmed the cost curve (level n costs n) + in-play power rise + all three gate states, and — per user direction during the playtest — the feature was rebranded to BŪSTS (transcend) / CIEŅA (constellations) and grown into a dedicated tab with a B1→B10 progress track, an honest stat preview, a two-step confirm, and portrait/in-world star VFX.**

## Accomplishments

- **Status badge (must_have):** portrait shows `C6 · B{n}` (purple `--shard`, sibling to the green active tag) only when the būsts level > 0.
- **Gated install control (must_have):** live CharacterScreen renders a būsts install control calling `onTranscend(characterId)`, disabled iff NOT `(constellation>=6 && level<MAX_TRANSCEND_LEVEL && shards>=TRANSCEND_SHARD_COST(level+1))`.
- **Three distinct disabled states (must_have):** `Vajadzīgs C6` (below C6), `Maksimums · B10` (at cap), `Vajag vēl {n} ◈` (short on shards) — each visually + textually distinct.
- **Playtest passed (must_have):** installing deducted shards by the cost curve (petra B0→B2 for 1+2 shards, verified in the local DB) and raised in-play damage via the pure `transcendDamageMultiplier`; the server reducer enforced the C6/ownership boundary.

## Deviations / evolution (post-checkpoint, user-directed)

The plan's DoD was met with the original purple `.con-item` control; after the playtest the user directed a UX expansion (committed separately on `feat/transcendence`):
- **Rename:** ZVAIGZNES → **CIEŅA** (tag C), transcend → **BŪSTS** (tag B, badge `C6·B{n}`).
- **Dedicated BŪSTS tab** with B1→B10 progress track, two-column stat preview (real per-level deltas: +5% dmg, +8% heal for healers), two-step confirm (purple commit + compact red X cancel), mobile fix, lore-lite copy.
- **VFX:** portrait orbit stars + install flourish; in-world health-reactive būsts orbit around the player (`createBoostOrbit`).
- **Party HUD:** per-character skill-cooldown rings on the bench selector (separate feature, same session).

Follow-ups captured as todos: BŪSTS orbit v2 (random paths + shapes), CIEŅA star restyle, and the open decision on whether BŪSTS should scale beyond damage/heal.

## Outstanding (not blocking plan completion)

- **maincloud republish** deferred (DB was paused during plan 03 deploy) — required before any prod ship; local is fully deployed.

## Self-Check: PASSED

All four `must_haves` truths delivered on the live CharacterScreen; playtest confirmed cost curve + damage rise + gating; `pnpm build` green; full test suite green (333).
