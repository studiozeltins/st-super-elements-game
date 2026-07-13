# Phase 5: swordSwing → swordSwirl combo - Pattern Map

**Mapped:** 2026-07-10
**Files analyzed:** 12 new/modified files
**Analogs found:** 11 / 12 (1 partial — cone sector geometry has no in-repo precedent)

All line numbers verified against the working tree this session (branch `alpha-v0.2.0`,
clean at bafa448). Every excerpt below is real code, not paraphrase.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `spacetimedb/src/attacks.ts` (M) | data registry + pure selection fn | batch (per-tick pure calls) | itself — `leapSlam` entry + `selectAttack` (`attacks.ts:41-94`) | exact |
| `spacetimedb/src/attackHitbox.ts` (M: +`resolveCone`) | pure geometry helper | transform (coords in, bool out) | `resolveCircleHit` (`attackHitbox.ts:12-20`) + `isWithinForwardArc` (`goliathAI.ts:69-88`) | exact |
| `spacetimedb/src/unitAttacks.ts` (M: chain swap, move gate, shape branch, per-role cooldown) | server glue (worldTick pass) | event-driven (tick-scheduled state machine) | its own transition walk (`unitAttacks.ts:169-205`) | exact |
| `spacetimedb/src/index.ts` (M: additive column) | schema/config | — | `stunnedUntilMicros` precedent (`index.ts:342-346`) | exact |
| `src/game/data/attacks.ts` (**CREATE**) | client data mirror | static registry (read-only) | `src/game/data/goliathArchetypes.ts` | role-match |
| `src/game/systems/createTelegraphSystem.ts` (M: sector branch + rebuild) | render system | streaming (row-sync + per-frame update) | its own circle `insert`/`syncAttacks` (`createTelegraphSystem.ts:88-205`) | exact (circle) / partial (sector geometry) |
| `src/game/systems/createGoliathRenderer.ts` (M: 2 clips) | render adapter (animation) | streaming (per-frame view) | existing `animateAttack` leapSlam clip (`createGoliathRenderer.ts:100-123`) | exact |
| `src/game/createGame.ts` (M: juice branch) | event handler | event-driven (onInsert) | `handleAttackStrike` (`createGame.ts:1391-1405`) | exact |
| `src/game/audio/createAudioSystem.ts` (M: +swing/+swirl SFX) | audio system | event-driven (fire-and-forget) | `playSlam` (`createAudioSystem.ts:30-71`) | exact |
| `src/game/data/__tests__/attacks.test.ts` (M) | test (pure unit) | request-response | itself (`attacks.test.ts:16-91`) | exact |
| `src/game/data/__tests__/attackHitbox.test.ts` (M) | test (pure unit) | request-response | `resolveCircleHit`/`knockbackDisplacement` blocks (`attackHitbox.test.ts:10-54`) | exact |
| `src/game/data/__tests__/serverSync.test.ts` (M) + `unitAttackFsm.test.ts` (M) | test (parity + FSM) | request-response | `ATTACKS` invariants block (`serverSync.test.ts:350-371`) + `CHARACTER_COMBAT` mirror block (`:329-344`); `enterWindup` block (`unitAttackFsm.test.ts:53-80`) | exact |

`spacetimedb/src/unitAttackFsm.ts` is expected UNCHANGED (verified: `enterWindup` +
`dueAttackTransitions` already serve the chain — see RESEARCH Pattern 1 analysis).

## Pattern Assignments

### `spacetimedb/src/attacks.ts` (data registry, modify)

**Analog:** itself — the `leapSlam` entry IS the template for the two new entries.

**Header/determinism convention** (lines 1-9): dependency-free module, no clock/RNG, every
timestamp an injected bigint — new fields/functions must keep this (the file is imported
cross-boundary by vitest).

