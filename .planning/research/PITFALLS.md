# Pitfalls Research

**Domain:** Server-authoritative telegraphed-attack FSM + crit/poise + animation state machine, added additively to a LIVE SpacetimeDB (TS module) multiplayer game with a Three.js pixel-filter client.
**Researched:** 2026-07-08
**Confidence:** HIGH on the determinism + additive-migrate + mirror-drift traps (verified against `CLAUDE.md`, `PROJECT.md`, and the actual `worldTick`/`combatMath` source). MEDIUM on the dodge-feel and pixel-filter-readability traps (design/UX judgement, not yet exercised in this repo).

Phase labels below map to the SPEC's build slices:
- **A** = crit system (critRate/critDmg, `isCrit` arg)
- **B1** = `unit_attack`+`attack_strike` schema, `ATTACKS`/`UNIT_ATTACKS`, FSM + `leapSlam`, remove goliath drain
- **B2** = `swordSwing`→`swordSwirl` combo · **B3** = `shieldDash` lane · **B4** = crit interrupt (poise)

---

## Critical Pitfalls

### Pitfall 1: Phase math derived from wall-clock deltas instead of the fixed tick, drifting per-unit clocks

**What goes wrong:**
The FSM stores `startedAt` micros and each tick asks "has `windupMicros` elapsed?" via `now - startedAt >= windupMicros`. If you instead accumulate a per-unit elapsed counter, or compute `now` more than once per reducer call, or compare against a `now` sampled at a different point than the one written into `startedAt`, phase boundaries land on different ticks for different units and are not reproducible. Because the world tick is scheduled at a ~150 ms interval but SpacetimeDB does **not** guarantee the reducer fires exactly on that boundary (ticks can be late/coalesced under load), a windup authored as "0.9 s" is really "the first tick at/after startedAt+900 000 µs" — anywhere from 900 ms to ~1050 ms. Authoring windups that are not clean multiples of the tick makes the realized windup silently longer than the number in `ATTACKS`, and the client (mirroring the same number) shows the ring finishing before the server strikes.

**Why it happens:**
Devs reason in seconds and assume the scheduled reducer is a metronome. The existing code already sidesteps this by using `WORLD_TICK_INTERVAL_MICROS` as `tick` for movement (`Number(tick)/1_000_000`) rather than measuring real elapsed — the FSM must follow that same convention. `ctx.timestamp` is deterministic per call, but a *late* tick still advances the wall clock more than one interval.

**How to avoid:**
- Sample `const now = ctx.timestamp.microsSinceUnixEpoch` **once** at the top of `worldTick` (the code already does this at line 2809) and thread that single value into every phase comparison and every new `startedAt`.
- Compare against absolute deadlines: `now >= startedAt + windupMicros`, never an accumulated delta.
- Author every duration in `ATTACKS` as an exact multiple of `WORLD_TICK_INTERVAL_MICROS`, and add a pure-helper `phaseFor(startedAt, now, attackDef) -> {phase, phaseEndsAt}` unit-tested in `src/game/combat/` so the boundary logic runs without a DB.
- Decide explicitly how to handle a *late/coalesced* tick that skips a whole phase (e.g. strike deadline already passed by the time the tick runs): the strike must still resolve on the first tick that observes `now >= strikeAt`, not be dropped. Test a "jumped two intervals" input.

**Warning signs:**
Telegraph ring completes but damage lands a tick later; realized windup measured in a two-client playtest is consistently longer than the authored number; a unit occasionally "eats" its own strike (skips straight windup→recovery) after a server hitch.

**Phase to address:** B1 (the FSM core + `phaseFor` helper). Get the boundary math and late-tick handling right before any second attack shape exists.

---

### Pitfall 2: The new `unit_attack` table starts EMPTY on the live DB and nothing ever activates it (INV-migrate)

