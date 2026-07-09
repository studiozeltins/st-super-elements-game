# Phase 4: Attack state machine + leapSlam end-to-end + delete goliath drain - Pattern Map

**Mapped:** 2026-07-09
**Files analyzed:** 14 new/modified files
**Analogs found:** 13 / 14 (audio system is greenfield — no analog exists)

All line numbers verified against the working tree this session (branch `alpha-v0.2.0`).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `spacetimedb/src/attacks.ts` (new) | config/registry + pure selection fn | transform (data-driven lookup) | `spacetimedb/src/enemyStats.ts` (registry) + `spacetimedb/src/goliathAI.ts` (selection fn) | exact |
| `spacetimedb/src/unitAttackFsm.ts` (new) | utility (pure FSM math) | transform | `spacetimedb/src/crit.ts` + `spacetimedb/src/combatMath.ts` | exact |
| `spacetimedb/src/attackHitbox.ts` (new) | utility (pure geometry) | transform | `spacetimedb/src/combatMath.ts` + `goliathAI.ts` | exact |
| `spacetimedb/src/unitAttacks.ts` (new) | service (reducer-side glue) | batch (per-tick pass) | `worldTick` passes in `spacetimedb/src/index.ts:2996–3190, 3296–3379` | exact |
| `spacetimedb/src/index.ts` (modified) | model + reducer host | event-driven (scheduled tick) | itself — `enemyHit` table, `characterActivation` index, appended `.default()` columns, `updatePosition` | exact |
| `src/game/systems/createTelegraphSystem.ts` (new) | component (render system) | streaming (rows → meshes) | `createEffectSystem.ts` (factory + ring idiom) + `createEntityRenderer.ts` `syncRows` (reconcile) | role-match |
| `src/game/systems/createEntityRenderer.ts` (modified) | component | streaming | itself (`EntityAnimation`, `update()`) | exact |
| `src/game/systems/createGoliathRenderer.ts` (modified) | component | streaming | itself (`createGoliathAnimation`) | exact |
| `src/game/audio/createAudioSystem.ts` (new) | component (audio) | event-driven | **NO ANALOG** (no audio code in `src/`); copy the `createX(deps) → interface` factory convention from `createEffectSystem.ts` | none (convention only) |
| `src/game/createGame.ts` (modified) | orchestrator | streaming + request-response | itself (`syncGoliaths` handle, `updateLocalPlayer`, `syncPositionToServer`, `updateCamera`) | exact |
| `src/App.tsx` (modified) | component (subscription wiring) | pub-sub | itself (manual subscribe list + `enemyHit` useTable) | exact |
| `src/game/data/__tests__/attacks.test.ts` (new) | test | — | `crit.test.ts` + `serverSync.test.ts` | exact |
| `src/game/data/__tests__/unitAttackFsm.test.ts`, `attackHitbox.test.ts` (new) | test | — | `crit.test.ts` | exact |
| `src/game/data/__tests__/serverSync.test.ts` (extend) | test | — | itself (cross-boundary import block) | exact |

## Pattern Assignments

### `spacetimedb/src/attacks.ts` (config/registry + selection fn, transform)

**Analogs:** `spacetimedb/src/enemyStats.ts` (per-size stat registry) + `spacetimedb/src/goliathAI.ts` (pure selection fn with doc-comment contract)

