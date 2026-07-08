---
phase: 3
phase_name: "Shards at risk"
project: "super-elements"
generated: "2026-07-08"
counts:
  decisions: 8
  lessons: 7
  patterns: 6
  surprises: 2
missing_artifacts:
  - "UAT.md"
---

# Phase 3 Learnings: Shards at risk

## Decisions
### Flat result object, not a discriminated union
`applyDeathShardPenalty` returns a single flat `DeathShardPenalty` (`shardsLost`, `erodedTranscend`, `erodedConstellation`, `nextShards`, `nextTranscendLevel`, `nextConstellation`) rather than the `ok:true|false` union used by the analog `transcendInstall.ts`.

**Rationale:** A death always resolves to *some* outcome (shard loss, level erosion, or a no-op) — there is no failure branch — so every path yields `next*` values the reducer applies directly. A union would add ceremony with no case to reject.
**Source:** 03-01-SUMMARY.md

---

### PVP killer credit decoupled from the gem-spill guard
The shard credit to a PVP killer is gated on `stolen > 0 || result.shardsLost > 0`, folded into a single attacker update — deliberately NOT nested inside the existing gem-only `if (stolen > 0)` block.

**Rationale:** A shard carrier holding 0 gems produces `stolen === 0`; nesting the shard credit under the gem guard would silently drop the shard transfer and break the A1 conservation invariant. Credit is `attacker.transcendShards + result.shardsLost` (never a hardcoded `+1`), so an empty victim mints nothing.
**Source:** 03-02-SUMMARY.md, 03-VERIFICATION.md

---

### Self-facing diff-driven toast, no broadcast event table (D2)
The shard lost/stolen/stole feedback is driven entirely by a local `transcendShards` diff plus local timing signals; no `shard_steal` broadcast event table was created.

**Rationale:** The counter is already reactive via `useTable(player)`, and all three roles (PVE drop / stolen-victim / stole-killer) are knowable client-side from the diff direction + a recent `pvpHit`-on-me ref + a recent local collect-request ref. A named cross-player feed remains an optional future stretch.
**Source:** 03-RESEARCH.md, 03-04-SUMMARY.md

---

### Void death (`fallToDeath`) not wired to the shard penalty (D1)
Only the three enumerated death paths (`takeDamage`, `worldTick` loop, `attackPlayer`) apply `applyDeathShardPenalty`; `fallToDeath` is left unchanged.

**Rationale:** The spec enumerates exactly three death paths. Void death is treated as shard-safe by design; if it should cost a shard later it is a one-line wiring change. Encoded as an explicit prohibition.
**Source:** 03-RESEARCH.md, 03-VERIFICATION.md

---

### Constellation erosion relies on the read-time clamp, no activation-row write (D3)
Eroding `owned.constellation` writes no `character_activation` row; the existing `activatedConstellationFor` read-time clamp (`Math.min(activatedConstellation, unlocked)`) covers it.

**Rationale:** Every server-side scaling read already flows through the clamp helper with `unlocked = current owned.constellation`, so an eroded ceiling auto-clamps active power on the next read. A verification during wiring confirmed no un-clamped consumer exists.
**Source:** 03-02-SUMMARY.md, 03-RESEARCH.md

---

### `shard_drop` excluded from `vacuumGems`
Camps sweep only `gemDrop` into their hoards; shards are intentionally left out of the vacuum path.

**Rationale:** Shards are scarce and meant for players to contest. Letting a camp absorb a dropped shard would be a permanent denial-of-reward (Threat T-03-05). The 1.2s pickup grace already handles instant-pickup races.
**Source:** 03-PATTERNS.md, 03-RESEARCH.md

---

### Loss distinguished from gain by motion, not hue
The loss flash `.wallet-chip--drain` is a quick shrink in the same `--shard` purple; `--danger`/red is deliberately kept out.

**Rationale:** Losing a shard is an event that happens *to* the player, not a destructive action they confirm, so the shipped semantic contract keeps `--danger` reserved. Motion (shrink vs pulse) carries the loss/gain signal while the surface stays unmistakably shard-family purple.
**Source:** 03-UI-SPEC.md, 03-04-SUMMARY.md

---

### Additive publish to local only; maincloud left paused
The new `shard_drop` schema was migrate-published (no `--delete-data`) to `--server local` only; the prod push is a separate manual step.

