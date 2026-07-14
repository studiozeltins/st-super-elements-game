---
type: feature
status: pending
captured: 2026-07-14
source: 08-UAT.md round 2 (test 4)
milestone: v0.3.0-alpha (Living World) or later
scope: out-of-phase (phase 8 = wind-core only)
---

# Flag reacts to passing projectiles

**User request (08 UAT round 2, test 4):** "I want flag to react to projectile direction and be affected by passing projectiles."

## What

Camp flag/banner cloth should respond to projectiles that fly near or through it — a local displacement impulse along the projectile's travel direction, decaying back to the wind-driven pose.

## Why out of phase 8

Phase 8 (Wind Core) scope is the shared wind system (phase, gusts, direction) driving grass/flags/canopies/smoke. Projectile→cloth interaction is a **new coupling** between the combat/projectile system and cloth rendering — new input (projectile positions/velocities into the flag shader or a CPU-side impulse buffer), not a wind gap. Belongs in a later polish/interaction phase.

## Rough approach (for later planning)

- Feed nearby projectile position + direction into `createCampFlag.ts` cloth shader as a transient uniform (or a small impulse ring buffer), gated by distance to the flag AABB.
- Add a direction-aligned displacement term that spikes on pass-by and decays (~0.3–0.6s), summed on top of the wind pose — reuse the existing begin_vertex patch point.
- Keep the pooled `campFlag` material contract; per-flag impulse state lives CPU-side, pushed each frame only for flags near active projectiles (avoid per-frame cost on all flags).

## Depends on

- Flag cloth voxel-thickness rework (08 UAT gap — solid geometry) should land first, so the impulse deforms real cloth, not a paper plane.

Related: [[goliath-raiders]] (projectile source), phase 8 flag cloth gaps.