**Registry pattern** (enemyStats.ts:59–74) — interface + `readonly` array/record of plain data, mirror-comment pointing at the client counterpart:
```typescript
export interface GoliathSizeStat {
  maxHealth: number;
  contactDamage: number;
  moveSpeed: number;
  collisionRadius: number;
  splashesOnAttack: boolean;
}

// Mirrors GOLIATH_ARCHETYPES_BY_SIZE in src/game/data/goliathArchetypes.ts.
export const GOLIATH_SIZE_STATS: readonly GoliathSizeStat[] = [
  { maxHealth: 15600, contactDamage: 90, moveSpeed: 3.2, collisionRadius: 0.8, splashesOnAttack: false },
  { maxHealth: 25200, contactDamage: 130, moveSpeed: 2.7, collisionRadius: 1.0, splashesOnAttack: false },
  { maxHealth: 39000, contactDamage: 170, moveSpeed: 2.2, collisionRadius: 1.3, splashesOnAttack: true },
];
```
`ATTACKS.leapSlam.radiusBySize: [4.0, 4.75, 5.5]` follows this exact per-size-index array shape (D4-05); `damageMultiplier: 4.5 × GOLIATH_SIZE_STATS[i].contactDamage → 405/585/765` (D4-04). RESEARCH §Code Examples has the full field list (shape, role, windupTicks 8, graceTicks 1, recoveryTicks 8, cooldownMicros 3_500_000n, knockback 3, stunTicks 2, move, poiseThreshold, minBand 0, maxBand ~8).

**Selection-fn pattern** (goliathAI.ts:20–39) — behavior contract spelled out in the header comment, plain args in / plain value out, sentinel for "nothing":
```typescript
// Picks a STABLE camp for a goliath to raid so it stops flip-flopping between
// near-equidistant camps every tick:
//   - keep the current target while it is still a living camp (livingCount > 0);
//   - otherwise pick the NEAREST living camp, excluding the one it just raided ...
//   - no living camp → -1 (stand still / roam).
export function chooseGoliathTargetCamp(
  currentTargetCampIndex: number,
  lastRaidedCampIndex: number,
  campCenters: GoliathTargetCamp[],
  goliathX: number,
  goliathZ: number
): number {
  const living = campCenters.filter(camp => camp.livingCount > 0);
  if (living.length === 0) return -1;
  ...
}
```
`selectAttack(distance, nowMicros, cooldownUntilMicros, available): string | null` copies this style: doc-comment states the D4-08 rhythm rule (skill in band + off cooldown → skill; else basic in band; else null), `null` = chase.

**Zero-import discipline:** `attacks.ts` must be import-free (grep-gate: no `Math.random`/`Date.now`/`import`/`ctx` tokens — phrase comments around them, per crit.ts header discipline below). Note goliathAI.ts imports `distanceBetween` — that's fine for `attackHitbox.ts` too (pure→pure sibling import is established), but the registry itself needs none.

---

### `spacetimedb/src/unitAttackFsm.ts` (pure FSM math, transform)

**Analog:** `spacetimedb/src/crit.ts` (header discipline + injected determinism) and `spacetimedb/src/combatMath.ts` (micros/tick arithmetic)

**Header pattern** (crit.ts:1–7) — copy this comment style verbatim (it doubles as the grep-gate workaround):
```typescript
// Pure crit-roll decision, kept dependency-free so it can be unit-tested directly
// under the client's vitest runner (same pattern as deathPenalty.ts / combatMath.ts).
// Zero dependencies, no global randomness, no wall-clock time — the randomness is
// INJECTED as the `rng` thunk, which preserves the calling reducer's determinism
// (CLAUDE.md rule 2).
```

**Micros arithmetic pattern** (combatMath.ts:6–13) — bigint micros in, plain result out, caller injects the tick:
```typescript
export function damagePerTick(damagePerSecond: number, tickMicros: bigint): number {
  return damagePerSecond * (Number(tickMicros) / 1_000_000);
}
export function windowBucketFor(nowMicros: bigint, windowMicros: bigint): bigint {
  return nowMicros / windowMicros;
}
```
FSM deadlines follow: `strikeDeadline(startedAtMicros, windupTicks, tickMicros) = startedAtMicros + BigInt(windupTicks) * tickMicros`; every transition is `now >= deadline` (never `===` — FSM-05 late-tick resolution). Required test: a `now` that jumped two intervals still fires exactly once.

---

### `spacetimedb/src/attackHitbox.ts` (pure geometry, transform)

**Analog:** `spacetimedb/src/combatMath.ts` + `spacetimedb/src/goliathAI.ts`

