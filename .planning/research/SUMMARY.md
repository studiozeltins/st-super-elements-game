# Project Research Summary

**Project:** super-elements (2d-genshin-top-down) — milestone v0.2.0-alpha "Combat Depth"
**Domain:** Server-authoritative telegraphed dodgeable-attack FSM + per-character crit + poise interrupt + procedural animation state machine (ENEMIES ONLY; built unit-agnostic for heroes later)
**Researched:** 2026-07-08
**Confidence:** HIGH

## Executive Summary

This milestone replaces the enemies' current **undodgeable per-tick contact drain** with **discrete, telegraphed, dodgeable strikes**, plus a **per-character crit system** and a **crit-driven poise/interrupt** mechanic. The genre-standard way to build this (Soulslike readability + MOBA ground telegraphs + Genshin crit stats) maps cleanly onto the engine that already exists: a `windup→strike→recovery` phase machine on a fixed server tick, ground-decal telegraphs that communicate *where* and *when*, and damage resolved **once at the strike frame against LIVE player positions** so moving out of the shape is the dodge. All four researchers converged on the same headline: **add zero new runtime dependencies.** Every primitive already exists as a working prototype in-repo (`worldTick` scheduled combat, `combatMath`/`goliathAI`/`bridges` geometry helpers, `createEffectSystem` ground rings, `createGoliathAnimation` procedural posing). The correct decision is disciplinary: hand-roll on existing seams and actively refuse `xstate`, tween libs, physics engines, ECS libs, and `THREE.AnimationMixer`.

The recommended approach is architectural restraint that respects the codebase's no-monolith rule. `index.ts` (~3280 LOC) gains only two additive table blocks, one `runUnitAttacks(...)` pass call inside `worldTick`, and an `isCrit` arg on two reducers. All branching logic lands in three NEW pure, vitest-able server siblings — an `ATTACKS`/`UNIT_ATTACKS` registry + `selectAttack`, the FSM advance/poise transitions, and circle/cone/lane hitbox math — each ≤300 LOC. The FSM is a `switch(phase)` keyed on `ctx.timestamp` micros (bigint, deterministic), and its new attack pass is inserted between `worldTick`'s position-build pass and the player-damage apply so strike damage lands in the SAME `playerDamage` map — reusing resistance, death, shard-spill, and respawn logic for free. On the client, telegraphs re-derive timing from the server row + a mirrored `ATTACKS` copy (never their own timer), and animation is a procedural `pose(model, t)` machine keyed to the same server phase.

The dominant risks are all about **fairness and determinism on a live DB**, not about missing libraries. Five stand out: (1) the new `unit_attack`/`attack_strike` tables start EMPTY on a migrated production DB, so the FSM must lazily create attack state by iterating the *unit* tables — never the empty attack table — and every phase's done-criteria needs a migrated-DB (not fresh-seed) check; (2) `serverSync.test.ts` is stat-only today and MUST be extended to assert `ATTACKS`-duration parity or client/server drift silently breaks dodge fairness (INV-5 hole); (3) scheduled ticks are best-effort, so windups must be authored as exact tick multiples and the FSM must resolve a *passed* strike deadline rather than drop it; (4) dodge fairness needs an active-window + grace model chosen at the first vertical slice and validated on **maincloud RTT** (LAN hides the latency entirely); and (5) an explicit, unresolved **crit-roll trust-boundary decision** (below) that determines whether the poise interrupt can be spoofed into a perma-stun.

## Key Findings

### Recommended Stack

Zero new runtime dependencies. The milestone is deliberately dependency-free, and the "stack" decision is mostly a *what-NOT-to-add* decision. Stay procedural for animation (NOT `THREE.AnimationMixer` — there are no authored clips; models are code-built `THREE.Group`s posed by `Math.sin`). The one built-in worth adopting uniformly is `THREE.MathUtils` (`lerp`/`clamp`/`smoothstep`/`damp`) for every telegraph fill and animation blend, which removes any reason to reach for a tween lib. If any plan proposes a `pnpm add`, treat it as a red flag. See STACK.md.

