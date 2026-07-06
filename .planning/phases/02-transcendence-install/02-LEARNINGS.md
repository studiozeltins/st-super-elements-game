---
phase: 02
phase_name: "transcendence-install"
project: "super-elements"
generated: "2026-07-06"
counts:
  decisions: 8
  lessons: 5
  patterns: 5
  surprises: 3
missing_artifacts:
  - "02-05-SUMMARY.md (plan 05 still open at its human-verify playtest checkpoint)"
  - "02-VERIFICATION.md (phase not yet verified)"
  - "02-UAT.md"
---

# Phase 02 Learnings: transcendence-install

## Decisions

### Install-gate ordering puts the shard check last
`resolveTranscendInstall` gates strictly `below_c6 → at_cap → insufficient_shards`. The shard-cost comparison is evaluated only after the C6 and cap gates pass, so `shardCost` is never computed for an invalid level — a deliberate u32-underflow mitigation (threat T-02-03).

**Rationale:** Computing cost before validating the level could underflow an unsigned subtraction; ordering the cheap validity gates first makes the arithmetic gate unreachable with bad input.
**Source:** 02-01-SUMMARY.md

### Additive column appended after `constellation` with `.default(0)`
`owned_character.transcendLevel: t.u32().default(0)` was appended at the end of the row, not inserted mid-table, and given a default.

**Rationale:** SpacetimeDB rejects a mid-table or non-defaulted new column on a populated live table; append + default backfills existing rows to 0 with no wipe (protects the C0–C6 floor).
**Source:** 02-02-SUMMARY.md

### `restoreOwnedCharacters` backfills `transcendLevel:0` inline
The restore insert sets `transcendLevel: 0` inline rather than adding the field to the `RestoreOwnedCharacterRow` wire type.

**Rationale:** Keeps the existing backup JSON format valid — old backups predate the column, and 0 is the correct restore value.
**Source:** 02-02-SUMMARY.md

### Scarce-currency reducer takes only an entity id
`transcendCharacter({ characterId })` accepts no amount/level — every rule (C6 gate, cap, cost, ownership) is enforced server-side via the pure decision helper; rejects mutate nothing; shard deduct + level raise happen only on `ok`.

**Rationale:** The client cannot be trusted with cost or eligibility; the server is the sole authority ("shards buy real power" invariant).
**Source:** 02-02-SUMMARY.md

### `transcendDamageMultiplier` subsumes the local constellation multiplier
The pure `transcendDamageMultiplier(activeConstellation, activeTranscend)` replaces the local `constellationDamageMultiplier` at both the attack and skill sites; the local `CONSTELLATION_DAMAGE_STEP` arrow fn was deleted.

**Rationale:** One pure module owns the step constants (single source of truth), unit-testable without the game loop.
**Source:** 02-01-SUMMARY.md, 02-04-SUMMARY.md

### `transcendById` reuses the existing subscription + scaling effect
The owner-filtered `transcendById` map is built inside the already-subscribed `ownedCharacterRows` loop that builds `constellationById`; `setActiveTranscend` rides the existing scaling effect whose dep array already includes `ownedCharacterRows`.

**Rationale:** No new subscription or effect — the derived per-character map and the setter piggyback on infrastructure that already reacts to the right data.
**Source:** 02-04-SUMMARY.md

### Props added a plan early to keep the build green
`transcendById` + `onTranscend` were added to `CharacterScreenProps` in plan 04 (the bridge), even though plan 05 owns the UI that consumes them (a documented Rule-3 deviation).

**Rationale:** Threading the props in plan 04 keeps `pnpm build` green at the plan boundary; plan 05 fills in the consuming UI.
**Source:** 02-04-SUMMARY.md

### Deploy targets the LIVE `CharacterScreen`, not `CharacterSheet`
Plan 05 explicitly targets `src/ui/CharacterScreen.tsx` (App.tsx:474); `CharacterSheet.tsx` is dead code and must never be touched.

**Rationale:** A prior retarget established CharacterScreen as the live surface; editing the dead component would produce invisible work.
**Source:** 02-05-PLAN.md

---

## Lessons

### SpacetimeDB won't add a mid-table or non-defaulted column to a populated table
The additive migration only succeeds because the column is appended and defaulted. A mid-table insert or a non-defaulted column would be rejected against live rows.

**Context:** Adding `transcendLevel` to `owned_character` on a DB with real player data.
**Source:** 02-02-SUMMARY.md

### Adding a column silently breaks the restore spread-insert typecheck
Introducing `transcendLevel` broke `restoreOwnedCharacters` with TS2345 — the `RestoreOwnedCharacterRow` wire type lacked the field, so the spread insert no longer satisfied the row type.