**Circle test** — do not write new geometry; the resolver IS `distanceBetween` (combatMath.ts:16–18):
```typescript
export function distanceBetween(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}
```
`resolveCircleHit = distanceBetween(px, pz, landingX, landingZ) <= radius`. Cone (Phase 5) reuses `isWithinForwardArc` (goliathAI.ts:69–88) — stub signatures only this phase (ATK-06).

**Zero-vector fallback pattern** (goliathAI.ts:44–57) — the exact branch shape for knockback direction when the victim stands on the landing center (RESEARCH Pattern 5 edge case):
```typescript
export function headingFromStep(fromX, fromZ, toX, toZ, previousHeadingX, previousHeadingZ) {
  const deltaX = toX - fromX;
  const deltaZ = toZ - fromZ;
  const distance = Math.hypot(deltaX, deltaZ);
  if (distance === 0) return { x: previousHeadingX, z: previousHeadingZ }; // ← fallback branch, test it
  return { x: deltaX / distance, z: deltaZ / distance };
}
```
Knockback displacement math (normalize `victim − landing`, scale by `knockback`, fallback to goliath heading on zero length) lives here and is unit-tested like this function.

---

### `spacetimedb/src/unitAttacks.ts` (reducer-side glue, batch per-tick)

**Analog:** `worldTick` pass structure, `spacetimedb/src/index.ts`

**`now`/`tick` sampling + map building** (index.ts:2941–2957) — sample once, build lookup maps, iterate the UNIT table:
```typescript
const now = ctx.timestamp.microsSinceUnixEpoch;
const tick = WORLD_TICK_INTERVAL_MICROS;
...
const goliaths = [...ctx.db.goliath.iter()].filter(goliathRow => goliathRow.alive);
const players = [...ctx.db.player.iter()].filter(playerRow => playerRow.online);
const playerByHex = new Map<string, any>();
for (const playerRow of players) playerByHex.set(playerRow.identity.toHexString(), playerRow);
```

**Damage-map accumulation pattern** (index.ts:3159–3176, pass 4) — strikes write into the SAME `playerDamage` map (hex → raw amount), never a new apply path:
```typescript
const playerDamage = new Map<string, number>();
...
playerDamage.set(hex, (playerDamage.get(hex) ?? 0) + damagePerTick(enemyRow.contactDamage, tick));
```
`runUnitAttacks(ctx, now, tick, goliaths, goliathPosition, goliathHeading, playerByHex, playerDamage)` is called between the position-build passes and the apply loops; it mutates `goliathPosition`/`goliathHeading` map entries for root/leap (D4-12) — the existing goliath apply loop (index.ts:3296–3336) persists them for free.

**Safe-zone + lazy find-or-insert:** copy the guard `isInsideSafeZone(chased.positionX, chased.positionZ)` from the deleted drain block (index.ts:3186) into strike resolution. Lazy row upsert uses the multi-column-index filter idiom (see index.ts §below).

---

### `spacetimedb/src/index.ts` (modified: 2 tables, 1 column, 1 guard, 1 call, 1 deletion)

**Analog:** itself — five precise seams.

**1. `unit_attack` table — multi-column btree index** (copy `characterActivation`, index.ts:467–479, incl. the "SEPARATE table = no migration/wipe" rationale comment style):
```typescript
const characterActivation = table(
  {
    name: 'character_activation',
    public: true,
    indexes: [{ accessor: 'by_owner_character', algorithm: 'btree', columns: ['owner', 'characterId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity().index('btree'),
    characterId: t.string(),
    activatedConstellation: t.u32(),
  }
);
```
`unit_attack` uses `indexes: [{ accessor: 'by_unit', algorithm: 'btree', columns: ['unitKind', 'unitId'] }]`; lookup: `[...ctx.db.unitAttack.by_unit.filter([UNIT_KIND_GOLIATH, goliathRow.goliathId])][0]`. New table → no `.default()` needed on its columns. Full column list in RESEARCH Pattern 1 (state u32, attackId, startedAt/strikeAt/recoveryEndsAt/cooldownUntil micros, landingX/Z, radius, castX/Z, strikeResolved, poise).