**Registry entry pattern** (lines 41-59) — copy field-for-field, with the seed-then-tune
comment style (note the playtest-retune comments on `knockback`/`stunTicks`):
```typescript
export const ATTACKS: Record<string, AttackSpec> = {
  leapSlam: {
    shape: 'circle',
    role: 'skill',
    windupTicks: 8,
    activeTicks: 1,
    graceTicks: 1,
    recoveryTicks: 8,
    cooldownMicros: 3_500_000n,      // ← retune to 5_500_000n (D5-09)
    radiusBySize: [4.0, 4.75, 5.5],
    damageMultiplier: 4.5,
    minBand: 0,
    maxBand: 8,
    knockback: 6, // doubled from 3 after 04-07 local playtest — ...
    stunTicks: 7, // 2 -> 7 (~1.05s) after 04-07 playtest — ...
    move: 'leap',
    poiseThreshold: 600,
  },
};
```
New optional `AttackSpec` fields go on the interface (lines 23-39) as
`chainsInto?: string;` / `coneMinDot?: number;` — OPTIONAL and ABSENT on `leapSlam` so the
`toEqual` literal in `attacks.test.ts:20-37` stays valid. Authored numbers for the two new
entries are locked in CONTEXT D5-06/09/10/11/12/13 (RESEARCH "New ATTACKS entries" example
lines 691-734 has the exact authored shape).

**Selection fn to extend** (lines 76-94) — current 4-arg signature; D5-08 adds
`basicCooldownUntilMicros` between the skill cooldown and `available`:
```typescript
export function selectAttack(
  distance: number,
  nowMicros: bigint,
  cooldownUntilMicros: bigint,
  available: readonly string[]
): string | null {
  let basicInBand: string | null = null;
  for (const attackId of available) {
    const spec = ATTACKS[attackId];
    if (!spec) continue;
    if (distance < spec.minBand || distance > spec.maxBand) continue;
    if (spec.role === 'skill') {
      if (nowMicros >= cooldownUntilMicros) return attackId;
      continue;
    }
    if (basicInBand === null) basicInBand = attackId;   // ← gate on basic cooldown first (D5-08)
  }
  return basicInBand;
}
```
`UNIT_ATTACKS` list change (lines 62-64): `{ default: ['leapSlam'] }` →
`{ default: ['leapSlam', 'swordSwing'] }` (D5-03; swirl NOT listed).

---

### `spacetimedb/src/attackHitbox.ts` (pure geometry, modify — add `resolveCone`)

**Analog A — edge semantics + doc style:** `resolveCircleHit` (`attackHitbox.ts:12-20`):
```typescript
// True when the point (px,pz) lies inside or exactly ON the circle — the edge is
// INCLUSIVE (<=), so a victim standing precisely at radius distance counts hit.
export function resolveCircleHit(
  px: number, pz: number,
  centerX: number, centerZ: number,
  radius: number
): boolean {
  return distanceBetween(px, pz, centerX, centerZ) <= radius;
}
```
`resolveCone` copies this shape: plain coords in, boolean out, inclusive edges, block-comment
explaining edge semantics. The file header (lines 1-7) already promises "cone (Phase 5)
reuses isWithinForwardArc" — update that comment when landing the function (no-dead-code
rule: the promise becomes the code).

**Analog B — the arc test to reuse verbatim:** `isWithinForwardArc` (`goliathAI.ts:69-88`):
```typescript
export function isWithinForwardArc(
  headingX: number, headingZ: number,
  fromX: number, fromZ: number,
  targetX: number, targetZ: number,
  minDot: number
): boolean {
  const headingLength = Math.hypot(headingX, headingZ);
  if (headingLength < 1e-6) return true;      // no facing info → 360° (degenerate aim)
  const directionX = targetX - fromX;
  const directionZ = targetZ - fromZ;
  const directionLength = Math.hypot(directionX, directionZ);
  if (directionLength < 1e-6) return true;    // target ON the apex → point-blank hit
  const dot =
    (headingX / headingLength) * (directionX / directionLength) +
    (headingZ / headingLength) * (directionZ / directionLength);
  return dot >= minDot;                        // inclusive arc edge
}
```
`resolveCone(px, pz, apexX, apexZ, aimX, aimZ, range, minDot)` =
`distanceBetween(px,pz,apexX,apexZ) <= range && isWithinForwardArc(aimX, aimZ, apexX, apexZ, px, pz, minDot)`
(aim vector NOT normalized — the arc test normalizes; RESEARCH Pattern 2 has the exact
authored form). Import: `attackHitbox.ts` already imports one pure sibling
(`import { distanceBetween } from './combatMath'` at line 7) — add
`import { isWithinForwardArc } from './goliathAI'` in the same style.

---

### `spacetimedb/src/unitAttacks.ts` (server glue, modify)

**Analog:** its own transition walk — the four insertion points, all verified:

**1. Lazy-upsert row literal MUST gain the new column** (`unitAttacks.ts:27-46`, Pitfall 5 —
the row is `any`-typed; a miss only surfaces at runtime publish):
```typescript
function idleAttackRow(unitKind: number, unitId: bigint) {
  return {
    id: 0n,
    unitKind,
    unitId,
    state: ATTACK_STATE_IDLE,
    attackId: '',
    ...
    cooldownUntilMicros: 0n,
    // ← ADD basicCooldownUntilMicros: 0n here (same slice as the schema change)
    ...
    strikeResolved: false,
    poise: 0,
  };
}
```

**2. Shape branch replaces the hardcoded circle in `resolveStrike`** (`unitAttacks.ts:68-88`).
Current hit test + knockback center (BOTH circle-hardcoded — Pitfall 4):
```typescript
for (const [hex, snapshot] of playerByHex) {
  const victim = ctx.db.player.identity.find(snapshot.identity);
  if (!victim || isInsideSafeZone(victim.positionX, victim.positionZ)) continue;
  if (!resolveCircleHit(victim.positionX, victim.positionZ, row.landingX, row.landingZ, row.radius)) continue;
  playerDamage.set(hex, (playerDamage.get(hex) ?? 0) + goliathRow.contactDamage * spec.damageMultiplier);
  const pushed = knockbackDisplacement(
    victim.positionX, victim.positionZ,
    row.landingX, row.landingZ,        // ← knockback center: cast for cones, landing for circles
    spec.knockback, heading.x, heading.z
  );
  ctx.db.player.identity.update({
    ...victim,
    positionX: clampToWorld(pushed.x),
    positionZ: clampToWorld(pushed.z),
    stunnedUntilMicros: stunDeadline(now, spec.stunTicks, tick),
  });
}
```
Cone branch: `resolveCone(victim.positionX, victim.positionZ, row.castX, row.castZ,
row.landingX - row.castX, row.landingZ - row.castZ, row.radius, spec.coneMinDot ?? 0.5)`;
knockback center = `row.castX/Z` for cones (swing seeds knockback 0 so inert this phase —
author correctly anyway).

**3. The transition walk — move gate, chain swap + break, per-role cooldown**
(`unitAttacks.ts:178-204`). Current code, with the three change points marked:
```typescript
for (const nextState of transitions) {
  if (nextState === ATTACK_STATE_STRIKE) {
    // ← GATE on spec.move === 'leap' (Pitfall 1: this line currently teleports EVERY attack)
    goliathPosition.set(goliathRow.goliathId, { x: row.landingX, z: row.landingZ });
    ctx.db.attackStrike.insert({          // UNCONDITIONAL emission — keep before victim branching
      unitKind: row.unitKind,
      unitId: row.unitId,
      attackId: row.attackId,
      landingX: row.landingX,
      landingZ: row.landingZ,
      radius: row.radius,
    });
    row = { ...row, state: ATTACK_STATE_STRIKE };
  } else if (nextState === ATTACK_STATE_RECOVERY) {
    if (!row.strikeResolved) {
      const heading = goliathHeading.get(goliathRow.goliathId) ?? { x: goliathRow.headingX, z: goliathRow.headingZ };
      resolveStrike(ctx, now, tick, goliathRow, row, spec, heading, playerByHex, playerDamage);
    }
    // ← CHAIN SWAP here (after resolve, before RECOVERY write): if spec.chainsInto,
    //   row = { ...row, ...enterWindup(now, tick, chained, sizeIndex, pos.x, pos.z, pos.x, pos.z),
    //           attackId: spec.chainsInto } then BREAK (Pitfall 2 — the stale IDLE step
    //   in a coalesced [STRIKE, RECOVERY, IDLE] list would stomp the fresh windup).
    row = { ...row, state: ATTACK_STATE_RECOVERY, strikeResolved: true };
  } else {
    // ← PER-ROLE SPLIT (D5-08): 'basic' role → basicCooldownUntilMicros, 'skill' → this field.
    row = { ...row, state: ATTACK_STATE_IDLE, cooldownUntilMicros: now + spec.cooldownMicros };
  }
}
if (transitions.length > 0) attackTable.id.update(row);
```

**4. `selectAttack` call site gains the 5th arg** (`unitAttacks.ts:133-138`):
```typescript
const attackId = selectAttack(
  distanceBetween(from.x, from.z, target.positionX, target.positionZ),
  now,
  row.cooldownUntilMicros,
  // ← insert row.basicCooldownUntilMicros here
  UNIT_ATTACKS[UNIT_KIND_GOLIATH].default
);
```