**Rationale:** maincloud was paused (carried over from Phase 2); Phase 3's slice targets local for its playtest gate. The migration plan was verified ADD-only (table CREATE, no drops) and player count was spot-checked 2-before / 2-after to confirm durable data survived.
**Source:** 03-03-SUMMARY.md

---

## Lessons
### `shardsLost` overstates the loss when `loss > transcendShards` (latent mint)
The has-shards branch returns `shardsLost: loss` unconditionally while `nextShards` clamps at 0 — equal only while `transcendShards >= loss`. With `SHARD_DEATH_LOSS = 1` and the branch already proving `> 0` it is harmless today, but any future balance change raising the loss above 1 reintroduces a shard-mint with no failing test.

**Context:** Flagged as WR-01 (Warning) in code review; the fix is to report `transcendShards - nextShards` (= `min(loss, transcendShards)`) and add a `loss=2, shards=1` test case. The existing specs only exercise `loss = 1`, so the trap is silent.
**Source:** 03-REVIEW.md

---

### `findOwnedRow` can return undefined — guard every death path
`findOwnedRow` is an `Array.find(...)` and can be `undefined`; reading `activeOwned.transcendLevel` on the impossible missing-owned case would throw and abort the death reducer.

**Context:** A Rule-2 deviation added the defensive `activeOwned ? … : 0` idiom (matching `respawnPlayerAtSpawn`/`setActiveHealth`) in all three death paths. Shard loss still applies; only owned-row erosion is skipped when the row is missing.
**Source:** 03-02-SUMMARY.md

---

### An interface member forces its bridge to land in the same commit
Making `sendCollectShard` a required member of `GameNetworkActions` broke `tsc -b` until `App.tsx`'s inline network object satisfied it — so the bridge line had to move into Task 1, not the later wiring task.

**Context:** A Rule-3 blocking deviation. Per-commit green builds require that an interface change and every implementor of it land together, even when the plan sequenced them apart.
**Source:** 03-04-SUMMARY.md

---

### The counter chip does not live in `App.tsx` — flash must be threaded to the screens
The `.wallet-chip` shard counter renders inside `CharacterScreen` and `GachaScreen`, not the App HUD, so the flash modifier could not be applied where the diff was computed.

**Context:** A Rule-2 wiring deviation: App computes `shardFlashClass` from the diff and passes it as an optional prop to both screens. The plan's `files_modified` list under-scoped the change.
**Source:** 03-04-SUMMARY.md

---

### Timing-heuristic disambiguation can mislabel adjacent events
`lastPvpHitOnMeAtRef` is stamped on every incoming `pvpHit` (including non-fatal ones), so a PVE death within 2.5s of a non-fatal PVP poke mislabels the drop as "stolen". Similarly a slow (>2.5s) up-diff round-trip can render a self-pickup as a kill-steal.

**Context:** IN-01/IN-02 Info findings — cosmetic only (the shard genuinely moved; only the label is wrong). Fixes: narrow the window, or only stamp on a would-be-fatal hit / consume the pickup ref when the matching diff arrives.
**Source:** 03-REVIEW.md

---

### `pnpm exec` install noise can obscure a command's real exit status
The `pnpm exec` form of `tsc`/`vitest` emitted install output that hid the true pass/fail signal; running the `npx` binaries directly gave a clean, trustworthy exit status.

**Context:** Adopted during the Plan 01 verification to confirm green results reliably.
**Source:** 03-01-SUMMARY.md

---

### No in-process reducer/DB harness — some invariants are playtest-only
Server-logic tests are all pure cross-imports; there is no mock-DB harness. So "PVE creates a drop not a credit", "PVP transfers exactly `shardsLost`", "empty victim mints nothing", and "0-gem carrier still transfers" are verifiable only at the helper-math level plus code review plus a two-client playtest.

**Context:** Documented honestly in RESEARCH/VALIDATION and closed by a human-approved five-scenario two-client playtest that served as the phase gate. Building a DB mock was ruled out of scope.
**Source:** 03-RESEARCH.md, 03-VALIDATION.md, 03-05-SUMMARY.md

---

## Patterns
### Pure dependency-free decision helper, cross-tested under client vitest
Extract the reducer decision into a `spacetimedb/src/*.ts` module with zero imports (no ctx/DB/random/time) and unit-test it by importing across the package boundary (`../../../../spacetimedb/src/...`) from the client vitest runner.