**2. `attack_strike` event table** (copy `enemyHit`, index.ts:570–582 — including the "Event-only: rows are never stored, one insert per..." comment):
```typescript
// Broadcasts one landed enemy/goliath hit with the SERVER-authoritative amount +
// crit bit (CRIT-05). Event-only: rows are never stored, one insert per surviving
// hit so the attacker's client can float the authoritative number in Plan 03.
const enemyHit = table(
  { name: 'enemy_hit', public: true, event: true },
  {
    attacker: t.identity(),
    positionX: t.f32(),
    positionZ: t.f32(),
    amount: t.u32(),
    isCrit: t.bool(),
  }
);
```
`attack_strike`: `{ name: 'attack_strike', public: true, event: true }` with `unitKind, unitId, attackId, landingX, landingZ, radius` — ONE insert per strike, emitted unconditionally at the strike transition (Phase-2 "guarded event emission" lesson: emit first, THEN branch victim bookkeeping).

**3. `player.stunnedUntilMicros` column — appended LAST with `.default(0n)`** (copy player table tail, index.ts:336–341, incl. the migrate-rationale comment):
```typescript
    // Authoritative skill cooldown state (CRIT-02 / D2-03). skillReadyAtMicros gates
    // the next castSkill; skillWindowEndsAtMicros is the deadline through which an
    // isSkill hit earns the uncapped skill multiplier. Both .default(0n) so the
    // additive migrate backfills populated rows without a wipe (Pitfall 2).
    skillReadyAtMicros: t.u64().default(0n),
    skillWindowEndsAtMicros: t.u64().default(0n),
```
**Insert-type tax (Phase-2 trap):** every `ctx.db.player.insert(...)` call site must supply the new field — grep ALL of them including `restorePlayers` before calling the slice done.

**4. `updatePosition` stun guard** — copy the puppet early-return shape (index.ts:1069–1071); the stun guard is one more line in the same position:
```typescript
const currentPlayer = requirePlayer(ctx);
// A puppet (training dummy) is server-driven — ignore its client's position.
if (ctx.db.puppet.identity.find(currentPlayer.identity)) return;
// NEW (same shape): if (ctx.timestamp.microsSinceUnixEpoch < currentPlayer.stunnedUntilMicros) return;
```

**5. Contact-drain DELETION** — the exact block to remove is pass 4b, index.ts:3180–3190 (verified this session):
```typescript
// Pass 4b — a provoked goliath hammers the player who hit it (brutal), as long
// as the aggro is live and that player is out in the open (not the safe zone).
for (const goliathRow of goliaths) {
  if (aggroExpired(goliathRow.aggroExpiresAtMicros, now) || !goliathRow.aggroPlayer) continue;
  const hex = goliathRow.aggroPlayer.toHexString();
  const chased = playerByHex.get(hex);
  if (!chased || isInsideSafeZone(chased.positionX, chased.positionZ)) continue;
  const from = goliathPosition.get(goliathRow.goliathId)!;
  if (distanceBetween(from.x, from.z, chased.positionX, chased.positionZ) > GOLIATH_PLAYER_CONTACT_RANGE) continue;
  playerDamage.set(hex, (playerDamage.get(hex) ?? 0) + damagePerTick(goliathRow.contactDamage, tick));
}
```
Grep `GOLIATH_PLAYER_CONTACT_RANGE` afterward — delete the const if unreferenced (no legacy code). `playerDamage` is declared at index.ts:3160 — hoist its declaration above the `runUnitAttacks` call site. The apply loop that slam damage rides for free (resist 'contact' → death → spill → respawn) is index.ts:3339–3379:
```typescript
for (const [hex, rawDamage] of playerDamage) {
  const targetPlayer = ctx.db.player.identity.find(playerByHex.get(hex).identity);
  if (!targetPlayer || isInsideSafeZone(targetPlayer.positionX, targetPlayer.positionZ)) continue;
  const resisted = resistedDamage(
    Math.round(rawDamage),
    PLAYER_RESISTANCES[targetPlayer.activeCharacterId],
    'contact'
  );
  ...
}
```
Do NOT route slam damage through `resolvePlayerHit`/`MAX_HIT_DAMAGE(400)` — it would clamp 405/585/765 (RESEARCH Pitfall 8).