**Chain windup-entry pattern:** copy the IDLE-branch `enterWindup` call
(`unitAttacks.ts:142-152`) — for the chain, cast AND target are both the goliath's current
position (D5-04 self-centered swirl), read from
`goliathPosition.get(goliathRow.goliathId)` with the `?? { x: goliathRow.positionX, ... }`
fallback used at line 132.

File is 207 lines — the additions fit under 300; pre-authorize extracting `resolveStrike`
to a sibling `unitStrike.ts` if it crosses (RESEARCH Open Question 1).

---

### `spacetimedb/src/index.ts` (schema, modify — one additive column)

**Analog:** the `stunnedUntilMicros` precedent — additive `.default(0n)` u64 appended LAST
to a populated table (`index.ts:342-346`):
```typescript
    // Slam-victim stun window (HIT-01/D4-10): updatePosition rejects client
    // positions while now < this, so the server owns the knocked-back position
    // for the whole stun. Appended LAST with .default(0n) so the additive
    // migrate backfills populated rows without a wipe (Pitfall 2).
    stunnedUntilMicros: t.u64().default(0n),
```
Copy verbatim style for `basicCooldownUntilMicros: t.u64().default(0n)` appended LAST inside
the `unit_attack` table (`index.ts:454-480`; current last fields are `strikeResolved: t.bool(),
poise: t.u32()`). Note the default literal is `0n` (bigint), not `0`.
`attack_strike` (`index.ts:637-647`) already carries `attackId: t.string()` — NO change.

Deploy: `spacetime publish 2d-impact-game-fr9ti --module-path spacetimedb --server local --yes`
→ `pnpm run spacetime:generate` → `pnpm build`. NO maincloud (self-host pivot).

---

### `src/game/data/attacks.ts` (NEW — client mirror)

**Analog:** `src/game/data/goliathArchetypes.ts` — the established client data-module shape:
doc comment naming the server source of truth + the parity test that guards it, exported
interface, exported const registry:
```typescript
// Source: goliathArchetypes.ts:1-28 (analog for module shape)
// baseGems is sourced from gemRewards.goliathBaseGems so the payout never drifts
// from the server (spacetimedb/src/index.ts), enforced by serverSync.test.ts.

export interface GoliathArchetype {
  sizeIndex: GoliathSizeIndex;
  displayName: string;
  ...
}

export const GOLIATH_ARCHETYPES_BY_SIZE: readonly GoliathArchetype[] = [ ... ];
```
The new mirror is keyed by `attackId` (Record, not array) — RESEARCH lines 764-780 has the
authored shape (`ATTACK_RENDER: Record<string, AttackRenderSpec>` with
`shape: 'circle' | 'cone'` + `coneHalfAngleDegrees?: number`). Keep juice magnitudes as
constants in the `createGame.ts` handler, not parity material (RESEARCH Open Question 2
recommendation). Unknown attackId at the consumer → default to circle (back-compat with rows
written before the client updates).

---

### `src/game/systems/createTelegraphSystem.ts` (render system, modify)

**Analog:** its own circle recipe — the sector variant copies material, rotation, ordering,
and anchoring exactly.

**Material + render-order recipe to reuse for BOTH sector meshes**
(`createTelegraphSystem.ts:67-78` + constants 10-34):
```typescript
function flatMaterial(opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: TELEGRAPH_COLOR,          // 0x86e2ff (Frost)
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
}
```

**Circle insert pattern** (`createTelegraphSystem.ts:88-139`) — outline instant at windup
entry, progress mesh built at FULL size then `scale.setScalar(0.0001)` and scaled 0→1 over
the windup (fill-is-countdown), `rotation.x = -Math.PI / 2`, renderOrder 1000/999, group
positioned ONCE at the locked point with `getGroundHeight(...) + GROUND_EPSILON`:
```typescript
const outline = new THREE.Mesh(
  new THREE.RingGeometry(row.radius - RIM_WIDTH, row.radius, RING_SEGMENTS),
  outlineMaterial
);
outline.rotation.x = -Math.PI / 2;
outline.renderOrder = OUTLINE_RENDER_ORDER;
const progress = new THREE.Mesh(
  new THREE.RingGeometry(Math.max(0.001, row.radius - PROGRESS_RIM_WIDTH), row.radius, RING_SEGMENTS),
  flatMaterial(PROGRESS_OPACITY)
);
progress.scale.setScalar(0.0001); // starts empty; never exactly 0 (degenerate matrix)
group.position.set(row.landingX, getGroundHeight(row.landingX, row.landingZ) + GROUND_EPSILON, row.landingZ);
```
Sector variant: same recipe, 6-arg `RingGeometry(inner, outer, RING_SEGMENTS, 1,
-fullAngle/2, fullAngle)`, group at `castX/Z` (apex, not landing), plus
`group.rotation.y = Math.atan2(-(row.landingZ - row.castZ), row.landingX - row.castX)`
(yaw sign is DERIVED, not visually verified — RESEARCH assumption A1; mandate the
04-04-style pixel-filter visual check). Progress = near-zero-inner filled sector scaled
from the apex.