**Core technologies:**
- `three@0.185.1` (already pinned, current latest) — client ground telegraphs (`RingGeometry`/`CircleGeometry`/`BufferGeometry`) + procedural attack animation — already the validated renderer; no bump, no add-on needed for flat ground decals.
- `spacetimedb@2.6.*` (TS module) — server-authoritative `unit_attack` FSM resolved on `worldTick` — the FSM MUST be a deterministic reducer; the scheduled-tick + `ctx.timestamp` + additive-table pattern is already proven by the live goliath sim.
- `THREE.MathUtils` (bundled, no install) — easing/interpolation for telegraph fill and animation blends — replaces ad-hoc `progress*progress` and any tween-lib temptation.
- `vitest@3.2.4` (dev) — unit-test the pure FSM/geometry/selection helpers and guard the client/server mirror; extend `serverSync.test.ts` to cover `ATTACKS`.

**Actively refuse:** `xstate` (a deterministic reducer needs plain `switch(phase)`, not a statechart with schedulers/timers), `@tweenjs/tween.js`/`gsap`, `cannon-es`/`rapier` (SPEC non-goal — strike-instant overlap, not continuous collision), `bitecs`/`miniplex` (STDB tables ARE the entity store), `howler`, and bumping `three`.

### Expected Features

Genre reference points: **Soulslike** (readability contract — obvious windup, commit/recovery, dodge as the answer), **MOBA** (ground telegraph language — circle/cone/lane with a cast-time fill), **Genshin** (crit stat model — base 5% CR / +50% CDMG, ~1:2 CR:CDMG scaling). See FEATURES.md.

**Must have (table stakes):**
- Windup → strike → recovery phases (readable-but-fair windup band ~0.4–1.0 s; absolute min ~0.35 s / ≥2 ticks).
- Ground telegraph showing shape AND timing (circle/cone/lane, filling over the windup).
- Damage resolved once at the strike frame vs LIVE positions — the thing that makes attacks dodgeable.
- Attack selection by range + per-unit cooldown; a viable positional dodge window (no i-frames).
- Removal of the old goliath→player contact drain (two damage sources double-dip and kill the dodge fantasy).
- Per-character `critRate`/`critDmg` replacing the global `Math.random()<0.22 → ×1.9`, and `isCrit` forwarded to the server.

**Should have (competitive differentiators):**
- Poise/stagger interrupt (crit-during-windup cancels the attack) — the signature mechanic; DEPENDS on crit existing.
- Attack chaining (`swordSwing` cone → `swordSwirl` 360° circle); locked-landing `leapSlam` vs live-tracked swings (the MIX is the differentiator); gap-closer lane dash (`shieldDash`); per-archetype attack silhouettes; `attack_strike` event VFX/SFX.

**Defer (v1.x / v2+):**
- Convert camp enemies to the same FSM (zero schema change); knockback/stun on hit; weapon/constellation crit sources.
- Hero attack FSM + i-frame/parry dodge; tiered poise/hyperarmor/break animations; elemental-reactive telegraphs.

**Anti-features to refuse:** continuous-collision physics; keeping per-tick contact damage alongside strikes; perfect-homing windups; undodgeable "true damage" telegraphs; sub-0.3 s "gotcha" windups; a global/shared crit roll; deep tiered poise meters; hero parry/i-frames this milestone.

### Architecture Approach

All new logic lands in SIBLING modules; `index.ts` gets only table defs, additive reducer args, and one pass call. The FSM advance is a pure transition function (`advanceAttack(row, now, atk)` — no `ctx`); `worldTick` only does I/O around it. Strike damage feeds the EXISTING `playerDamage` map (do NOT open a second damage/death path). Body commitment (root/leap/charge) is layered as an OVERRIDE on the already-computed `goliathPosition` map before the single apply — which makes the pass ordering load-bearing. The client never counts down independently: telegraph timing is re-derived from `(now - startedAt)/duration` using a mirrored `ATTACKS` copy, and strike VFX fire on the `attack_strike` event (`onInsert` only). See ARCHITECTURE.md.