---

### `src/game/systems/createTelegraphSystem.ts` (render system, streaming)

**Analogs:** `createEffectSystem.ts` (factory shape + flat ground-ring idiom) + `createEntityRenderer.ts` `syncRows` (row-keyed reconcile)

**Factory + interface pattern** (createEffectSystem.ts:38–56, 77–88) — `createX(scene)` closure returning an interface with `update(deltaSeconds)` + `dispose()`:
```typescript
export function createEffectSystem(scene: THREE.Scene): EffectSystem {
  const activeEffects: ActiveEffect[] = [];
  function addEffect(effect: ActiveEffect) {
    scene.add(effect.object);
    activeEffects.push(effect);
  }
  function removeEffect(effect: ActiveEffect) {
    scene.remove(effect.object);
    disposeObject(effect.object);   // ← use engine/disposeObject for cleanup
  }
  ...
  return { update, spawnBurst, ..., dispose() { ... } };
}
```

**Flat ground-ring idiom** (spawnNova, createEffectSystem.ts:205–217) — RingGeometry, MeshBasicMaterial transparent + `depthWrite: false`, rotated flat, y-epsilon above ground:
```typescript
const ring = new THREE.Mesh(
  new THREE.RingGeometry(0.4, 0.9, 32),
  new THREE.MeshBasicMaterial({
    color: elementColor,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
);
ring.rotation.x = -Math.PI / 2;
ring.position.set(options.origin.x, options.origin.y - 0.85, options.origin.z);
```
Telegraph: outline = `RingGeometry(radius − rim, radius, 48)` at `#86e2ff` (rim ≥ 0.2u for pixel-filter legibility, ANIM-02); fill = `CircleGeometry(radius, 48)` with `scale.setScalar(fillFraction)` where `fill = clamp((nowMicros − startedAt)/(strikeAt − startedAt))` re-derived from the row — never a client-local timer. Position y from `world.getGroundHeight(landingX, landingZ) + 0.06`.

**Row-keyed reconcile pattern** (createEntityRenderer.ts:156–190) — `syncRows` with a `seen` set, insert/update/remove by row key:
```typescript
function syncRows(rows: readonly Row[]) {
  const seen = new Set<string>();
  for (const row of rows) {
    const key = adapter.readId(row).toString();
    seen.add(key);
    const existing = entities.get(key);
    if (!existing) { entities.set(key, insert(row)); continue; }
    existing.targetX = adapter.readPositionX(row);
    ...
  }
  for (const [key, entity] of entities) {
    if (!seen.has(key)) remove(key, entity);
  }
}
```
Telegraph rows = `unit_attack` rows where `state === WINDUP` AND the owning goliath row is `alive` (Pitfall 6 belt-and-suspenders).

---

### `src/game/systems/createEntityRenderer.ts` (modified — optional `animateAttack`)

**Analog:** itself. The interface to extend (lines 11–16):
```typescript
/** Per-entity locomotion + death animation, closed over its own model and parts. */
export interface EntityAnimation {
  /** One alive frame: limb swing / body bob for the given motion state. */
  animateMovement(elapsedSeconds: number, isMoving: boolean): void;
  /** Death pose for progress 0 (just died) → 1 (fully toppled and hidden). */
  animateDeath(progress: number): void;
  // NEW: animateAttack?(view: AttackAnimationView): void;  ← OPTIONAL so enemy renderer compiles unchanged
}
```
Call site in `update()` (lines 210–234) — after `animateMovement`, and skip `lookAt` during windup so the crouch faces the landing:
```typescript
const isMoving = horizontalGap > MOTION_EPSILON;
if (isMoving) group.lookAt(entity.targetX, group.position.y, entity.targetZ);
entity.animation.animateMovement(elapsedSeconds, isMoving);
// NEW: entity.animation.animateAttack?.(view) when an attack view exists for this unit
```
Attack views arrive via a new `setAttackViews(map)` on the renderer, refreshed by `createGame.syncUnitAttacks(rows)` (RESEARCH Pattern 6 has the `AttackAnimationView` shape). Lerp/snap constants that constrain the leap: `SNAP_DISTANCE = 8`, `LERP_RATE = 10` (lines 65–66) — leap > 8u snaps, hence `maxBand ≈ 8`.