**Re-anchor branch that MUST become rebuild-aware** (`createTelegraphSystem.ts:177-187`,
Pitfall 3 — the chain arrives on the SAME key with a different shape):
```typescript
// A fresh cast (new startedAt) re-anchors timing and re-locks the landing.
if (row.state === ATTACK_STATE_WINDUP && row.startedAtMicros !== existing.startedAtMicros) {
  existing.arrivalPerfMs = performance.now();
  existing.startedAtMicros = row.startedAtMicros;
  existing.windupDurationMicros = row.strikeAtMicros - row.startedAtMicros;
  existing.group.position.set(row.landingX, ..., row.landingZ);
}
```
Pattern: add `attackId` to `ActiveTelegraph` (interface at lines 36-53); when
`row.attackId !== existing.attackId` → `remove(key, existing)` (`:147-151` — already
disposes via `disposeObject`) then `telegraphs.set(key, insert(row))`. Keep the
startedAt re-anchor for same-attack re-casts.

**Progress technique** (`createTelegraphSystem.ts:212-217`): `update()` scales the progress
mesh by `progressFraction` while state is WINDUP — a scaled filled sector expands from the
apex for free (the group origin IS the apex). No new timing code.

---

### `src/game/systems/createGoliathRenderer.ts` (animation clips, modify)

**Analog:** the existing leapSlam clip body + the neutral-restore contract.

**Rig access + restore contract** (`createGoliathRenderer.ts:36-60, 81-93`):
```typescript
const leftArm = model.group.getObjectByName('leftArm') ?? null;
const rightArm = model.group.getObjectByName('rightArm') ?? null;
const head = model.group.getObjectByName('head') ?? null;
...
animateMovement(elapsedSeconds, isMoving) {
  // Neutral attack-pose restore: animateAttack (when a view is live) runs
  // AFTER this each frame and re-poses, so a vanished view ... can never
  // leave a squashed silhouette behind.
  applyCrouch(0);
  ...
  if (rightArm) rightArm.rotation.x = -legSwing;   // arm rotation.x is RE-WRITTEN every frame
  if (leftArm) leftArm.rotation.x = legSwing;      // — the model for restoring new transforms
```
New clips that touch arm rotations other than `.x`, or a torso/body yaw, MUST extend the
restore in `animateMovement` AND `animateDeath` (`:95-99` calls `applyCrouch(0)` too) —
Pitfall 10. Swirl spin rotates `model.body` (or a torso node), NEVER `model.group`
(renderer owns group rotation via lookAt).

**Clip phase structure to copy** (`createGoliathRenderer.ts:100-123`) — branch on
`view.phase`, drive everything from `view.phaseProgress` (0..1, server-derived):
```typescript
animateAttack(view) {
  if (view.phase === 'windup') {
    applyCrouch(view.phaseProgress * view.phaseProgress);  // ease-in via progress²
    return;
  }
  ...
  if (view.phase === 'strike') { ... return; }
  // Recovery: eased settle — const settle = 1 - (1 - view.phaseProgress) ** 2;
}
```
Branch dispatcher: `view.attackId === 'swordSwing'` / `'swordSwirl'` / else the existing
slam body (RESEARCH Pattern 5). `travelFraction` (`:70-78`) is leap-specific — do NOT use
it for `move:'none'` clips; use `view.phaseProgress` only. `AttackAnimationView` already
carries `attackId` (`createEntityRenderer.ts:15-26`) and is already populated
(`createGame.ts:388-397`) — zero interface change. Hook stays optional
(`createEntityRenderer.ts:40`) — camp enemies compile unchanged.

---

### `src/game/createGame.ts` (strike juice, modify)