**Major components:**
1. `spacetimedb/src/attacks.ts` (NEW) — `ATTACKS[]` + `UNIT_ATTACKS[kind][archetype]` registry + `selectAttack()`; data split from FSM math so tuning touches one file.
2. `spacetimedb/src/unitAttackFsm.ts` (NEW) — pure `advanceAttack` / `applyPoiseHit`; phase transitions, target locking, poise accrual/cancel.
3. `spacetimedb/src/attackHitbox.ts` (NEW) — pure `resolveCircle/Cone/Lane` vs live player positions (reuses `distanceBetween`, `isWithinForwardArc`, `pickRayHit` projection).
4. `runUnitAttacks` pass (small block IN `worldTick`) — the only new code in `index.ts`; sits between Pass 1 and the goliath/player apply, writes into the shared `playerDamage` map, emits `attack_strike`.
5. `unit_attack` (public) + `attack_strike` (event) tables — keyed `(unitKind, unitId)` so heroes/enemies reuse with zero schema change.
6. Client: `createAttackTelegraphs.ts` (NEW ground meshes), `EntityAnimation.animateAttack` (added method, not a fork), `data/attacks.ts` (NEW client mirror guarded by `serverSync.test.ts`).

**Reused seams (do not reimplement):** `createEntityRenderer`, `resistances` (`resistedDamage`), hitscan (`pickRayHit`), `goliathAI` (`isWithinForwardArc`), `combatMath` (`distanceBetween`), `createEffectSystem`.

### Critical Pitfalls

1. **Phase math must key off a single `now` sample + absolute deadlines, and windups must be exact tick multiples.** Scheduled ticks are best-effort (a "0.9 s" windup is really "first tick at/after startedAt+900 000 µs"). Sample `now` once at the top of `worldTick`, compare `now >= startedAt + windupMicros`, and explicitly resolve a strike whose deadline a late/coalesced tick already passed — never drop it. Test a "jumped two intervals" input.
2. **The new tables start EMPTY on the migrated live DB.** `init` only runs on a fresh DB. The FSM must be row-optional: iterate the *unit* tables each tick and lazily insert the `unit_attack` row by index — never iterate the empty attack table. Bake a "row count > 0 after a real engage on a MIGRATED (not freshly-seeded) DB" check into each phase's done-criteria. Never `--delete-data` maincloud.
3. **Client `ATTACKS` mirror drift breaks dodge fairness (INV-5 hole).** `serverSync.test.ts` is stat-only today; extend it to assert every `windupMicros/activeMicros/recoveryMicros/cooldownMicros/damage/radius/angle/reach/laneWidth` matches the client copy. Treat a failing parity assertion as release-blocking; keep it green through every later attack.
4. **Strike-vs-stale-position under latency makes honest dodges still hit.** Build an **active window** (≥1–2 ticks) plus a **dodge grace** biased toward the escaping player at Slice 1 — a single-instant point check is a trap. Validate on maincloud RTT, not LAN.
5. **Trust boundary (see below) + poise edge cases.** Only delete the goliath→player drain; author real cooldowns so a `swing`+`swirl` chain can't one-shot; reset `poise=0` on every `windup` entry (the single choke point); on interrupt always set a visible stagger cooldown; make crit-outside-windup a poise no-op. Grep-gate: no `Math.random`/`Date.now` in `spacetimedb/src`.

## Implications for Roadmap

The SPEC and all four researchers converge on a **forced, dependency-ordered build sequence**. This is not a suggestion to re-derive — it is the ordering constraint. The interrupt CANNOT precede crit.

### Phase A / Slice 0: Crit foundation
**Rationale:** Independently shippable value (per-character crit visuals) AND the prerequisite signal the poise interrupt consumes. No FSM, no new tables — de-risks the milestone's dependency root first.
**Delivers:** `critRate`/`critDmg` on `CharacterDefinition` + per-character values; `rollDamage` returns `isCrit`; `isCrit: t.bool()` added to `attackEnemies`/`attackRay` (server records/forwards, no behaviour yet); bindings regenerated; `serverSync.test.ts` extended.
**Addresses:** Per-character crit; `isCrit` → server plumbing.
**Avoids:** Pitfall 6 — this is where the crit-trust boundary MUST be decided and documented (below). That decision determines whether Slice 0 touches the server `CHARACTER_STATS` mirror.