---

### `src/game/systems/createGoliathRenderer.ts` (modified — implement `animateAttack`)

**Analog:** itself, `createGoliathAnimation` (lines 21–43) — cached part refs + procedural transforms, this exact structure gains a third method:
```typescript
function createGoliathAnimation(model: EnemyModel): EntityAnimation {
  const baseBodyY = model.body.position.y;
  const leftLeg = model.group.getObjectByName('leftLeg') ?? null;
  ...
  return {
    animateMovement(elapsedSeconds, isMoving) {
      const walk = elapsedSeconds * 6;
      const legSwing = isMoving ? Math.sin(walk) * 0.5 : 0;
      ...
      model.body.position.y = baseBodyY + (isMoving ? Math.abs(Math.sin(walk)) * 0.12 : 0);
    },
    animateDeath(progress) {
      model.group.rotation.z = progress * (Math.PI / 2); // topple sideways
      model.group.visible = progress < 1;
    },
    // NEW: animateAttack(view) — windup: body Y compress (crouch);
    // strike: parabolic Y arc sin(progress·π)·leapHeight toward landing;
    // recovery: ease back to neutral. Use THREE.MathUtils.lerp/clamp only.
  };
}
```

---

### `src/game/audio/createAudioSystem.ts` (NEW — no analog)

No audio code exists anywhere in `src/` (grep-verified in RESEARCH). Copy only the module conventions: `createAudioSystem(): AudioSystem` factory returning an interface (like `createEffectSystem`), ~50 LOC, hand-rolled WebAudio oscillator/noise one-shot, `AudioContext` resumed on first user gesture. Flagged as its own small task (RESEARCH Open Q2 / assumption A4 — SC3 says "VFX/SFX"; descoping needs explicit user waiver).

---

### `src/game/createGame.ts` (modified — handles, stun reconcile, camera shake)

**Analog:** itself — three seams.

**Game-handle pattern** (interface, lines 126–145) — `syncUnitAttacks` and `handleAttackStrike` copy these declarations:
```typescript
syncRemotePlayers(players: readonly Player[], myIdentityHex: string | null): void;
syncMyServerRow(row: Player): void;
handleRemoteSkillCast(cast: SkillCast): void;
...
/** Reconciles the rendered goliath raiders against the server `goliath` table. */
syncGoliaths(rows: readonly Goliath[]): void;
```

**Stun reconcile seam** — `updateLocalPlayer` (lines 635–680) reads input and moves; the stun check goes before/inside it, adopting the server row position (RESEARCH §Client stun reconcile sketch). `syncPositionToServer` (lines 682–695) keeps running — the server rejects writes while stunned:
```typescript
function syncPositionToServer(deltaSeconds: number) {
  if (hasReportedVoidDeath) return;
  positionSyncTimer += deltaSeconds;
  if (positionSyncTimer < POSITION_SYNC_INTERVAL_SECONDS) return;
  ...
  network.sendPosition(playerPosition.x, playerPosition.y, playerPosition.z, playerRotationY);
}
```
Void/knockback-off-bridge deaths already handled (lines 663–666: `VOID_KILL_DEPTH` + `network.sendFallToDeath()`) — knockback needs no new death path (D4-11).

