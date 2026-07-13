# Phase 6: shieldDash lane - Pattern Map

**Mapped:** 2026-07-11
**Files analyzed:** 14 (10 modified, 0 new required, 2 conditional carve-outs)
**Analogs found:** 14 / 14 (every file extends an existing in-file pattern — zero greenfield)

This phase creates NO new files unless the ≤300-LOC rule forces a carve (see Conditional
Carve-Outs). Every touch point is a new branch/entry/case inside an existing file, and in
every case the closest analog is a sibling branch **in the same file** — the highest-quality
match possible. Excerpts below are the exact code to mirror. Line numbers verified at commit
`a1b6f1e`, 2026-07-11.

## File Classification

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------|------|-----------|----------------|---------------|
| `spacetimedb/src/attacks.ts` | config (data registry) | batch (read per tick) | `swordSwirl` entry, same file :80-101 | exact |
| `spacetimedb/src/attackHitbox.ts` | utility (pure geometry) | transform | `resolveCone` same file :32-44 + `bridges.ts:80-97` projection math | exact |
| `spacetimedb/src/unitAttackFsm.ts` | service (pure FSM applier) | transform | leap gate, same file :156-163 | exact |
| `spacetimedb/src/unitAttacks.ts` | service (reducer glue) | batch (worldTick pass) | cone arm in `resolveStrike` :76-97 + teleport apply :221-223 + IDLE selection :166-187 | exact |
| `src/game/data/attacks.ts` | config (client mirror) | request-response (lookup) | `swordSwing` entry :35-40 | exact |
| `src/game/systems/createTelegraphSystem.ts` | component (Three.js system) | event-driven (row sync) | cone branch :96-104, :123-137 | exact |
| `src/game/systems/createGoliathRenderer.ts` | component (render clip) | streaming (per-frame view) | `animateLeapSlam` :199-222 + dispatch :246-252 | exact |
| `src/game/createGame.ts` | controller (event handler) | event-driven (onInsert) | `swordSwing`/`swordSwirl` juice tiers :1338-1355 | exact |
| `src/game/audio/createAudioSystem.ts` | utility (procedural SFX) | event-driven | `playSwing` :93-134 | exact |
| `src/game/data/__tests__/attackHitbox.test.ts` | test | — | `resolveCone` describe :31-68 | exact |
| `src/game/data/__tests__/unitAttackFsm.test.ts` | test | — | Pitfall-1 gate test :162-188 | exact |
| `src/game/data/__tests__/attacks.test.ts` | test | — | `selectAttack` describe :96-133 | exact |
| `src/game/data/__tests__/serverSync.test.ts` | test | — | swirl damage test :382-388 + registry invariants :352-422 | exact |
| `src/game/systems/telegraphShapes.ts` / `goliathAttackClips.ts` (CONDITIONAL) | component (carve-out) | transform | the code being extracted | exact (extraction) |

## Pattern Assignments

### `spacetimedb/src/attacks.ts` (config, registry-as-data)

**Analog:** the `swordSwirl` entry in the same file (:80-101) — the most recent full entry,
showing the decision-ID comment style, INERT-field authoring, and playtest-seed annotations.

**Core registry-entry pattern** (attacks.ts:80-101):
```typescript
swordSwirl: {
  shape: 'circle', // self-centered AoE spin (D5-04)
  role: 'basic', // the FINISHING attack's role writes the basic cooldown (D5-13)
  windupTicks: 5, // 0.75s chain warning — the escape window after the swing stun (D5-11 playtest seed)
  activeTicks: 1,
  graceTicks: 1,
  recoveryTicks: 8, // 1.2s — the chain's single punish window (D5-11)
  cooldownMicros: 2_500_000n, // THE chain cooldown, written at IDLE into basicCooldownUntilMicros (D5-13)
  radiusBySize: [4.0, 4.5, 5.0], // escape-race seed (D5-06/Pitfall 9 playtest seed)
  damageMultiplier: 2.5, // 225/325/425 per size (D5-10 playtest seed)
  minBand: 0, // INERT — never selectable directly (D5-03); authored to swing's values for parity sanity
  maxBand: 3.5, // INERT (D5-03)
  knockback: 4.5, // throw clear so the chain cannot re-tag instantly (D5-12 playtest seed)
  stunTicks: 0,
  move: 'none',
  poiseThreshold: 600,
},
```
Copy this comment density verbatim: every number carries its decision ID + "playtest seed"
where tunable. The new `shieldDash` entry uses `shape: 'lane'`, `role: 'skill'`,
`move: 'charge'`, `radiusBySize` = lane HALF-WIDTH seeds [1.6, 1.8, 2.0] (D6-03).