### Phase B1 / Slice 1: FSM + `leapSlam` end-to-end + delete goliath drain
**Rationale:** The risky vertical slice — schema + pass ordering + subscription + telegraph + animation + drain deletion — proven on ONE attack before multiplying shapes. Full playtest gate.
**Delivers:** `unit_attack` + `attack_strike` tables; `attacks.ts`/`unitAttackFsm.ts`/`attackHitbox.ts` (circle only); `runUnitAttacks` wired into `worldTick`; DELETE goliath→player contact drain (~`index.ts:3057`) in the SAME commit; client ring telegraph, `animateAttack`, `syncUnitAttacks`/`handleAttackStrike`, App.tsx subscribe, `ATTACKS` parity test.
**Uses:** `worldTick`, `combatMath`, `createEffectSystem`, `createEntityRenderer`, `resistances`.
**Avoids:** Pitfalls 1 (phase/late-tick math + `phaseFor` helper), 2 (row-optional FSM + migrated-DB verification), 3 (introduce `ATTACKS` parity test), 4 (choose active-window + grace model here), 5 (drain removal + selection coverage so no facetank dead zone), 7 (establish poise column lifecycle now), 8 (pure geometry + RNG-order determinism gate). Establish the poise column + reset-on-windup-entry here even though accrual ships in Slice 4.

### Phase B2 / Slice 2: `swordSwing` (cone) → `swordSwirl` (circle) combo
**Rationale:** Proves attack chaining and a second/third shape on top of a validated loop.
**Delivers:** two `ATTACKS` entries + `resolveCone` (reuse `isWithinForwardArc`); chain selection (swirl after swing); client cone telegraph + goliath sword-swing clip.
**Implements:** the chaining differentiator; keeps `ATTACKS` parity + latency tuning green.

### Phase B3 / Slice 3: `shieldDash` (lane, moving hitbox)
**Rationale:** The hardest shape (travelling hitbox) — do it last of the shapes.
**Delivers:** `ATTACKS` entry + `resolveLane` (reuse `pickRayHit` projection, collect ALL within `laneWidth`); `move:'charge'` body commit; client lane telegraph + charge animation.

### Phase B4 / Slice 4: Crit poise interrupt
**Rationale:** Depends on BOTH the FSM (a windup to interrupt) and crit (the `isCrit` signal). Must be last.
**Delivers:** `applyPoiseHit` in `unitAttackFsm.ts` called from `attackEnemies`/`attackRay`; accrue `poise` during windup on crit only; cancel + stagger at `poiseThreshold`; reset on attack end.
**Avoids:** Pitfall 7 (same-tick strike/interrupt race, post-interrupt re-attack, visible stagger) and Pitfall 6 (must honor the Slice-0 trust decision — do not elevate an untrusted bool to a state trigger without it).

### Phase Ordering Rationale
- **Crit before interrupt is a hard dependency**, not a preference: the interrupt is defined as "a *crit* landing during windup accrues poise." Slice 0 ships alone but unblocks Slice 4.
- **One shape proven before many:** Slice 1 carries all the integration risk (schema/ordering/subscription/telegraph/animation/drain-delete); Slices 2–3 only add shapes on a proven spine.
- **Drain deletion is coupled to coverage:** delete the goliath→player drain in the SAME slice that guarantees the selection fn returns an attack in every distance band — otherwise a facetank dead zone opens.
- **Pass ordering is load-bearing:** `runUnitAttacks` MUST sit between `worldTick`'s Pass 1 (position build) and the single `playerDamage` apply, landing strike damage in that same map.

### Research Flags

Phases likely needing deeper research/design during planning:
- **Phase A (Slice 0):** the crit-trust-boundary decision (below) is a genuine design call with a security dimension — flag for requirements, not code-time.
- **Phase B1 (Slice 1):** the active-window + grace latency model and the pixel-filter telegraph readability tuning are UX/feel judgements not yet exercised in this repo; both need a maincloud-RTT playtest, not just green vitest.

Phases with well-documented in-repo patterns (skip deep research):
- **Phases B2/B3:** once B1's spine exists, adding a cone/lane shape + a telegraph renderer branch is a mechanical repeat of established patterns (`isWithinForwardArc`, `distanceToSegment`, `createEffectSystem`).
- **Phase B4:** the interrupt is small once the poise column lifecycle is established in B1; the logic is a pure `applyPoiseHit` with explicit boundary tests.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified directly against `package.json` and live source; every primitive has a working in-repo prototype; "zero new deps" corroborated across all four files. |
| Features | HIGH | Established action-game conventions; crit ranges cross-checked against Genshin sources; tuning numbers are explicitly starting points for a feel pass, not authoritative. |
| Architecture | HIGH | Every integration point cites a verified line in the live `index.ts`/client (not the spec); NEW-vs-MODIFIED ledger and pass-ordering are concrete. |
| Pitfalls | HIGH/MEDIUM | HIGH on determinism/migrate/mirror-drift (verified vs CLAUDE.md, PROJECT.md, `worldTick`/`combatMath`); MEDIUM on dodge-feel + pixel-filter readability (design/UX judgement). |