**Camera-shake seam** — `updateCamera` (lines 836–840); shake = decaying offset added to `desiredPosition` before the lerp:
```typescript
function updateCamera(deltaSeconds: number) {
  const desiredPosition = playerPosition.clone().add(CAMERA_OFFSET);   // ← add shake offset here
  pixelRenderer.camera.position.lerp(desiredPosition, Math.min(1, deltaSeconds * 6));
  pixelRenderer.camera.lookAt(playerPosition.x, playerPosition.y + 1, playerPosition.z);
}
```
Strike VFX composes existing pieces: `effectSystem.spawnBurst(position, 0x86e2ff, ...)` (createEffectSystem.ts:90–121) — the App→game flow mirrors `handleRemoteSkillCast`.

---

### `src/App.tsx` (modified — subscription wiring)

**Analog:** itself — two distinct patterns, do NOT mix them:

**Cached table → manual subscribe list + plain useTable** (lines 109–135, 148–159). `unit_attack` goes HERE (it is a normal cached table):
```typescript
.subscribe([
  tables.accountLink.where(row => row.identity.eq(identity)),
  tables.player,
  ...
  // skillCast / pullResult / rangedAttack / healEvent are EVENT tables:
  // their useTable hooks below open the ONLY subscription. Listing them
  // here too would deliver every event row twice (double VFX/numbers) —
  // same invariant as pvpHit/enemyHit.
  tables.enemy,
  tables.goliath,
  ...
])
...
const [goliathRows] = useTable(tables.goliath);   // ← add const [unitAttackRows] = useTable(tables.unitAttack);
```

**Event table → useTable-with-onInsert ONLY** (enemyHit, lines 230–243 — copy the comment onto the new hook):
```typescript
// enemy_hit is an EVENT table, so it must NOT also appear in the manual
// subscription list above — useTable already opens its own subscription, and a
// second overlapping subscription would deliver each event row twice, firing
// this onInsert twice (two numbers ~0.16u apart). One subscription = one number.
useTable(tables.enemyHit, {
  onInsert: hit => {
    gameRef.current?.spawnWorldNumber(hit.positionX, hit.positionZ, hit.amount, hit.isCrit ? 'crit' : 'normal');
  },
});
```
`attack_strike` copies this: `useTable(tables.attackStrike, { onInsert: strike => gameRef.current?.handleAttackStrike(strike) })`. Rows flow to the game via the established effect pattern (`gameRef.current?.syncGoliaths(goliathRows)` idiom elsewhere in App.tsx).

---

### Tests: `attacks.test.ts`, `unitAttackFsm.test.ts`, `attackHitbox.test.ts` (new) + `serverSync.test.ts` (extend)

**Analog:** `src/game/data/__tests__/crit.test.ts` (pure-helper test) + `serverSync.test.ts` (parity import)

**Cross-boundary import + boundary-case discipline** (crit.test.ts:1–33):
```typescript
import { describe, expect, it } from 'vitest';
// Import the real helper across the package boundary (server module → client vitest
// runner), same mechanism as deathPenalty.test.ts — not a local re-implementation.
import { rollCrit } from '../../../../spacetimedb/src/crit';

describe('rollCrit', () => {
  it('crits when rng() < critRate: returns critDmg as the multiplier', () => {
    expect(rollCrit(0.34, 1.9, () => 0.1)).toEqual({ isCrit: true, multiplier: 1.9 });
  });
  it('boundary: rng() exactly equal to critRate does NOT crit (strict <, not <=)', () => {
    expect(rollCrit(0.34, 1.9, () => 0.34)).toEqual({ isCrit: false, multiplier: 1 });
  });
});
```
Test the same class of boundaries: `now === strikeAt` fires; jumped-two-intervals fires once; player exactly ON the radius edge; zero-length knockback vector; `selectAttack` sweep `d = 0..8 step 0.25` never null (ATK-05 dead-zone).