**When to use:** Any reducer decision that must stay deterministic and be cheaply testable and/or previewable client-side. The established house pattern (mirrors `transcendInstall.ts`).
**Source:** 03-PATTERNS.md, 03-01-SUMMARY.md

---

### Branch order as the u32-underflow safety property
Order the priority gates (`shards > 0` → `transcendLevel > 0` → `constellation > 0` → no-op) so that a value is only ever decremented inside the branch that already proved it `> 0`; use `Math.max(0, …)` on the subtractive branch.

**When to use:** Any unsigned-integer economy math in a deterministic reducer where an underflow would corrupt state. The ordering *is* the guard — no separate bounds check needed.
**Source:** 03-RESEARCH.md, 03-PATTERNS.md

---

### In-file mirror of an existing subsystem for a scarce variant
Clone the whole gem-drop pipeline (`gem_drop` table → `spillGems`/`spillDenominations` → `collectGem` → `createGemMesh`/`updateGemDrops`/`syncGemDrops`) into a shard variant, reusing constants verbatim (`GEM_PICKUP_DELAY`, `GEM_MAGNET_RADIUS`, `GEM_SPILL_SCATTER`, `gemIsCollectible`) and changing only what differs (single-piece spill, purple 1.4× mesh).

**When to use:** When a new feature is a scarcity/visual variant of a shipped subsystem — mirror the proven machinery rather than generalizing or hand-rolling; reuse the grace/anti-cheat helpers instead of forking them.
**Source:** 03-PATTERNS.md, 03-02-SUMMARY.md, 03-04-SUMMARY.md

---

### Client-side event disambiguation via diff + local timing refs (no broadcast table)
Tell apart PVE-drop / stolen-victim / stole-killer / plain-pickup from one reactive `transcendShards` diff combined with two local signals: a recent `pvpHit`-on-me timestamp and a recent local collect-request timestamp — the client already knows the actions it initiated.

**When to use:** When feedback only needs to be self-facing; avoids a new broadcast event table for events the local client has enough context to classify.
**Source:** 03-04-SUMMARY.md, 03-UI-SPEC.md

---

### Additive migrate-publish then regenerate bindings
For a new table (not a column change), publish with NO `-c`/`--delete-data`, verify the Migration Plan shows CREATE-only with zero drops, spot-check a durable row count before/after, then `pnpm run spacetime:generate` to refresh typed client bindings.

**When to use:** Every additive schema change on a DB with real data. A brand-new table is inherently additive and safe; the count spot-check is the cheap proof.
**Source:** 03-03-SUMMARY.md

---

### Human two-client playtest as the phase gate for non-automatable behaviors
When behaviors depend on cross-reducer state mutation that no in-process harness can exercise, gate the phase on a scripted set of live two-client scenarios run and approved by a human tester, with the agent stopping at a blocking checkpoint and resuming on approval.

**When to use:** Server-authoritative multiplayer economy/combat invariants with no mock-DB harness. Pair it with helper-level unit tests + code review so only the genuinely un-unit-testable slice rests on the playtest.
**Source:** 03-05-SUMMARY.md, 03-VALIDATION.md

---

## Surprises
### Enemies can magnet-pick a shard drop and re-drop it on death
The reused gem magnet/collect loop lets a `shard_drop` be picked up not just by any player but by enemies; when such an enemy is later killed the shard re-drops at its death spot. The tester liked it and it broke none of the five gated invariants, so it was kept and deferred to a future balance phase (candidate Phase 7).

**Impact:** No code change this phase; phase stays approved. Flagged as an adjacent concern to the "camps must not vacuum a drop" invariant (camp vacuum is a *permanent* denial; enemy pickup is *reversible* on death, which is why it is a like-to-keep rather than a defect). A future phase should decide whether to formalize, bound, or restrict it.
**Source:** 03-05-SUMMARY.md, 03-VERIFICATION.md

---

### The A1 conservation invariant is currently protected only by a constant's value
Code review found the whole-phase conservation guarantee (killer/drop never exceed the victim's real loss) holds today only because `SHARD_DEATH_LOSS = 1` happens to equal the branch's proven minimum. The helper's own comment ("spend up to `loss` shards") does not match the code, and no test exercises `loss > 1`.

**Impact:** A latent mint would reappear the moment a balance pass raises the loss above 1 — with no failing test to catch it. Recorded as WR-01 for a follow-up fix (report the actually-removed amount + add a `loss > shards` test case).
**Source:** 03-REVIEW.md