**Overall confidence:** HIGH

### Gaps to Address

- **UNRESOLVED — crit-roll trust boundary (decide in requirements/Phase A; do NOT resolve here).** Two options, mutually exclusive, with different downstream cost:
  - **(a) Keep the client-authored roll** — send `isCrit` as a reducer arg, consistent with today's model where the client already sends `damage`. Faster to ship; Slice 0 does NOT need to touch the server `CHARACTER_STATS` mirror. But a modified client can send `isCrit: true` on every hit and, once B4 lands, perma-stun every goliath windup (spoofable stagger affecting all nearby players).
  - **(b) Move the roll server-side via `ctx.random`** — the reducer owns `isCrit` from `critRate`/`critDmg` inputs; cheat-proof and the only option that makes the poise interrupt un-spoofable. Requires Slice 0 to mirror crit stats into the server `CHARACTER_STATS` and belongs in Phase A if chosen.
  This is a Phase-A design call that decides whether Slice 0 touches the server stat mirror and whether B4's interrupt can be spoofed. Requirements must pick (a) or (b) explicitly; add a server-side `damage` sanity clamp as defense-in-depth regardless.
- **Active-window + grace latency model:** choose the exact grace tuning at Slice 1 and validate over real maincloud RTT (LAN hides the unfairness). Make it a Slice-1 done-criterion with a two-client remote playtest.
- **Pixel-filter telegraph readability:** high-contrast ring vs Mondstadt-green ground through the actual pixel filter at target resolution (Frost accent #86e2ff is the established high-visibility cue). Verify *through* the filter, not in raw Three.js, during the B1/B2 renderer slices.
- **Tuning numbers (windups/damage/cooldowns/poise threshold):** opening values only — hand to a playtest feel pass; model the worst-case `swing`+`swirl` chain vs player max HP before shipping the combo.

## Sources

### Primary (HIGH confidence)
- Repo source (verified line-level): `spacetimedb/src/index.ts` (`worldTick` structure, single `now` sample ~2809, three `damagePerTick` sites 3014/3044/3057, `playerDamage` apply 3207, schema 666), `combatMath.ts`, `goliathAI.ts`, `hitscan.ts`, `bridges.ts`, `resistances.ts`, `createEffectSystem.ts`, `createEntityRenderer.ts`, `createGoliathRenderer.ts`, `createGame.ts`, `App.tsx`, `data/characters.ts`, `data/__tests__/serverSync.test.ts`, `package.json`.
- `.planning/transcendence/combat-telegraphed-attacks-SPEC.md` — FSM/schema/roster/build slices, physics-engine non-goal, client-trust crit model, open questions (canonical for this milestone).
- `.planning/PROJECT.md` + `CLAUDE.md` — INV-5 mirror sync, additive-migrate gotchas, deploy/backup procedure, determinism rules, event-table semantics.
- Genshin crit sources — game8.co CR/CDMG guide, HoYoLAB 1:2 scaling, Genshin Wiki CRIT Hit.
- three.js — `0.185.1` confirmed current latest (npm/GitHub releases); `THREE.MathUtils` stable in r18x.

### Secondary (MEDIUM confidence)
- Soulslike dodge/windup framing — Parry Everything (Dark Souls dodge roll), Game Rant (unwritten rules of Soulslikes).
- SpacetimeDB engine model — scheduled reducers are best-effort not metronomic; event tables fire only `onInsert` (engine general knowledge corroborated by CLAUDE.md).

### Tertiary (LOW confidence)
- Combat tuning numbers (windups, damage, cooldowns, poise threshold) — starting points for a feel pass; require playtest validation, not authoritative.

---
*Research completed: 2026-07-08*
*Ready for roadmap: yes*