**serverSync extension** (serverSync.test.ts:20–28 — "compare OUTPUTS, not source regex"):
```typescript
// Import the server damage mirror across the package boundary and compare OUTPUTS,
// not source regex (RESEARCH Pitfall 4) — the robust parity path.
import {
  CHARACTER_COMBAT,
  WEAPONS as SERVER_WEAPONS,
  ...
} from '../../../../spacetimedb/src/damage';
```
New block imports `ATTACKS`, `UNIT_ATTACKS` from `spacetimedb/src/attacks` and `GOLIATH_SIZE_STATS` from `spacetimedb/src/enemyStats`; asserts tick-multiple durations, `radiusBySize.length === GOLIATH_SIZE_STATS.length`, and `contactDamage × 4.5 → [405, 585, 765]` (full block drafted in RESEARCH §Code Examples).

## Shared Patterns

### Zero-import pure helper + injected determinism
**Source:** `spacetimedb/src/crit.ts:1–21`, `combatMath.ts:1–2`
**Apply to:** `attacks.ts`, `unitAttackFsm.ts`, `attackHitbox.ts`
Header comment declares "kept dependency-free so it can be unit-tested directly under the client's vitest runner"; time/randomness injected as plain args (`nowMicros: bigint`, `tickMicros: bigint`); no `ctx`, no imports (except pure→pure siblings like `distanceBetween`).

### Additive migrate: `.default()` columns appended LAST + separate-table-over-column
**Source:** `spacetimedb/src/index.ts:428–439` (goliath) and 333–341 (player)
**Apply to:** `player.stunnedUntilMicros`, `unit_attack`/`attack_strike` table placement
```typescript
// NOTE: appended (not reordered) so the schema diff stays additive. STDB
// rejects inserting a column mid-table on an existing DB (manual migration).
engageEndsAtMicros: t.u64().default(0n),
```
Plus the insert-type tax: new defaulted column still must be supplied at every existing `insert()` call site (grep `player.insert`, incl. `restorePlayers`).

### Event-table one-shot broadcast + ONE-subscription rule
**Source:** `spacetimedb/src/index.ts:573–582` (`enemyHit`) + `src/App.tsx:118–121, 230–243`
**Apply to:** `attack_strike` end-to-end
`{ public: true, event: true }`; emit exactly once per strike, unconditionally at the transition; client consumes via `useTable(..., { onInsert })` ONLY — never also in the manual subscribe list.

### worldTick determinism: sample-once, map-build, single apply
**Source:** `spacetimedb/src/index.ts:2941–2942, 3159–3176, 3339–3379`
**Apply to:** `unitAttacks.ts` and the `runUnitAttacks` call-site wiring
`now`/`tick` sampled once at the top; all reads/decisions accumulate into Maps; row writes happen only in the apply loops; strike damage MUST ride the existing `playerDamage` map so resist/death/spill/respawn come free.

### Per-size stat arrays indexed by `sizeIndex`
**Source:** `spacetimedb/src/enemyStats.ts:70–74` (`GOLIATH_SIZE_STATS`)
**Apply to:** `ATTACKS.leapSlam.radiusBySize` and the 4.5× damage arithmetic
`readonly` array positionally aligned with goliath `sizeIndex`; parity test asserts equal lengths.

### Frost design language
**Source:** memory (frost-design-language) + D4-14
**Apply to:** telegraph + strike VFX — icy-cyan `0x86e2ff`, additive blending, minimal footprint; verify legibility through `createPixelRenderer` (440px internal width) as a human-verify gate.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/game/audio/createAudioSystem.ts` | audio component | event-driven | No audio code anywhere in `src/` (grep-verified in RESEARCH). Follow the `createX() → interface` factory convention from `createEffectSystem.ts`; hand-rolled WebAudio one-shot per RESEARCH Open Q2. Plan as its own small task or descope with user waiver. |

## Metadata

**Analog search scope:** `spacetimedb/src/` (all 17 modules), `src/game/systems/`, `src/game/createGame.ts`, `src/App.tsx`, `src/game/data/__tests__/` (all 12 test files)
**Files scanned:** ~25 (13 read in full or targeted-range this session)
**Pattern extraction date:** 2026-07-09