**Optional-field pattern** (AttackSpec interface, :39-40) — `laneLengthBySize` follows
`coneMinDot` exactly (optional, shape-specific, documented with the decision ID):
```typescript
chainsInto?: string; // D5-01: chaining is DATA — RECOVERY re-enters WINDUP on this attack id
coneMinDot?: number; // D5-06: cos(half-angle) for shape 'cone'; 0.5 = 120° full angle
```
Add: `laneLengthBySize?: readonly number[]; // D6-03: charge distance per size; each <= 8 (client SNAP_DISTANCE)`.
Note `shape` at :24 already includes `'lane'` and `move` at :37 already includes `'charge'` —
NO type widening needed on the server.

**UNIT_ATTACKS list** (:106-108) — append `'shieldDash'` LAST (D6-07 order):
```typescript
export const UNIT_ATTACKS: Record<number, Record<string, readonly string[]>> = {
  [UNIT_KIND_GOLIATH]: { default: ['leapSlam', 'swordSwing'] },
};
```

**Selection-shadow constraint (RESEARCH Pitfall 1 — verified in `selectAttack` :129-141):**
`selectAttack` returns the FIRST in-band off-cooldown skill. leapSlam's band is 0–8
(:54-55) and both skills share `skillCooldownUntilMicros` (:133-136), so a literal D6-07
implementation makes shieldDash dead code. The plan's data-only fix (leapSlam `maxBand`
8 → 5.5) is an edit to :55 with a loud seed comment — `selectAttack` itself is UNCHANGED.

---

### `spacetimedb/src/attackHitbox.ts` (utility, pure geometry)

**Analogs:** `resolveCone` in the same file (:32-44) for resolver shape/edge semantics/doc
style; `bridges.ts:80-97` for the projection MATH (reimplement locally — do NOT import;
CONTEXT discretion prefers decoupling, and the lane needs the closest POINT which
`distanceToSegment` does not return).

**File-header contract** (:1-7) — extend the header's own reservation ("lane (Phase 6)
reuses segment projection when it lands — no dead stubs here"):
```typescript
// Pure attack hitbox geometry, kept dependency-free (pure sibling imports only)
// so it can be unit-tested directly under the client's vitest runner (same
// pattern as crit.ts / goliathAI.ts). No global randomness, no wall-clock time —
// plain coordinates in, plain results out (CLAUDE.md rule 2).
```

**Segment-projection math to mirror** (bridges.ts:80-97 — copy the arithmetic, return the
closest point instead of the distance):
```typescript
export function distanceToSegment(px, pz, ax, az, bx, bz): number {
  const segmentX = bx - ax;
  const segmentZ = bz - az;
  const segmentLengthSquared = segmentX * segmentX + segmentZ * segmentZ;
  if (segmentLengthSquared === 0) return Math.hypot(px - ax, pz - az);
  const projection = ((px - ax) * segmentX + (pz - az) * segmentZ) / segmentLengthSquared;
  const clamped = Math.max(0, Math.min(1, projection));
  const closestX = ax + clamped * segmentX;
  const closestZ = az + clamped * segmentZ;
  return Math.hypot(px - closestX, pz - closestZ);
}
```