**Analog:** the existing full-juice handler (`createGame.ts:1391-1405`) — branch it by
`strike.attackId`, slam keeps this exact body:
```typescript
handleAttackStrike(strike) {
  // D4-15 full strike juice — every component fires exactly ONCE per event
  // (the App.tsx useTable hook is this event table's ONLY subscription).
  const groundY = world.getGroundHeight(strike.landingX, strike.landingZ);
  const landing = new THREE.Vector3(strike.landingX, groundY + 0.05, strike.landingZ);
  lastStrike = { x: strike.landingX, z: strike.landingZ, radius: strike.radius, atMs: performance.now() };
  effectSystem.spawnBurst(landing, 0x86e2ff, 26);
  effectSystem.spawnShockwave(landing, strike.radius, 0x86e2ff);
  telegraphSystem.flashStrike(`${strike.unitKind}:${strike.unitId}`);
  shakeMagnitude = SHAKE_START_MAGNITUDE;
  audioSystem.playSlam();
}
```
Per-attack variants (Claude's discretion, both SMALLER than slam; swing lightest, no
shockwave — a circle shockwave misreads a cone). The chain's timing re-anchor is already
free: `syncAttackTimings` re-bases on `startedAtMicros` change (`createGame.ts:324-337`).
No `App.tsx` change — the event hook already passes `strike` through (single subscription).

---

### `src/game/audio/createAudioSystem.ts` (SFX, modify)

**Analog:** `playSlam` (`createAudioSystem.ts:30-71`) — the complete procedural recipe:
running-context guard, oscillator sweep + gain envelope, filtered-noise burst:
```typescript
function playSlam() {
  // Never throw mid-frame: silently skip until the gesture unlock has run.
  if (!context || context.state !== 'running') return;
  const now = context.currentTime;
  const thump = context.createOscillator();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(70, now);
  thump.frequency.exponentialRampToValueAtTime(40, now + 0.25);
  const thumpGain = context.createGain();
  thumpGain.gain.setValueAtTime(0.0001, now);
  thumpGain.gain.exponentialRampToValueAtTime(0.8, now + 0.01);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
  thump.connect(thumpGain).connect(context.destination);
  thump.start(now); thump.stop(now + 0.4);
  // + lowpass-filtered white-noise burst (lines 49-70)
}
```
Swing whoosh = short bandpassed noise sweep; swirl = longer swell + low thump (RESEARCH
Pattern 6). Add methods to the `AudioSystem` interface (lines 6-10) alongside `playSlam`.
File is 82 lines — plenty of headroom.

---

### Test files (all modify — same cross-boundary import pattern)

**Pure-helper import pattern** (every attack test file, e.g. `attackHitbox.test.ts:1-8`):
```typescript
// Import the real resolvers across the package boundary (server module → client
// vitest runner), same mechanism as crit.test.ts — not a local re-implementation.
import { knockbackDisplacement, resolveCircleHit } from '../../../../spacetimedb/src/attackHitbox';
```

**Literals that MUST be updated in-slice** (Pitfall 7):
- `attacks.test.ts:20-37` — `toEqual` literal includes `cooldownMicros: 3_500_000n` → 5.5s.
  Keep new `AttackSpec` fields ABSENT on leapSlam or this breaks.
- `attacks.test.ts:51` — `expect(UNIT_ATTACKS[UNIT_KIND_GOLIATH].default).toEqual(['leapSlam'])`
  → `['leapSlam', 'swordSwing']`.
- `attacks.test.ts:72-90` — all four `selectAttack` calls use the 4-arg signature → 5-arg.

**Boundary-test style to copy** (`attacks.test.ts:84-86`, `attackHitbox.test.ts:15-18`):
every inclusive edge gets an exact-boundary assertion
(`nowMicros exactly equal ... is OFF cooldown (>=, not >)`; `exactly ON the radius edge`).
`resolveCone` tests follow the `resolveCircleHit` describe block: inside / boundary /
outside / degenerate (apex, zero-aim) — plus arc-specific side/back escape cases.

**Coalesced-tick / chain test analog** (`unitAttackFsm.test.ts:22-24, 53-80`): injected
`TICK = 150_000n`, `NOW = 1_000_000_000n`, assert `enterWindup` field-by-field. The chain
glue test seam is a Wave-0 decision (RESEARCH: extract a pure helper, e.g.
`nextAfterStrike(spec)` or a pure transition-applier, tested here).

