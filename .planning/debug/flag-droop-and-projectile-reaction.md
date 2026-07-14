---
status: diagnosed
slug: flag-droop-and-projectile-reaction
phase: 08-wind-core
source: 08-UAT.md round 2 (tests 3, 4)
created: 2026-07-14
---

# Flag: windless droop doesn't read + no projectile reaction

Two gaps from phase 8 UAT round 2, both in `createCampFlag.ts`.

## Gap 1 — Windless flag never droops ("its ridged all the time")

### Symptom
User: flag stays erect/horizontal, never hangs limp. Wants it to droop when there is no wind.

### Root cause
The drape pose is mathematically correct but gated on the WRONG driver.

- `createCampFlag.ts:125` — `drape = flagDrapeGlsl('uWindStrength', 'gust')` = `1 - min(1, uWindStrength * (0.7 + 0.25*gust))`.
- `createWind.ts:47` — `strengthUniform = { value: enabled ? 1 : 0 }`, and `update()` (`:53-57`) mutates **only time + direction, never strength**. So `uWindStrength` is a **binary constant**: `1` in normal play, `0` only under the `?nowind` debug flag.
- Therefore during actual gameplay `uWindStrength` is pinned at `1`, and `drape` can only relax to `1 - (0.7 + 0.25*gust)` = **0.30 max** (pitch ≈ 0.44 rad / 25°) between gusts — a near-horizontal banner. A real limp hang (drape→1, pitch 1.45 rad / 83°) requires `uWindStrength = 0`, which **never happens in play** — only via `?nowind`.
- Net: the flag has no calm/lull state during play. It reads "rigid all the time" because the only lever that would droop it (binary strength) is never in the droop regime while playing.

Camera is tilted ~49° (`CAMERA_OFFSET = (7,15,11)`, `createGame.ts:250`), so a real Y-drop *would* be clearly visible — the problem is the droop is never triggered, not that it's hidden.

### Fix direction
Decouple the calm/droop pose from the binary `?nowind` kill switch. Drive drape off a **continuous low-wind activity signal** that ebbs toward 0 between gusts and rises when a gust travels through — e.g. blend the live gust envelope (and/or a smoothed local wind magnitude) into the drape driver, still multiplied by `uWindStrength` so `?nowind` = full limp is preserved. Result: cloth sags toward limp during lulls, lifts and streams when a gust passes. Keep the fix in the existing `begin_vertex` patch + windMath pose constants (WIND-01: shader/CPU cannot drift). No geometry change (voxel thickness rejected by user — flat plane reads fine under the pixel filter).

## Gap 2 — Flag does not react to passing projectiles

### Symptom
User: want the flag to react to projectile direction and be affected by projectiles flying past.

### Root cause
No coupling exists between the projectile system and flag cloth — it was never built (new feature, promoted from backlog into this closure).

- Projectiles are per-frame meshes in `createEffectSystem.spawnProjectile` (`createEffectSystem.ts:242`), each with `.position` and a normalized `velocity` (direction × speed), advanced in `update()` (`:270` `addScaledVector`).
- Precedent already exists: projectiles push world influence via `stampGround(x, z, ..., velocity.x, velocity.z)` (`:305`) to part the grass beneath them. The identical pattern can push a directional impulse to nearby flags.
- Missing pieces: (a) a per-flag impulse responder (CPU impulse state → shader uniform, or a small nearest-impulse buffer gated by distance to each flag's world position), (b) a `disturbFlags(x, z, dirX, dirZ)`-style callback invoked per-projectile-per-frame when a projectile passes near a camp, (c) a decaying directional displacement term in `createCampFlag.ts` summed on top of the wind pose.

### Fix direction
Mirror the `stampGround` pattern: add a flag-disturbance callback wired into the projectile update loop, gated by distance to camp flags (only flags near an active projectile pay any cost — pooled-material contract preserved, per-flag impulse state lives CPU-side). Add a transient direction-aligned displacement term (~0.3–0.6 s decay) in the cloth shader. Do NOT regress the pooled `campFlag` material or the frozen-matrix rule.

## Constraints (both fixes)
- Uniforms stay `uTime` / `uWindDir` / `uWindStrength` for wind; any projectile uniform is additive and per-flag.
- Pooled `campFlag` material + `customProgramCacheKey` intact; CR-01/CR-02 wind-scoped lifetime untouched.
- Pose math lives in `windMath.ts` (shared JS + GLSL generators) where it is wind-related; projectile-impulse art constants may live in `createCampFlag.ts`.
- No voxel/thickness geometry (user rejected).
