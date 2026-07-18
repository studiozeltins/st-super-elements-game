---
status: diagnosed
trigger: "UAT: camp flag ignores wind gust direction/strength (wiggles in place); with ?nowind flag stays rigid horizontal instead of hanging limp"
created: 2026-07-14T00:00:00Z
updated: 2026-07-14T00:00:00Z
---

## Current Focus

hypothesis: "Flag shader ripple is a pure time-based sine at FLAG.freq with constant amplitude — it never reads uWindDir for displacement direction nor gustGainFactor for amplitude, unlike grass/smoke"
test: Read createCampFlag.ts shader patch, windMath.ts FLAG constants + gustGlsl/swayGlsl, compare to createGrassField.ts gust term and createSmokeColumns.ts drift
expecting: If displacement direction is baked into mesh-local axis (not uWindDir) and amplitude has no gust envelope, Issue 1 confirmed; if displacement -> 0 at uWindStrength=0 leaves flat horizontal quad with no drape term, Issue 2 confirmed
next_action: Read src/game/world/assets/createCampFlag.ts fully, then windMath.ts, createGrassField.ts gust section, createSmokeColumns.ts, createMondstadtWorld.ts camp loop placement

## Symptoms

expected: |
  Issue 1: Flag cloth should sway/flap in the direction of the current wind gust, with intensity following gust strength (like the fireplace smoke, which reacts correctly).
  Issue 2: With ?nowind (uWindStrength=0) or between gusts, cloth should hang down limp (drape), not stay rigid horizontal.
actual: |
  Issue 1: Flag animates (cloth-ripple wiggle at FLAG.freq — CR-01 staleness fix works) but the motion is directionless/gust-blind; same wiggle regardless of gust direction or strength.
  Issue 2: With wind strength 0, wiggle disappears and flag freezes as a rigid horizontal quad.
errors: none (visual behavior bug)
reproduction: |
  Load game, observe camp flag vs fireplace smoke during gusts; load with ?nowind to see rigid horizontal pose.
started: Flag asset introduced this milestone; gust-blindness present since introduction (CR-01 fixed staleness only)
symptoms_prefilled: true
goal: find_root_cause_only

## Eliminated

- hypothesis: "Gust envelope is entirely missing from the flag shader (no amplitude response to gusts at all)"
  evidence: "createCampFlag.ts:86-89 — gustGlsl IS evaluated at retarded time and folded into ripple amplitude (idleAmp + gust * gustAmp). Amplitude DOES pulse during gusts; what is missing is any directional component, so the pulse reads as 'same wiggle, slightly bigger'."
  timestamp: 2026-07-14

- hypothesis: "Uniforms stale again (CR-01 regression)"
  evidence: "User confirms the ripple animates continuously; CR-01 wind-guarded cache (createCampFlag.ts:30-57) rebinds live uniform objects. Not staleness."
  timestamp: 2026-07-14

## Evidence

- timestamp: 2026-07-14
  checked: createCampFlag.ts:79-94 (begin_vertex patch)
  found: |
    Displacement is `transformed.z += flap * uWindStrength` — flap moves vertices along the cloth's LOCAL z axis
    (perpendicular to the cloth plane). uWindDir is declared (line 75) and consumed ONLY inside gustGlsl's
    retarded-time projection (line 86: dot(flagWorld.xz, uWindDir)) — i.e. it only controls WHEN the gust front
    arrives, never WHERE the cloth moves. flap is a zero-mean sine: no DC downwind lean/stream term exists.
    The taut pull (line 92) only shortens local x symmetrically.
  implication: The flag's motion axis is fixed in world space per flag; wind direction cannot influence it.

- timestamp: 2026-07-14
  checked: createCampFlag.ts:137-139 + createClothGeometry (103-115)
  found: |
    `group.rotation.y = random() * Math.PI * 2` — each flag's heading is a random build-time bake ("Static
    build-time orientation — the cloth answers the wind in-shader"), and the cloth is a vertical plane extending
    along local +x from the pole. Rest geometry = fully-stretched horizontal banner pose.
  implication: |
    (a) Each flag ripples along a random fixed world axis forever — matches "wiggling in the same direction".
    (b) The rest pose is the STRONG-WIND pose; the shader only adds ripple on top of it.

- timestamp: 2026-07-14
  checked: windMath.ts FLAG constants (84-93), gustGainFactor (131-133), gustGlsl (161-168)
  found: |
    FLAG has no direction or drape constants — only ripple shape (freq/waveK/amps/tautPull). gustGainFactor's
    contract "strength 0 returns exactly 1" is what keeps GRASS animating under ?nowind; the flag does NOT use
    that shape — it multiplies the entire flap by uWindStrength (createCampFlag.ts:90), so strength 0 zeroes
    ALL motion and leaves the rest geometry.
  implication: ?nowind → displacement 0 → rigid horizontal fully-stretched quad. No drape/sag term exists anywhere.

- timestamp: 2026-07-14
  checked: createGrassField.ts:123-134 (working gust reference)
  found: |
    Grass: `transformed.xz += vec2(ampX, ampZ) * sway * scale * heightFactor * (1.0 + uWindStrength * gain * gust)`.
    Grass sway axis is ALSO a fixed world diagonal (0.85, 0.55) — only the gust ENVELOPE travels along uWindDir.
    Grass stays alive at strength 0 because gust gain is (1 + strength·gain·gust), not (motion × strength).
  implication: Grass gets away with a fixed axis because blades are radially symmetric; a flag is not — it visibly points somewhere.

- timestamp: 2026-07-14
  checked: createSmokeColumns.ts:155-178 (user's working reference)
  found: |
    Smoke moves puffs ALONG the wind vector: `puff.x += windX * drift; puff.z += windZ * drift` with
    drift = (BASE_DRIFT + GUST_KICK * sampleGust) * strength. Direction enters the DISPLACEMENT, not just the phase.
  implication: This is exactly the coupling the flag lacks — smoke displaces along uWindDir, flag only phases by it.

- timestamp: 2026-07-14
  checked: Constraint surface for the fix
  found: |
    Pooled single cloth material serves all flags (cache key 'campFlag') → no per-mesh uniforms. Frozen-matrix
    rule → no per-frame mesh rotation. BUT modelMatrix is already read in the patch (line 85), and
    modelMatrix[0].xz is the cloth's baked world heading — everything needed for an in-shader yaw toward
    uWindDir is already per-object-available with zero new uniforms/attributes. cloth.castShadow=false
    (line 134), so shader-only pose changes have no depth-pass counterpart to update.
  implication: Fix must be shader-space; all required inputs are already bound.

## Resolution

root_cause: |
  Issue 1: uWindDir only enters the flag shader as the retarded-time phase of the gust envelope
  (createCampFlag.ts:86); the actual displacement is a zero-mean sine along the cloth's LOCAL z axis
  (line 90), and the cloth plane's heading is a random build-time bake (line 139). Direction never
  reaches the displacement, and there is no mean downwind lean/stream term — so gusts can only make the
  same fixed-axis wiggle slightly bigger.
  Issue 2: All motion is multiplied by uWindStrength (line 90) and the rest geometry is the
  fully-stretched horizontal banner (createClothGeometry); with strength 0 (or gust≈0 idle ≈ tiny amp)
  the shader adds nothing and the strong-wind rest pose shows through rigid. No drape/sag term exists.
fix: (diagnosis-only session — fix direction returned to orchestrator)
verification:
files_changed: []