**serverSync parity extension analogs** (`serverSync.test.ts`):
- Damage arithmetic assertion (`:360-366`):
  ```typescript
  it('leapSlam damage = 4.5x per-size contactDamage -> 405/585/765 (D4-04)', () => {
    expect(
      GOLIATH_SIZE_STATS.map(size => Math.round(size.contactDamage * ATTACKS.leapSlam.damageMultiplier))
    ).toEqual([405, 585, 765]);
  });
  ```
  Copy for swing (135/195/255) and swirl (225/325/425) + the no-one-shot live invariant
  (`max chain damage < min(CHARACTERS maxHealth)` — min is 900/zefs; RESEARCH lines 750-756).
- Mirror-key parity analog (`:329-344`, the `CHARACTER_COMBAT` block):
  ```typescript
  it('contains exactly the same character ids', () => {
    expect(Object.keys(CHARACTER_COMBAT).sort()).toEqual(Object.keys(CHARACTERS).sort());
  });
  ```
  Copy for `ATTACK_RENDER` keys vs `Object.keys(ATTACKS)`, shape vs `spec.shape`, and
  `Math.cos(degToRad(coneHalfAngleDegrees)) ≈ spec.coneMinDot`.
- The `it.each(Object.entries(ATTACKS))` tick-invariant block (`:351-358`) auto-covers new
  entries — no change needed for that part. Add: chainsInto resolves + terminates (no
  cycles); swirl not in `UNIT_ATTACKS` default (D5-03).

## Shared Patterns

### Injected-clock determinism (all server files)
**Source:** `spacetimedb/src/unitAttackFsm.ts:1-8`, `attacks.ts:1-5`
Every new server function takes `now: bigint` / `tick: bigint` arguments — never samples a
clock, never uses `Math.random`/`Date.now` (grep-gated). Pure modules stay dependency-free
(pure sibling imports only) so vitest imports them cross-boundary.

### Frost telegraph/VFX language (all client visual work)
**Source:** `createTelegraphSystem.ts:9-34, 67-78`
Icy-cyan `0x86e2ff`, additive blending, `depthTest: false` + high renderOrder, `RIM_WIDTH
>= 0.2u` so shapes survive the 440px pixel buffer at max pixelation (ANIM-02), timing
ALWAYS re-derived from the server row via arrival anchor (ANIM-01) — never a free-running
client timer.

### Additive migrate discipline (schema change)
**Source:** `index.ts:342-346` (+ `:333-341` precedents)
New column appended LAST with `.default(0n)`; comment explains WHY (backfill on populated
table, no wipe). Verify on the MIGRATED local DB, never a fresh seed. Update every
hand-built row literal (`idleAttackRow`) in the same slice.

### Unconditional event emission (strike path)
**Source:** `unitAttacks.ts:179-192`
`attack_strike` inserts at the transition, BEFORE any victim branching (Phase-2 lesson) —
holds for swing's whiff-into-chain too.

### Seed-then-tune data authoring
**Source:** `attacks.ts:54-55` (knockback/stun retune comments)
Every gameplay number is `ATTACKS` data with a comment citing the decision (D5-xx) and
marking it a playtest seed — Phase-4 doubled/tripled reactions after feel testing; expect
the same pass here.

## No Analog Found

| File/Concern | Role | Data Flow | Reason |
|------|------|-----------|--------|
| Cone SECTOR mesh (6-arg `RingGeometry` thetaStart/thetaLength + group yaw) | render geometry | — | Codebase only uses 3-arg full-ring `RingGeometry` (`createTelegraphSystem.ts:94, 104`). RESEARCH Pattern 4 supplies the derived construction; yaw sign convention is assumption A1 (MEDIUM) — plan MUST include the 04-04-style pixel-filter visual verification |
| Chain-glue coalesced-tick test seam | test harness | — | No existing glue-level test (all attack tests are pure-helper). Wave-0 decision per RESEARCH: extract a pure helper (favored by pure-helper-testing-discipline memory) |

## Metadata

**Analog search scope:** `spacetimedb/src/` (attacks, attackHitbox, unitAttackFsm,
unitAttacks, goliathAI, index), `src/game/systems/`, `src/game/data/` (+ `__tests__`),
`src/game/audio/`, `src/game/createGame.ts`, `src/game/systems/createEntityRenderer.ts`
**Files scanned:** 16 read this session (all seams named in CONTEXT/RESEARCH verified)
**Pattern extraction date:** 2026-07-10