**What goes wrong:**
You publish the additive schema to maincloud, the migrate succeeds, tests are green — and goliaths deal **zero** damage, because `init` (which seeds/schedules) only runs on a **fresh** DB. On a migrated DB the new `unit_attack` table is empty and, more importantly, the FSM only produces rows if the tick logic is already deployed and running. If the *only* damage path (Pitfall 5's drain removal) has shipped but the activation of the FSM for existing goliaths hasn't, goliaths are harmless in production while looking fine locally (where you re-seeded on a fresh DB).

**Why it happens:**
The repo has been bitten by this exact class before ("`init` only runs on a fresh DB", "new tables start EMPTY on migrate — a seed/activation call is needed"). `unit_attack` rows are created lazily by the tick (idle→windup transition), so there's no *seed* step per se — but there IS a latent assumption that the tick loops over *existing* goliaths. Verify the tick enumerates live goliath/enemy rows and lazily attaches an attack machine to each; if instead it iterates `ctx.db.unitAttack.iter()` (empty on migrate) you get zero attacks forever.

**How to avoid:**
- Design the FSM to be **row-optional**: the tick iterates the *unit* tables (`goliath`, `enemy`) each tick and looks up / lazily inserts the `unit_attack` row by the `by_unit (unitKind, unitId)` index. Never assume a `unit_attack` row already exists.
- If any activation/scheduling is needed on an existing DB (e.g. a feature flag, or resetting stuck rows), ship an **idempotent** activation reducer (the repo's `seed_world` pattern) and call it explicitly after publish — do not rely on `init`.
- Add a post-deploy verification to the phase's deploy step: on the migrated DB, `spacetime sql` count of `unit_attack` rows should climb above 0 within seconds of a player engaging a goliath; and a scripted two-client run must confirm a goliath actually strikes.
- Never `--delete-data` maincloud (real accounts + `account`/`account_link` are NOT in the backup set). Migrate-publish only.

**Warning signs:**
`spacetime sql <db> "SELECT COUNT(*) FROM unit_attack"` stays at 0 on the migrated DB; goliaths chase but never wind up; "works locally" (you tested on a freshly-seeded local DB) but not on the migrated cloud DB.

**Phase to address:** B1 deploy step (owns schema + activation). Bake the "count > 0 after engage on a *migrated* (not freshly seeded) DB" check into the phase's done-criteria, not just green vitest.

---

### Pitfall 3: Client mirror of `ATTACKS` durations drifts from the server → dodging becomes unfair (INV-5)

**What goes wrong:**
The client renders the telegraph purely from `attackId, phase, startedAt` + its **own copy** of `windupMicros/activeMicros`. If the client's mirrored duration is even slightly shorter than the server's, the ring visually completes early and a player who "dodged on the tell" still gets hit — or the reverse, the ring lingers after the strike already fired and players learn to distrust the tell. This is exactly the INV-5 failure class (client/server number drift), but `serverSync.test.ts` currently guards *stat* constants parsed out of `index.ts`; it does **not** yet know about `ATTACKS`.

**Why it happens:**
`ATTACKS` is described as "shared client + server," but SpacetimeDB TS has two separate source trees (`spacetimedb/src` vs `src/game`) with no shared import at runtime — "shared" in practice means "copied and must be kept identical." The serverSync regex harness only checks the fields someone wired into it. New tables/registries slip through because no test asserts parity.

**How to avoid:**
- Make `ATTACKS` a single authored source and mirror it deliberately, then **extend `serverSync.test.ts`** to parse the server `ATTACKS` block and assert every `windupMicros/activeMicros/recoveryMicros/cooldownMicros/damage/radius/angle/reach` equals the client mirror. This is a hard gate for every attack added in B1–B3.
- Prefer the client deriving telegraph geometry/timing *entirely* from server-broadcast fields where possible (the row carries `attackId, phase, startedAt, targetX/Z`); the only thing the client needs locally is the per-`attackId` durations + shape params — which is exactly what the parity test must lock.
- The strike VFX must be driven by the `attack_strike` **event** (server's actual strike instant), not by the client's own timer expiring. That decouples the "flash" from mirror drift even if the ring animation is client-timed.

**Warning signs:**
`serverSync` passes but a two-client playtest shows the ring filling before/after the hit; players report "I dodged and still died"; a duration changed on one side only in a diff.

**Phase to address:** B1 introduces the parity test for `ATTACKS`; every later attack (B2/B3) must keep it green. Treat a failing `ATTACKS` parity assertion as release-blocking.

---

### Pitfall 4: Strike resolves vs server-side positions that lag the player's screen → honest-looking dodges still hit

**What goes wrong:**
The server resolves the hitbox against the **last position it received** for each player. A player who dashed out at the strike frame on their screen may still be, in the server's view, inside the circle — because their movement packet hasn't arrived, or the strike tick fired between their old and new position update. The dodge *looked* clean client-side but the authoritative check says "hit." Under LAN this is small; over maincloud (real RTT) it's the difference between the feature feeling fair and feeling broken.

**Why it happens:**
Server-authoritative + client-rendered telegraph inherently means the player reacts to a tell rendered from server state, moves locally, and the server judges using stale inputs. There is no client-side prediction of the *hit* — only of movement. The strike is a single instant, so there's no forgiveness window unless you build one.

**How to avoid:**
- Give the strike a small **active window** (`activeMicros` spanning ≥1–2 ticks) rather than a single-instant point check, and resolve "was the player inside at ANY sampled tick of the active window" as a hit — but bias toward the player: a player who is outside for the *later* sample of the window should count as dodged (favor the escape).
- Add explicit **dodge grace**: treat a player as safe if they are outside the hitbox at the tick the strike resolves OR were moving out fast enough (the server already tracks positions each tick; compare this-tick vs last-tick). Tune the grace to cover typical maincloud one-way latency.
- Keep the telegraph windup generous enough (≥0.45 s, and the roster's 0.6–0.9 s) that reaction + a movement round-trip both fit inside it; short windups amplify latency unfairness.
- Validate on **maincloud RTT**, not just LAN — the SPEC's "feel pass" and playtests must include a real-latency client, because LAN hides this entirely.

**Warning signs:**
Dodges feel fair on LAN, unfair remotely; players stop trusting telegraphs and just tank hits; the strike hit-rate is near 100% regardless of player skill.

**Phase to address:** B1 (choose active-window + grace model at the FSM core; single-instant point checks are a trap to avoid from the start). Re-validate the tuning at each attack in B2/B3 and in the final feel pass.

---

### Pitfall 5: Removing goliath contact drain leaves a coverage gap — goliaths deal zero (or, later, spiky-unfair) damage

**What goes wrong:**
The SPEC deletes the goliath→player drain (`damagePerTick(goliathRow.contactDamage …)` at ~index.ts:3057, "Pass 4b"). If B1 removes the drain but the FSM only implements `leapSlam`, then for every goliath state where `leapSlam` isn't selectable (player too close, on cooldown, wrong archetype) the goliath deals **nothing**. Players learn to hug the goliath where no attack triggers and facetank it for free. Conversely, once all four attacks exist, flat burst damage (130/220/150 etc.) with poor cooldown gating can chain into an unavoidable spike that one-shots — swapping "undodgeable slow bleed" for "dodgeable but lethal if you blink," which is just as unfair.

**Why it happens:**
The drain is a *continuous, always-on* damage floor; discrete attacks are *conditional*. Removing the floor before the attack coverage is complete creates dead zones. And the SPEC's own contact drains for enemy→goliath (line 3038) and enemy→player (3044) and goliath→enemy (3014) are **separate** code paths — deleting the wrong one, or all of them, changes PVE balance broadly. The selection fn `(distance, cooldownUntil, available[]) → attackId | null` returning `null` too often = dead zone.

**How to avoid:**
- Order B1 so the goliath drain removal lands **together with** a selection fn that guarantees *some* attack is available at every engagement distance band (close→swing, mid→leap, far→dash), even if only `leapSlam` is fully built first — stub the others or keep a minimal fallback so there is never a "no attack applicable" hole. Do NOT delete the drain in a commit that only has one attack unless coverage is proven.
- Only delete the **goliath→player** drain (Pass 4b) this milestone; the SPEC keeps camp-enemy drain and enemy↔goliath drain. Grep the three `damagePerTick` call sites and delete exactly the goliath→player one; leave enemy contact (3044) and goliath-vs-enemy (3014) intact.
- Gate flat burst with real cooldowns (`cooldownUntil`) and ensure two attacks can't resolve on the same tick against the same player; cap simultaneous strike damage per player per tick. Model worst-case chain (`swing`+`swirl` back-to-back = 120+150) against player max HP in a pure balance test.
- Add a "no free-facetank" playtest: stand in every distance band and confirm the goliath eventually threatens you.

**Warning signs:**
A goliath with a player glued to it never attacks; DPS-vs-goliath TTK unchanged after drain removal (means the goliath isn't hitting back); or a full combo deletes a full-HP player with no counterplay.

**Phase to address:** B1 (removal + coverage guarantee, same slice). Burst-chain balance owned across B1–B3 as attacks land; final feel pass validates the spike ceiling.

---

### Pitfall 6: Client-rolled crit trusted for the poise interrupt → trivially spoofable stagger / self-buffed damage

**What goes wrong:**
Phase A keeps the crit roll **client-side** (`isCrit` sent as a reducer arg to `attackEnemies`/`attackRay`), consistent with the existing trust model where the client already sends `damage`. Phase B4 then lets `isCrit` drive the **poise interrupt** (crit during windup → cancel the goliath's attack). A modified client can now send `isCrit: true` on every hit and *also* an inflated `damage`, trivially cancelling every goliath windup and trivializing the mechanic — turning "land a real crit to interrupt" into "never get hit."

**Why it happens:**
The trust model was acceptable when crit only affected a damage number the client already controlled. Elevating that same untrusted bool to a *gameplay-state* trigger (interrupt) raises the stakes: it now controls whether an enemy's attack happens at all, affecting every nearby player's experience, not just the cheater's damage.

**How to avoid:**
- Decide the trust boundary **explicitly in A** and document it: either (a) accept the existing client-trust model consciously (single-shard co-op, low cheat incentive) and note it, or (b) move the crit roll server-side using `ctx.random` in the `attackEnemies`/`attackRay` reducer, sending only `critRate/critDmg`-derived inputs, so the server owns `isCrit`. Server-side roll is the only cheat-proof option and uses the deterministic RNG the engine already provides.
- If keeping client-rolled crit for damage but wanting a trustworthy interrupt, gate the *interrupt* on a server-side re-roll or on a server-computed condition, not the raw client bool.
- Add sanity clamps server-side regardless: reject `damage` outside the plausible range for the attacking character (defense-in-depth for the existing model).

**Warning signs:**
A client can perma-stun goliaths; interrupt rate is ~100% for one player; damage numbers exceed any character's theoretical max.

**Phase to address:** A decides and documents the trust boundary (it introduces `isCrit`); B4 must not elevate an untrusted bool to a state trigger without that decision. If server-side roll is chosen, it belongs in A.

---

### Pitfall 7: Poise / interrupt phase-boundary edge cases (reset timing, interrupt in the wrong phase, off-by-one)

**What goes wrong:**
Poise accrues during `windup` and interrupts at `poise >= poiseThreshold`. Edge cases silently break it: (a) a crit that lands on the **same tick** the windup transitions to `strike` — does it interrupt or does the strike already fire? (b) poise not reset when the attack ends/cancels → carries into the next attack and interrupts it instantly ("free perma-stun"). (c) a crit during `strike` or `recovery` incorrectly counted as poise. (d) the interrupt cancels the attack but forgets to set a `cooldownUntil` stagger, so the goliath re-winds-up next tick with no visible stagger. (e) two crits on the same tick from two players double-count or race.

**Why it happens:**
Poise is per-attack transient state stored on the `unit_attack` row; its lifecycle (set to 0 on windup entry, accrue during windup only, reset on any exit) has several exits (strike, cancel, recovery) that are easy to miss one of. Tick ordering (damage application vs phase advance) determines whether a same-tick crit "sees" windup or strike.

**How to avoid:**
- Define one canonical order **per tick, per unit**: (1) advance phase using `now`, (2) apply queued crit poise only if still in `windup` after advancement, (3) check threshold → cancel, (4) else resolve strike if in `strike`. Write it as a pure helper with explicit tests for every boundary tick.
- Reset `poise = 0` on **every** entry into `windup` (not on exit — entry is the single choke point) so no exit path can leak stale poise.
- Make crit-during-strike/recovery a no-op for poise by construction (only accrue when `phase === windup`).
- On interrupt, always set a stagger `cooldownUntil = now + staggerMicros` and emit a distinct state the client can render (stagger animation) so the interrupt is legible.
- Test the "crit on the exact strike tick" and "second attack after an interrupted first" cases explicitly.

**Warning signs:**
An interrupted goliath instantly re-attacks; a goliath appears stunned forever; interrupts sometimes work and sometimes don't for no visible reason (same-tick race); poise "remembered" across attacks.

**Phase to address:** B4 (interrupt logic), but the poise **column lifecycle** and reset-on-windup-entry must be established in B1 when the row is designed, so B4 only adds the accrual+threshold.

---

### Pitfall 8: Float nondeterminism / ordering across the tick corrupts server-authoritative replay

**What goes wrong:**
The FSM computes hitbox membership with trig/`Math.hypot`/`Math.atan2` (cone arcs, lane capsules) and iterates players/units from `iter()`. If damage is summed into a `Map` keyed by hex and the **iteration order** of units differs, or if you compare a float directly for a phase edge, results can differ run-to-run. SpacetimeDB requires reducers to be deterministic; while a single node replays consistently, order-dependent float accumulation and `Map` insertion order are landmines when combined with `ctx.random` (which advances state per call — calling it in a data-dependent order changes every subsequent roll).

**Why it happens:**
The existing tick already sums damage into `Map`s (`playerDamage`, `enemyDamage`) and relies on `iter()` order. Adding per-unit RNG (attack selection, if randomized) or float thresholds multiplies the surface. `Math.atan2`/`hypot` are deterministic per IEEE-754 but *combining order* isn't associative for floats.

**How to avoid:**
- If attack selection uses randomness, draw from `ctx.random` in a **stable, sorted** unit order (e.g. sort by `unitId`) so the RNG stream is reproducible; never draw inside a `Map`/`Set` iteration whose order isn't guaranteed.
- Keep hitbox membership as **boolean geometry** (inside/outside) resolved per unit independently — don't accumulate a shared float that depends on order. Damage per player is a sum of independent contributions; summing order changing the last ULP is tolerable only because HP is integer — round/clamp at apply time so ULP differences vanish.
- Reuse the tested pure helpers (`distanceBetween`, `stepToward`) and add `pointInCone`/`pointInLane` as pure, unit-tested functions in `combatMath.ts` — no reducer context, fully deterministic, testable.
- Never introduce `Date.now()`, `Math.random()`, or any import with hidden global state into the module.

**Warning signs:**
Rare desync between what one client sees and another; a test that passes sometimes; RNG-driven selection producing different attacks on identical inputs; lint/grep finds `Math.random(` or `Date.now(` in `spacetimedb/src`.

**Phase to address:** B1 (geometry helpers + selection RNG discipline). Add a grep gate (no `Math.random`/`Date.now` in module) to CI as part of this milestone.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Single-instant point check for the strike (no active window) | Simplest hitbox code | Latency makes honest dodges register as hits; unfair on maincloud | Never for a dodge-fairness feature — build the active window in B1 |
| Client-timed strike VFX (flash when local timer expires) instead of `attack_strike` event | No event table plumbing | Flash desyncs from real strike under mirror drift/latency | Never — the event table exists precisely for this; use it |
| Author windups as human seconds (0.9 s) not tick multiples | Reads nicely in the registry | Realized windup silently longer than the number the client mirrors | Never — snap to `WORLD_TICK_INTERVAL_MICROS` multiples |
| Keep crit roll client-side AND drive interrupt from it | Reuses existing trust model, ships A faster | Spoofable perma-stun in B4 | Only if the client-trust boundary is consciously documented in A and cheat incentive is judged low |
| Delete goliath drain before all 4 attacks exist | Unblocks B1 | Damage dead zones / free facetank until B2/B3 land | Only with a proven selection-fn coverage guarantee (no `null` in any band) |
| Skip extending `serverSync.test.ts` to cover `ATTACKS` | Less test wiring | Silent mirror drift breaks dodge fairness with green tests (INV-5 hole) | Never — parity test is the INV-5 contract |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `unit_attack` new table on maincloud | Assuming `init`/seed populates it; testing only on a freshly-seeded local DB | Migrate-publish; verify row count climbs on the *migrated* DB after a real engage; FSM lazily creates rows from unit tables |
| `attack_strike` event table | Reading it like a normal table (`iter()`/`count()` — always empty) | Only `onInsert` fires for event tables; drive one-shot VFX from the insert callback |
| Additive reducer arg `isCrit` on `attackEnemies`/`attackRay` | Publishing module without regenerating client bindings → "no such reducer"/arg mismatch | `spacetime publish` → `pnpm run spacetime:generate` → `pnpm build`, in that order, per the deploy procedure |
| `spacetime generate` after schema change | Forgetting it; client sends old signature to new module | Regen bindings every schema/reducer-arg change; it's step 2 of the deploy procedure |
| Publishing to only one env | Client on maincloud calls a reducer the local-only module has → "no such reducer" | Push module to the env the target client actually connects to; maincloud only at the milestone's prod point, never `--delete-data` |
| Poise `u32` column added to `unit_attack` | (Table is new, so no default needed) — but adding a column to an *existing* table later needs `.default()` | New table: fine. If poise is later added to `goliath`/`enemy` instead, it needs `.default()` or migrate fails |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| One `unit_attack` row per unit + O(units×players) hitbox checks every 150 ms | Tick duration creeps toward the 150 ms budget; ticks coalesce/late (worsening Pitfall 1) | Only run hitbox geometry during the `strike` active window (idle/windup/recovery are cheap state advances); broad-phase by distance band before per-player cone/lane math | Many goliaths + many camp enemies all in `strike` same tick |
| Iterating all players for every attacking unit | Quadratic growth as concurrent raids scale | Pre-build the player list/map once per tick (code already does `playerByHex`); reuse it; spatially cull to engage range first | High player + high unit count on maincloud |
| Writing every `unit_attack` row every tick even when unchanged | Excess table writes → subscription churn to all clients each tick | Only `update()` a row when its phase/target actually changes; idle units with no state change get no write | Every unit idle but still being written each tick |
| Broadcasting `unit_attack` updates to all subscribers | Client bandwidth spikes with unit count | Rely on STDB delta subscriptions; keep the row small (already u32/f32 fields); don't add churny fields (e.g. a per-tick counter) | Large worlds, many spectators |
| Emitting `attack_strike` per struck player instead of per strike | Event flood, duplicate VFX | One `attack_strike` per strike instant (the SPEC's shape: unit + position + dir), client resolves affected players locally for feedback | Wide AoE hitting many players |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Trusting client `isCrit` to drive the poise interrupt | Perma-stun / trivialized goliaths for all nearby players | Server-roll crit with `ctx.random`, or gate the interrupt on a server condition; document the boundary in A |
| No server clamp on client-sent `damage` (pre-existing model) | Inflated damage + guaranteed interrupts | Clamp `damage` to the attacking character's plausible max server-side (defense-in-depth) |
| Using `ctx.sender` vs a player-id arg inconsistently for who dealt the crit | Spoofing "someone else" landed the interrupt | Always attribute via `ctx.sender`; never trust an identity passed as an arg |
| Strike resolves against a client-supplied position | Player claims they were elsewhere to dodge/land | Resolve strike against server-tracked player positions only (already the model — keep it) |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Telegraph ring low-contrast under the pixel filter | Players can't read the tell → dodge feels random | High-contrast, saturated ring vs the Mondstadt-green ground; test readability *through* the pixel filter at target resolution, not in raw Three.js; consider a bright rim + fill, and the Frost accent (#86e2ff) is the established high-visibility cue |
| Windup animation not visually distinct from idle/move | No "wind-up" read; hits feel unavoidable | Distinct windup clip per attack in the animation FSM; the tell must be legible in <0.45 s (the shortest windup) |
| Ring geometry doesn't match the actual hitbox | Players dodge the drawn ring but the real hitbox differs → distrust | Client derives ring radius/cone angle/lane width from the SAME `ATTACKS` params the server uses (parity test covers this) |
| Strike flash timed off the client's own clock | Flash and damage disagree → feels laggy/broken | Flash on the `attack_strike` event (server truth) |
| No stagger feedback on interrupt | Interrupt succeeds but looks like nothing happened | Distinct stagger state/animation + brief cooldown so the cancel is visible |
| Pixel filter snaps sub-pixel ring growth | Ring "pops" between sizes, hard to read timing | Quantize ring growth to readable steps or ensure the filter resolution is high enough that growth reads smoothly |

## "Looks Done But Isn't" Checklist

- [ ] **Additive migrate:** Verified on a **migrated** (not freshly-seeded) DB that `unit_attack` rows appear and goliaths actually strike — count > 0 after a real engage.
- [ ] **Mirror parity:** `serverSync.test.ts` extended to assert every `ATTACKS` duration/geometry field matches client mirror; test fails if either side changes alone.
- [ ] **Late-tick handling:** FSM resolves a strike whose deadline was passed by a coalesced/late tick instead of skipping it.
- [ ] **Drain removal scope:** ONLY goliath→player drain deleted; camp-enemy drain and enemy↔goliath drain still intact (grep the three `damagePerTick` sites).
- [ ] **No damage dead zone:** Selection fn returns a valid attack in every distance band; no free-facetank spot on a goliath.
- [ ] **Poise reset:** `poise` zeroed on every `windup` entry; interrupt sets a visible stagger cooldown; crit outside windup is a poise no-op.
- [ ] **Determinism gate:** No `Math.random`/`Date.now` in `spacetimedb/src`; RNG (if used) drawn in stable unit order.
- [ ] **Maincloud-latency dodge feel:** Dodge fairness validated over real RTT, not just LAN.
- [ ] **Bindings regenerated:** `spacetime generate` + build run after the `isCrit` arg + new tables; no "no such reducer".
- [ ] **Pixel-filter readability:** Telegraph tested through the actual pixel filter at target resolution.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Goliaths harmless on migrated DB (empty table / no activation) | LOW | Ship idempotent activation reducer or fix FSM to iterate unit tables; re-publish (migrate, no wipe); verify count > 0 |
| Mirror drift shipped (unfair dodges) | LOW–MEDIUM | Fix the drifted number on one side; add the `ATTACKS` parity assertion so it can't recur; republish + regen + build |
| Client `isCrit` spoof enabling perma-stun | MEDIUM | Move crit roll server-side (`ctx.random`) or gate interrupt on server condition; republish module; regen bindings |
| Burst combo one-shots players | LOW | Retune `damage`/`cooldownMicros` in `ATTACKS` (data-only), cap per-tick per-player strike damage; client-only change if durations mirrored — republish if server values changed |
| Determinism bug causing desync | HIGH | Reproduce via pure-helper tests; enforce stable ordering + integer HP clamping; hardest to catch post-hoc — prevent in B1 |
| Damage dead zone (facetank) | LOW | Add a fallback attack / widen selection bands in `UNIT_ATTACKS`; data-driven, republish |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1 — Tick/phase time math & late ticks | B1 | Pure `phaseFor` tests incl. jumped-interval input; realized windup == authored in playtest |
| 2 — Empty new table on live DB / activation | B1 (deploy step) | Row count > 0 after engage on a *migrated* DB; goliath strikes in cloud playtest |
| 3 — Client mirror drift (INV-5) | B1 (extend parity test); held green in B2/B3 | `serverSync.test.ts` asserts `ATTACKS` parity; fails on one-sided edit |
| 4 — Dodge fairness under latency | B1 (active window + grace); retune per attack | Maincloud-RTT two-client dodge test; skill correlates with dodge success |
| 5 — Drain removal coverage / burst spike | B1 (removal + coverage), balance across B1–B3 | No facetank spot; worst-case combo modeled vs max HP |
| 6 — Client-crit trust for interrupt | A (decide/document boundary); B4 respects it | Attempt spoofed `isCrit`; interrupt not trivially forced |
| 7 — Poise/interrupt edge cases | B1 (column lifecycle) + B4 (accrual/threshold) | Same-tick-strike & post-interrupt-re-attack tests; visible stagger |
| 8 — Float/ordering determinism | B1 (geometry helpers + RNG order) | No `Math.random`/`Date.now` grep gate; sorted RNG order; pure geometry tests |
| Performance (many rows / 150 ms) | B1 (only geometry in strike; write-on-change) | Tick duration stays well under 150 ms with many units in strike |
| Pixel-filter readability | B2/B3 renderers + animation FSM slice | Telegraph legible through pixel filter at target res |

## Sources

- `CLAUDE.md` — SpacetimeDB determinism rules (`ctx.timestamp`/`ctx.random`, no wall clock/random), additive-migrate gotchas ("init only on fresh DB", "can't drop a table with rows", "new column needs default"), deploy/backup procedure, event-table semantics, ownership 403 trap. HIGH.
- `.planning/PROJECT.md` — INV-5 (client/server mirror sync via `serverSync.test.ts`), additive-schema cross-cutting constraint, deploy procedure, `account`/`account_link` not in backup set. HIGH.
- `.planning/transcendence/combat-telegraphed-attacks-SPEC.md` — FSM/schema/roster design, build slices, client-trust crit model, open questions incl. pixel-filter readability. HIGH.
- Codebase: `spacetimedb/src/index.ts` (`worldTick` structure, single `now` sample at 2809, the three `damagePerTick` contact sites 3014/3044/3057, `Map`-summed damage), `spacetimedb/src/combatMath.ts` (pure tick helpers, `tick = WORLD_TICK_INTERVAL_MICROS` convention), `src/game/data/__tests__/serverSync.test.ts` (regex parity harness — currently stat-only, no `ATTACKS`). HIGH.
- SpacetimeDB engine model — scheduled reducers are best-effort not metronomic; event tables fire only `onInsert`; reducers deterministic per replay. MEDIUM-HIGH (engine general knowledge, corroborated by CLAUDE.md).

---
*Pitfalls research for: telegraphed-attack FSM + crit/poise on live SpacetimeDB multiplayer*
*Researched: 2026-07-08*