**Resolver doc-comment + inclusive-edge pattern** (attackHitbox.ts:24-44) — `resolveLane`
mirrors this: INCLUSIVE `<=` edge, degenerate case documented in the header
(zero-length segment → circle test, same style as the cone's "zero-length aim degrades
to a 360° range check"):
```typescript
// True when the point (px,pz) lies inside the cone: within `range` of the apex
// (INCLUSIVE <=, same edge semantics as resolveCircleHit) AND within the forward
// arc of the aim vector (INCLUSIVE dot >= minDot). ...
// Degenerate semantics inherited from isWithinForwardArc: a zero-length aim
// vector degrades to a 360° range check; ... No new dot-product math (ATK-06 geometry reuse).
export function resolveCone(
  px: number, pz: number,
  apexX: number, apexZ: number,
  aimX: number, aimZ: number,
  range: number, minDot: number
): boolean {
  if (distanceBetween(px, pz, apexX, apexZ) > range) return false;
  return isWithinForwardArc(aimX, aimZ, apexX, apexZ, px, pz, minDot);
}
```

**Zero-length fallback branch pattern** (:60-71, `knockbackDisplacement`) — `computeLaneEnd`
copies this defensive shape (delta, hypot, `if (deltaLength === 0)` early return, normalized
scale):
```typescript
const deltaX = victimX - centerX;
const deltaZ = victimZ - centerZ;
const deltaLength = Math.hypot(deltaX, deltaZ);
if (deltaLength === 0) {
  return { x: victimX + fallbackHeadingX * distance, z: victimZ + fallbackHeadingZ * distance };
}
return {
  x: victimX + (deltaX / deltaLength) * distance,
  z: victimZ + (deltaZ / deltaLength) * distance,
};
```

Three new exports: `closestPointOnSegment(px,pz,ax,az,bx,bz) → {x,z}`,
`resolveLane(px,pz,castX,castZ,landingX,landingZ,halfWidth) → boolean` (calls
closestPointOnSegment then hypot `<=` halfWidth), `computeLaneEnd(castX,castZ,targetX,
targetZ,length) → {x,z}`. RESEARCH.md "Code Examples" has a full prescriptive draft.

---

### `spacetimedb/src/unitAttackFsm.ts` (service, pure FSM applier)

**Analog:** the leap gate inside `walkAttackTransitions` — the ONLY server FSM change.

**Charge gate — before** (unitAttackFsm.ts:156-164):
```typescript
if (nextState === ATTACK_STATE_STRIKE) {
  emitStrike = true;
  if (spec.move === 'leap') {
    teleportToLanding = true;
    effectiveX = current.landingX;
    effectiveZ = current.landingZ;
  }
  current = { ...current, state: ATTACK_STATE_STRIKE };
  strikeSnapshot = current;
```
**Change:** `spec.move === 'leap'` → `spec.move !== 'none'` (one token; RESEARCH's
recommended discretion pick — no new `TransitionPlan` field, glue untouched). Update the
`TransitionPlan.teleportToLanding` doc comment at :116 (currently "STRIKE occurred AND
spec.move === 'leap' (Pitfall 1 gate)") to name both 'leap' and 'charge'.

`enterWindup` (:75-100) is UNCHANGED (D6-02: the glue pre-computes the lane end and passes
it as `targetX/Z`, so `landingX/Z` stores the lane end and `radius` gets
`radiusBySize[clampedIndex]` = half-width for free at :96).

---

### `spacetimedb/src/unitAttacks.ts` (service, reducer glue)

**Analog 1 — IDLE selection site** (:166-187), where the lane-end computation slots in
between `selectAttack` and `enterWindup` (target + spec + sizeIndex all in hand):
```typescript
const attackId = selectAttack(
  distanceBetween(from.x, from.z, target.positionX, target.positionZ),
  now,
  row.cooldownUntilMicros,
  row.basicCooldownUntilMicros, // D5-08: basics gate on their OWN cooldown
  UNIT_ATTACKS[UNIT_KIND_GOLIATH].default
);
if (attackId === null) continue;
// Landing LOCKED at this single target sample (ATK-01); cast root = the
// goliath's current map position (D4-12); poise reset (Phase-7 seam).
const entry = enterWindup(
  now, tick, ATTACKS[attackId], goliathRow.sizeIndex,
  from.x, from.z,
  target.positionX, target.positionZ   // ← lane branch replaces THESE two args
);
row = { ...row, ...entry, attackId };
attackTable.id.update(row);
```
Lane branch: when `spec.shape === 'lane' && spec.laneLengthBySize`, compute
`computeLaneEnd(from.x, from.z, target.positionX, target.positionZ, laneLengthBySize[clampedIndex])`
and pass `clampToWorld(laneEnd.x)/clampToWorld(laneEnd.z)` as the target args (D6-02/D6-14).
The sizeIndex clamp mirrors `enterWindup:86`:
`Math.min(Math.max(sizeIndex, 0), spec.radiusBySize.length - 1)`.
NOTE the glue's header contract (:1-8): "ZERO decision arithmetic of its own" — the branch
may only SELECT arguments and call the pure helpers (`computeLaneEnd`, `clampToWorld`).

**Analog 2 — shape branching + knockback center in `resolveStrike`** (:76-108). The cone arm
is the template for the third (lane) arm; the key structural difference is that the lane's
knockback center moves INSIDE the victim loop (per-victim closest point, D6-05):
```typescript
const isCone = spec.shape === 'cone';
// Knockback center: the apex for cones ..., the landing for circles ...
const centerX = isCone ? row.castX : row.landingX;
const centerZ = isCone ? row.castZ : row.landingZ;
for (const [hex, snapshot] of playerByHex) {
  const victim = ctx.db.player.identity.find(snapshot.identity);
  if (!victim || isInsideSafeZone(victim.positionX, victim.positionZ)) continue;
  const hit = isCone
    ? resolveCone(victim.positionX, victim.positionZ, row.castX, row.castZ,
        row.landingX - row.castX, row.landingZ - row.castZ, row.radius, spec.coneMinDot ?? 0.5)
    : resolveCircleHit(victim.positionX, victim.positionZ, row.landingX, row.landingZ, row.radius);
  if (!hit) continue;
  playerDamage.set(hex, (playerDamage.get(hex) ?? 0) + goliathRow.contactDamage * spec.damageMultiplier);
  const pushed = knockbackDisplacement(
    victim.positionX, victim.positionZ, centerX, centerZ, spec.knockback, heading.x, heading.z
  );
```
Lane arm: `isLane ? resolveLane(victim.positionX, victim.positionZ, row.castX, row.castZ,
row.landingX, row.landingZ, row.radius) : ...`; knockback center for lanes =
`closestPointOnSegment(victim..., row.castX, row.castZ, row.landingX, row.landingZ)`
computed per victim after the hit test. The on-centerline victim falls into
`knockbackDisplacement`'s existing zero-delta heading fallback — no new helper.

**Analog 3 — monotonic stun write, DO NOT vary** (:114-120, WR-01):
```typescript
const newStun = stunDeadline(now, spec.stunTicks, tick);
ctx.db.player.identity.update({
  ...victim,
  positionX: clampToWorld(pushed.x),
  positionZ: clampToWorld(pushed.z),
  stunnedUntilMicros: newStun > victim.stunnedUntilMicros ? newStun : victim.stunnedUntilMicros,
});
```

**Analog 4 — charge position apply is ALREADY DONE** (:219-223) — zero glue change needed
for the relocate; the generalized flag flows through:
```typescript
// The ONLY teleport in the strike path, gated on the applier's leap flag
// (Pitfall 1 fix): move 'none' attacks like the swing stay planted.
if (plan.teleportToLanding && struck) {
  goliathPosition.set(goliathRow.goliathId, { x: struck.landingX, z: struck.landingZ });
}
```
(Update the ":220 leap flag" comment wording to cover charge in the same touch.)
`attack_strike` emission (:229-236) already carries `landingX/Z` + `radius` — for a lane
that is the lane END + half-width, answering the discretion bullet with zero changes.

---

### `src/game/data/attacks.ts` (config, client mirror)

**Analog:** the `swordSwing` entry — the only entry with a shape-specific extra field
(the pattern `laneHalfWidth` would follow if the plan honors D6-13 literally — but see
RESEARCH Pitfall 6: the renderer should read `row.radius` instead; recommended entry
carries NO half-width field).

**Mirror-entry pattern** (src/game/data/attacks.ts:30-43):
```typescript
export const ATTACK_RENDER: Record<string, AttackRenderSpec> = {
  // Ground-shattering slam reads as geo/earth amber.
  leapSlam: { shape: 'circle', stunSeconds: 1.05, juiceColor: ELEMENTS.geo.color },
  // 60° half-angle = 120° full swing arc; cos 60° = 0.5 = server coneMinDot (D5-06).
  // Air-cutting arc reads as anemo teal.
  swordSwing: {
    shape: 'cone',
    coneHalfAngleDegrees: 60,
    stunSeconds: 0.6,
    juiceColor: ELEMENTS.anemo.color,
  },
  swordSwirl: { shape: 'circle', stunSeconds: 0, juiceColor: ELEMENTS.electro.color },
};
```
Required type change (:11): `shape: 'circle' | 'cone'` → `'circle' | 'cone' | 'lane'`.
New entry: `shieldDash: { shape: 'lane', stunSeconds: 0.45, juiceColor: ELEMENTS.cryo.color }`
(`stunSeconds` parity-locked to stunTicks 3 × 0.15; juiceColor MUST come from the ELEMENTS
palette — serverSync :467-474 asserts palette membership; cryo = the "icy-white" discretion
intent).

---

### `src/game/systems/createTelegraphSystem.ts` (component, row-synced Three.js system)

**Analog:** the cone branches — anchor, insert, and the shared update loop.

**Anchor pattern** (:95-111) — the lane arm mirrors the cone arm (position at CAST, yaw from
cast→landing; the atan2 sign convention was playtest-verified in 05-05):
```typescript
function anchorGroup(group: THREE.Group, row: UnitAttack) {
  if (ATTACK_RENDER[row.attackId]?.shape === 'cone') {
    group.rotation.y = Math.atan2(-(row.landingZ - row.castZ), row.landingX - row.castX);
    group.position.set(row.castX, getGroundHeight(row.castX, row.castZ) + GROUND_EPSILON, row.castZ);
    return;
  }
  group.rotation.y = 0;
  group.position.set(row.landingX, getGroundHeight(row.landingX, row.landingZ) + GROUND_EPSILON, row.landingZ);
}
```

**Insert branch pattern** (:120-154) — cone branch shows the shape-lookup + two-mesh
(outline + progress) construction, materials via the shared `flatMaterial`, RIM_WIDTH 0.3 /
PROGRESS_RIM_WIDTH 0.22 constants (ANIM-02 pixel-filter floor is 0.2u):
```typescript
const render = ATTACK_RENDER[row.attackId];
if (render?.shape === 'cone' && render.coneHalfAngleDegrees !== undefined) {
  const fullAngle = THREE.MathUtils.degToRad(render.coneHalfAngleDegrees * 2);
  outline = new THREE.Mesh(
    new THREE.RingGeometry(row.radius - RIM_WIDTH, row.radius, RING_SEGMENTS, 1, -fullAngle / 2, fullAngle),
    outlineMaterial
  );
  progress = new THREE.Mesh(
    new THREE.RingGeometry(0.001, row.radius, RING_SEGMENTS, 1, -fullAngle / 2, fullAngle),
    flatMaterial(PROGRESS_OPACITY)
  );
} else { /* circle rings */ }
outline.rotation.x = -Math.PI / 2;   // shared: flat on the ground
progress.scale.setScalar(0.0001);    // starts empty; never exactly 0 (degenerate matrix)
```
Lane branch: length = `Math.hypot(row.landingX - row.castX, row.landingZ - row.castZ)`,
width = `row.radius * 2` (row.radius IS the half-width — no mirror field). Fill =
`new THREE.PlaneGeometry(length, width - 2 * PROGRESS_RIM_WIDTH)` translated
`+length/2` on X so `scale.x = fraction` sweeps from the cast end (D6-11).

**Two lane-specific deviations from the shared paths (RESEARCH Pitfalls 3-4):**
1. Shared `update()` (:258-264) does `progress.scale.setScalar(fraction)` — uniform. Lanes
   must scale ONLY `scale.x`. Add a scale strategy (e.g. `fillAxis: 'uniform' | 'x'`) to
   `ActiveTelegraph` (:37-57) at insert time so the per-frame loop stays one loop:
```typescript
telegraph.progress.scale.setScalar(
  telegraph.state === ATTACK_STATE_WINDUP
    ? Math.max(0.0001, progressFraction(telegraph))
    : 1
);
```
2. Same-attack re-cast (:229-234) re-anchors WITHOUT rebuilding — fine for circles/cones
   (geometry depends only on `row.radius`) but a lane's baked length can change after world
   clamping. For `shape:'lane'`, route a `startedAtMicros` change through the chain-swap
   rebuild path (:223-227):
```typescript
if (row.attackId !== existing.attackId) {   // ← lane adds: || (isLane && startedAtMicros changed)
  remove(key, existing);
  telegraphs.set(key, insert(row));
  continue;
}
```

---

### `src/game/systems/createGoliathRenderer.ts` (component, procedural attack clip)

**Analog:** `animateLeapSlam` (:199-222) — the ONLY clip that rides `travelFraction`; the
dash is "leap minus the parabola" (D6-12: no `model.group.position.y` writes = grounded).

**travelFraction seam** (:99-107) — reuse as-is, do not duplicate:
```typescript
function travelFraction(view: AttackAnimationView): number {
  const total = Math.hypot(view.landingX - view.castX, view.landingZ - view.castZ);
  if (total < 0.01) return 1; // point-blank slam: nothing to travel, no arc
  const remaining = Math.hypot(
    view.landingX - model.group.position.x,
    view.landingZ - model.group.position.z
  );
  return THREE.MathUtils.clamp(1 - remaining / total, 0, 1);
}
```

**Clip-structure pattern** (`animateLeapSlam`, :199-222 — phase switch on the view, progress²
ease-in windup, travel-gated recovery settle):
```typescript
function animateLeapSlam(view: AttackAnimationView) {
  if (view.phase === 'windup') {
    applyCrouch(view.phaseProgress * view.phaseProgress);  // rooted, progress² ease-in
    return;
  }
  const travel = travelFraction(view);
  if (view.phase === 'strike') {
    applyCrouch(1 - THREE.MathUtils.clamp(travel * 3, 0, 1));
    model.group.position.y += Math.sin(travel * Math.PI) * LEAP_HEIGHT;  // ← dash OMITS this
    return;
  }
  const settle = 1 - (1 - view.phaseProgress) * (1 - view.phaseProgress);
  model.group.position.y += Math.sin(travel * Math.PI) * LEAP_HEIGHT * (1 - settle);
  const landed = travel >= LANDED_TRAVEL_FRACTION;   // 0.97 arrival gate
  applyCrouch(landed ? SETTLE_SQUASH * (1 - settle) : 0);
}
```
Dash windup adds a lean into the aim (`model.body.rotation.x`, the `SWING_LEAN` precedent at
:154) + shield-arm raise (arm `rotation.x/z`, `setArmFlare` precedent :129-132). Named seed
constants with doc comments at the top of the file (:32-59 shows the D5-16 style).

**Clip-transform contract (05-02, :109-126):** any transform the dash writes MUST be one that
`resetAttackPose` clears (body rotation.x/y; arm rotation.x/z) or `applyCrouch` owns —
`animateMovement`/`animateDeath` call both every frame (:229-242) to guarantee neutral restore.

**Dispatch pattern** (:246-252) — add one line:
```typescript
animateAttack(view) {
  if (view.attackId === 'swordSwing') return animateSwing(view);
  if (view.attackId === 'swordSwirl') return animateSwirl(view);
  animateLeapSlam(view);   // ← add: if (view.attackId === 'shieldDash') return animateDash(view);
},
```

**Do NOT touch:** `src/game/systems/createEntityRenderer.ts:96` `SNAP_DISTANCE = 8`
(strict `>` comparison at :256) — it is the lane-length ceiling (D6-03), read-only this phase.

---

### `src/game/createGame.ts` (controller, attack_strike juice handler)

**Analog:** the `swordSwing` tier in `handleAttackStrike` — the lightest tier and the one
that deliberately SKIPS `spawnShockwave` (a circular wave misreads a non-circular shape —
the same logic applies to the lane; use burst + wake, never shockwave).

**Per-attack juice-tier pattern** (createGame.ts:1338-1355):
```typescript
const juiceColor = ATTACK_RENDER[strike.attackId]?.juiceColor ?? ELEMENTS.geo.color;
if (strike.attackId === 'swordSwing') {
  // Lightest tier: small burst, light shake, whoosh — and NO shockwave
  // (a circular shockwave misreads the swing's cone).
  effectSystem.spawnBurst(landing, juiceColor, SWING_BURST_PARTICLES);
  telegraphSystem.flashStrike(`${strike.unitKind}:${strike.unitId}`);
  shakeMagnitude = Math.max(shakeMagnitude, SWING_SHAKE_MAGNITUDE * juiceFalloff);
  audioSystem.playSwing(juiceFalloff);
  return;
}
```
The distance gate + falloff (:1328-1333, `STRIKE_JUICE_RANGE` + `juiceFalloff`) and the
unconditional `lastStrike` capture (:1315-1321, stun attribution) run BEFORE the tiers —
the dash tier inherits both for free by slotting in as another `if` block before the
default. Shake joins via `Math.max` (never overwrite a stronger shake). Handler-local seed
constants (e.g. `SWING_BURST_PARTICLES`) are NOT parity material (05-02 decision).
Cast point for a dust wake along the lane: not on the event — read the row via
`attackViewClock.getAttackRows()` (already called at :1298) keyed by unitKind/unitId, with
a burst-only fallback if the row misses (RESEARCH Assumption A1).

---

### `src/game/audio/createAudioSystem.ts` (utility, procedural WebAudio SFX)

**Analog:** `playSwing` (:93-134) — the guard clause, gain clamp, noise-through-filter body,
and the small-speaker "thock" layer.

**Procedural SFX pattern** (:93-118, abbreviated):
```typescript
function playSwing(gainFactor = 1) {
  // Never throw mid-frame: silently skip until the gesture unlock has run.
  if (!context || context.state !== 'running') return;
  const level = clampGain(gainFactor);
  if (level === 0) return;
  const now = context.currentTime;
  const seconds = 0.2;
  const noise = createNoiseSource(context, seconds);
  const filter = context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(500, now);
  filter.frequency.exponentialRampToValueAtTime(2200, now + seconds);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.6 * level, now + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
  noise.connect(filter).connect(gain).connect(context.destination);
  noise.start(now);
  noise.stop(now + seconds);
  // + percussive "thock" oscillator layer for small speakers (:123-133)
}
```
`playDash` (shield clang): same skeleton — copy the guard + clampGain + `context.currentTime`
opener verbatim, then a metallic recipe (e.g., high-Q bandpass hit + short detuned
oscillator pair). Register in the `AudioSystem` interface (:10-14) and the return object
(:193-195). Playtest lesson embedded at :100-104: bandpass discards most noise energy, so
peak gains must sit well above the slam's broadband 0.5 to be audible.

---

### Test files (all: new cases in existing files, existing describe style)

**`attackHitbox.test.ts`** — analog: the `resolveCone` describe (:31-68). Copy the
cross-boundary import (:5-9: `from '../../../../spacetimedb/src/attackHitbox'`), the named
constant setup (APEX_X/RANGE/MIN_DOT), and the boundary-test naming convention:
```typescript
it('boundary: is true at EXACTLY range on the aim axis (inclusive <=, matches resolveCircleHit)', () => {
  expect(resolveCone(APEX_X + RANGE, APEX_Z, APEX_X, APEX_Z, 1, 0, RANGE, MIN_DOT)).toBe(true);
});
```
New describes: `closestPointOnSegment` (interior projection / endpoint clamp / zero-length),
`resolveLane` (inside / exact edge / just outside / beside the segment ends / zero-length →
circle degradation), `computeLaneEnd` (overshoot direction+length / zero-length fallback).

**`unitAttackFsm.test.ts`** — analog: the Pitfall-1 gate test (:162-188), which pairs a
positive (leap teleports) with a negative (move:'none' stays planted) in one `it`:
```typescript
it('[STRIKE] with move leap teleports to landing; move none never does (Pitfall 1 gate)', () => {
  const leap = walkAttackTransitions(rowFor('leapSlam'), [ATTACK_STATE_STRIKE], ATTACKS.leapSlam, NOW, TICK, SIZE_INDEX, POS_X, POS_Z);
  expect(leap.teleportToLanding).toBe(true);
  const rooted = walkAttackTransitions(rowFor('swordSwing'), [ATTACK_STATE_STRIKE], ATTACKS.swordSwing, ...);
  expect(rooted.teleportToLanding).toBe(false);
});
```
New cases: charge STRIKE sets the flag + effectiveX/Z = landing; coalesced
[STRIKE, RECOVERY, IDLE] walk relocates once + resolves once + writes the skill cooldown
once; the existing move:'none' negative KEEPS passing (the generalized gate must not break it).

**`attacks.test.ts`** — analogs: the registry-numbers `it` per attack (:17, :40, :52) and the
`selectAttack` describe (:96-133) whose boundary style the Pitfall-1 regression guards copy:
```typescript
it('returns null at d=5 with the skill on cooldown (swing band is 0..3.5, chase sentinel D5-09)', () => { ... });
```
New cases: shieldDash locked numbers; "returns shieldDash at d=6.5 with both cooldowns clear"
(the dead-code guard); "returns leapSlam at d=4.5 with cooldowns clear (overlap priority)";
"returns null at d=6.5 with the skill cooldown active (shared gate blocks BOTH skills, D6-06)".

**`serverSync.test.ts`** — analog: the swirl damage-triple test (:382-388) for the new
explicit assertions; the auto-`it.each` harness (:353-360 tick multiples, :434-437 shape
parity, :457-462 stunSeconds, :467-474 juiceColor palette, :430-432 id-set equality,
:476-484 graceTicks===1) covers the new entry the moment it exists on both sides — no edits
needed for those:
```typescript
it('swordSwirl damage = 2.5x per-size contactDamage -> 225/325/425 (D5-10)', () => {
  expect(
    GOLIATH_SIZE_STATS.map(size =>
      Math.round(size.contactDamage * ATTACKS.swordSwirl.damageMultiplier)
    )
  ).toEqual([225, 325, 425]);
});
```
New explicit assertions (registry-invariants describe, after :388): shieldDash damage triple
[225, 325, 425]; `shape === 'lane'` + `move === 'charge'`; `laneLengthBySize` length ===
`GOLIATH_SIZE_STATS.length` and every value ≤ 8 (comment naming SNAP_DISTANCE — it is not
exported, assert the literal); `radiusBySize` length 3. Also verify `:450-455` (non-cone
entries carry NO coneHalfAngleDegrees) stays green — the lane entry must not author one.

---

## Shared Patterns

### Pure-helper module contract (server)
**Source:** `spacetimedb/src/attackHitbox.ts:1-7`, `unitAttackFsm.ts:1-8`, `attacks.ts:1-9`
**Apply to:** all three server pure siblings this phase touches
Every pure module opens with the same header: dependency-free (pure sibling imports only),
vitest-able across the package boundary, no clock/randomness — timestamps arrive as injected
bigint-micros (CLAUDE.md rule 2). The grep-gate (`Math.random|Date.now` in `spacetimedb/src`
→ empty) is release-blocking; `computeLaneEnd`/`resolveLane`/`closestPointOnSegment` take
plain numbers only.

### Glue-contains-zero-arithmetic contract
**Source:** `spacetimedb/src/unitAttacks.ts:1-8`
**Apply to:** both glue touches (IDLE lane-end call, resolveStrike lane arm)
"This module contains ZERO decision arithmetic of its own — every deadline, selection, hit
test, and displacement comes from attacks/unitAttackFsm/attackHitbox." The lane branches may
branch and pass arguments; all math lives in `attackHitbox.ts`.

### Inclusive-edge + documented-degenerate resolver semantics
**Source:** `attackHitbox.ts:11-13` (circle), :24-31 (cone)
**Apply to:** `resolveLane`
Edges are INCLUSIVE (`<=` / `>=`); every degenerate input (zero-length segment) gets a
documented, tested fallback rather than a NaN.

### Seed-then-tune authoring with decision-ID comments
**Source:** `spacetimedb/src/attacks.ts:51-57` (e.g. "knockback 6 — doubled from 3 after
04-07 local playtest"), `createGoliathRenderer.ts:32-59` (clip seed constants)
**Apply to:** every new number (registry entry, clip constants, juice-tier constants, SFX gains)
Named constants, doc comment carrying the decision ID + "playtest seed" where the user tunes.

### Frost telegraph language constants
**Source:** `createTelegraphSystem.ts:10-35`
**Apply to:** the lane telegraph branch — reuse, never redefine
`TELEGRAPH_COLOR 0x86e2ff`, `RIM_WIDTH 0.3` (≥ 0.2u pixel-filter floor, ANIM-02),
`PROGRESS_RIM_WIDTH 0.22`, `flatMaterial()` (additive, depthTest off, DoubleSide),
`GROUND_EPSILON 0.06`, render orders 999/1000. Timing always re-derived from the row via
`progressFraction` (ANIM-01) — never a client timer.

### Event-driven juice, exactly once
**Source:** `createGame.ts:1306-1312` + the tier structure :1338-1362
**Apply to:** the shieldDash juice tier
`attack_strike` is an event table with ONE subscription; every tier draws from the event's
own coords/radius, gates on `STRIKE_JUICE_RANGE`, scales by `juiceFalloff`, joins shake via
`Math.max`, and returns early.

### Cross-boundary import-and-compare parity testing
**Source:** `serverSync.test.ts:348-352, 424-429`; `attackHitbox.test.ts:3-9`
**Apply to:** all four test files
Tests import the REAL server module into the client vitest runner
(`../../../../spacetimedb/src/...`) — never a re-implementation. Both sides of a parity
assertion derived live, never hardcoded tautologies (:390-402 shows the derived-both-sides
style for the no-one-shot invariant).

## Conditional Carve-Outs (only if the ≤300-LOC rule trips — RESEARCH Pitfall 8)

| New File (conditional) | Trigger | Pattern Source |
|------------------------|---------|----------------|
| `src/game/systems/telegraphShapes.ts` | `createTelegraphSystem.ts` (288 raw lines) crosses 300 functional LOC with the lane branch | Extract the shape construction from `insert()` (:120-154) into `buildCircle/buildCone/buildLane` returning `{outline, progress, fillAxis}`; the factory-module style analog is `src/game/entities/createGoliathModel.ts` usage at `createGoliathRenderer.ts:270` |
| `src/game/systems/goliathAttackClips.ts` | `createGoliathRenderer.ts` (280 raw lines) crosses 300 with `animateDash` | Extract the four `animate*` clip functions taking the rig handles; same-slice carve, not a follow-up (CLAUDE.md) |

Both files, if created, are role: component / data flow: transform, and copy the existing
function bodies verbatim — extraction, not rewrite.

## No Analog Found

None. Every file extends a proven in-file pattern; there is no greenfield surface this phase.

## Metadata

**Analog search scope:** `spacetimedb/src/`, `src/game/systems/`, `src/game/data/`,
`src/game/audio/`, `src/game/createGame.ts`, `src/game/data/__tests__/`
**Files scanned:** 15 read at line level (attacks.ts, attackHitbox.ts, unitAttackFsm.ts,
unitAttacks.ts, bridges.ts:70-104, worldRules.ts, createTelegraphSystem.ts,
createGoliathRenderer.ts, createEntityRenderer.ts:88-105, src/game/data/attacks.ts,
createGame.ts:1280-1375, createAudioSystem.ts:85-140, serverSync.test.ts:340-486,
attackHitbox.test.ts:1-70, unitAttackFsm.test.ts + attacks.test.ts structure via grep)
**Pattern extraction date:** 2026-07-11 (commit `a1b6f1e`)