**Context:** A schema addition has a non-obvious blast radius into backup/restore code paths that spread-insert rows.
**Source:** 02-02-SUMMARY.md

### The client compiles against generated bindings, not the live DB
`pnpm build` type-checks against `src/module_bindings/`, so it would falsely pass without a publish + regenerate, and the reducer call would 404 ("no such reducer") at runtime. The deploy plan (03) must run after all server edits and before any client wiring.

**Context:** Why the BLOCKING deploy gate exists between server plans (01–02) and client plans (04–05).
**Source:** 02-03-PLAN.md, 02-03-SUMMARY.md

### A paused maincloud DB returns a non-destructive 500, not a 403
The maincloud publish failed with `500 database is paused` — distinct from the 403 ownership case. Per the deploy directive, no wipe/clear recovery was attempted; the DB must be resumed in the dashboard, then the additive publish re-run.

**Context:** Distinguishing a benign, recoverable deploy failure from the destructive ownership-mismatch path matters — the wrong reaction (clear/wipe) destroys accounts.
**Source:** 02-03-SUMMARY.md

### Binding verification keys on generated symbols, not the camelCase accessor
Bindings were verified by grepping the generated `transcend_character` / `TranscendCharacterReducer` / `transcend_level` symbols; the camelCase `conn.reducers.transcendCharacter` accessor and `.transcendLevel` field are SDK-derived at runtime from those.

**Context:** Post-generate verification must look for the snake_case/PascalCase symbols the generator actually writes.
**Source:** 02-03-SUMMARY.md

---

## Patterns

### Pure cross-boundary decision helper
Extract a reducer's decision branch into a pure module (no `ctx`, no imports of runtime, no time/random), then unit-test it via the client vitest runner by importing across the package boundary (`../../../../spacetimedb/src/...`).

**When to use:** Any server rule that also needs client-side preview/UX (install gates, damage math) — write once, test cheaply, share both sides.
**Source:** 02-01-SUMMARY.md

### Union-typed result with load-bearing gate ordering
Return `{ ok: true, ... } | { ok: false, reason }` where the order of the gates is itself the safety property (cheap validity gates before arithmetic gates).

**When to use:** Decision helpers where a later gate's computation is only safe once earlier gates pass.
**Source:** 02-01-SUMMARY.md

### Server-authoritative scarce-currency reducer
Reducer accepts only an entity id; a pure helper decides gate/cap/cost/ownership; rejects mutate nothing; the spend + grant apply only on `ok`.

**When to use:** Any spend of a scarce, server-tracked currency where the client must not be trusted with cost or eligibility.
**Source:** 02-02-SUMMARY.md

### Piggyback derived per-character maps on an existing subscription loop
Build the new owner-filtered map inside the loop that already produces a sibling map, and let the new setter ride the existing effect's dependency array.

**When to use:** Adding a per-character derived value that depends on data already subscribed and already looped — avoids a redundant subscription/effect.
**Source:** 02-04-SUMMARY.md

### Additive deploy: migrate → verify data → verify bindings
Publish with `--module-path spacetimedb --server <env> --yes` and NO destructive flag; confirm the STDB Migration Plan shows only the intended column add; spot-check pre/post `SELECT COUNT(*)` to prove data survived; grep the regenerated bindings for the new symbols before committing.

**When to use:** Any schema/reducer change deployed to a DB that holds real data.
**Source:** 02-03-SUMMARY.md

---

## Surprises

### maincloud database was paused mid-deploy
The additive maincloud publish returned `500 database is paused` — an unanticipated, non-destructive block that split the deploy: local succeeded, prod deferred to a manual dashboard resume.

**Impact:** Client plans 04/05 were unblocked (they build against local bindings), but a prod ship now carries an outstanding manual step; the pre-transcend module still runs on maincloud.
**Source:** 02-03-SUMMARY.md

### A schema addition reached into backup/restore code
Adding `transcendLevel` broke a typecheck in `restoreOwnedCharacters` — a file with no logical connection to the transcend feature — because it spread-inserts the row type.

**Impact:** A one-line auto-fix (inline `transcendLevel: 0`), but it flagged that column additions must be scanned against every spread-insert of that row type, including restore/seed paths.
**Source:** 02-02-SUMMARY.md

### Server-authored plans landed in ~2–3 minutes each
Plans 01–04 each completed in ~2–3 minutes — the pure-helper-first structure (test-first, dependency-free) and additive schema meant almost no rework; the only deviations were single-line auto-fixes.

**Impact:** The heavy structuring cost is in planning (pure helpers, wave ordering, deploy gate), not execution — execution was near-frictionless until the human-verify UI/playtest work in plan 05.
**Source:** 02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-04-SUMMARY.md
