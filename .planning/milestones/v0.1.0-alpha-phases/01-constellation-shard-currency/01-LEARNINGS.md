---
phase: 1
phase_name: "Constellation shard currency"
project: "super-elements"
generated: "2026-07-08"
counts:
  decisions: 6
  lessons: 4
  patterns: 4
  surprises: 3
missing_artifacts:
  - "UAT.md"
---

# Phase 1 Learnings: Constellation shard currency

## Decisions

### Extract the overflow decision into a pure `resolveDupeGrant` helper
The C6-overflow dupe-grant decision was factored into `spacetimedb/src/gachaOverflow.ts` as a dependency-free pure function (`resolveDupeGrant(currentConstellation, maxConstellation, shardPerOverflow) → { constellation, shardMinted }`), imported by `index.ts` for real execution and cross-imported by a Vitest suite for testing.

**Rationale:** Satisfies the "pure-helper unit test" acceptance without booting a SpacetimeDB module in the test runner, and keeps the calling reducer deterministic (no `ctx.random`/time/I-O). Mirrors the established `combatMath.ts` / `serverWorldSim.test.ts` cross-import pattern already in the repo.
**Source:** 01-RESEARCH.md, 01-01-SUMMARY.md

### Persist shards as a plain `t.u32()` column on `player`, not a side table
`transcendShards` was added as an additive `u32` column on the existing `player` table rather than a separate currency table or JSON blob.

**Rationale:** Matches every other currency (`gems`, `gemsFromKills`) and keeps the change additive; no new subscription plumbing needed since `useTable(tables.player)` already flows the row to the client.
**Source:** 01-RESEARCH.md, 01-02-SUMMARY.md

### Add `.default(0)` to the new column so the additive migrate backfills
The table column was changed from `transcendShards: t.u32()` to `transcendShards: t.u32().default(0)` during deploy.

**Rationale:** SpacetimeDB refuses to add a non-defaulted column to an already-populated table without a manual migration or data wipe; `.default(0)` lets the migrate backfill existing player rows to 0 with no `--delete-data`, honoring the additive-only project constraint.
**Source:** 01-03-SUMMARY.md

### Deploy to LOCAL only; leave maincloud untouched this phase
The additive migrate and binding regen were published to `local` only.

**Rationale:** Per REQUIREMENTS + planner note, Phase 1's acceptance is local; the full multi-environment deploy is a later (Phase 7) responsibility. Avoids risking real maincloud accounts on an early economy change.
**Source:** 01-03-SUMMARY.md, 01-RESEARCH.md

### Extract a shared `.wallet-chip` CSS class consumed by both screens
Rather than a screen-local copy of the wallet styling, one shared `.wallet-chip` class (gold, 15px, `letter-spacing: 0.04em`, lifted from `.gacha__wallet`) is consumed by both the Gacha wallet and the Character topbar chip.

**Rationale:** UI-SPEC's preferred DRY path; guarantees the two chip instances are provably visually identical (same glyph/color/size/format) instead of drifting.
**Source:** 01-04-SUMMARY.md, 01-UI-SPEC.md

### Recolor the shard chip from gold to amethyst and pull per-pull mint feedback forward
A post-build revision recolored the shard chip from `--gold` `#f2c14e` to `--shard` `#9333ea` (royal amethyst), and the per-pull "+N ◈" mint fly-token animation — originally deferred to Phase 2 — was implemented in this phase (`PullAnimation.tsx`, `.reveal-card--minted` / `.shard-fly`).

**Rationale:** A gold shard chip was visually indistinguishable from the gold gems readout, so shards needed their own color to read as a distinct currency. The feedback was folded in once the distinct currency identity made it worthwhile.
**Source:** 01-UI-SPEC.md (POST-BUILD REVISION 2026-07-06)

---

## Lessons

### SpacetimeDB blocks adding a non-defaulted column to a populated table
The first `spacetime publish` aborted with "Adding a column transcend_shards to table player requires a default value annotation ... Aborting because publishing would require manual migration or deletion of data." The fix was `.default(0)` on the table column only (not the `RestorePlayerRow` `t.object` field).

**Context:** Discovered during deploy (plan 03), after the column had been defined as bare `t.u32()` in plan 02 and passed typecheck + full test suite. The requirement was invisible until an actual migrate against a populated DB.
**Source:** 01-03-SUMMARY.md

### Additive migrate backfills existing rows to 0 (assumption A1 confirmed)
The research flagged as its single assumption (A1) that an additive republish would auto-add the `u32` column defaulting to 0 for existing rows. After deploy, `SELECT identity, transcend_shards FROM player` showed existing rows at `transcend_shards = 0` with no error — confirmed, but only once `.default(0)` was present.

**Context:** The assumption was correct in spirit but conditional on the explicit `.default(0)` annotation; without it the migrate refused rather than silently defaulting.
**Source:** 01-RESEARCH.md (A1), 01-03-SUMMARY.md

### `MAX_CONSTELLATION` is not exported from the client constant mirror
The cross-import test could not reuse a shared `MAX_CONSTELLATION`; it uses a local `const MAX = 6` with a comment mirroring the server value, whereas `SHARD_PER_OVERFLOW_DUPE` was available from the client mirror.

**Context:** Not every server tunable has a client mirror; test authors must check which constants are actually exported before assuming a single source of truth.
**Source:** 01-01-SUMMARY.md

### The `refund` accumulator and `DUPLICATE_REFUND` had to be fully removed, not left dormant
Leaving any `+ refund` term in the final `player.update` would drift gems on a C6-dupe and fail success criterion 1. The fix collapsed `grantCharacter`'s two owned-dupe branches into a single `resolveDupeGrant` call, renamed the accumulator to `shardsMinted`, and deleted the constant and all stale "refund" doc comments (repo grep for `DUPLICATE_REFUND` = 0).

**Context:** Ensures every `grantCharacter` return carries `shardMinted` so `pullBanner`'s unconditional `shardsMinted += result.shardMinted` never adds `undefined`; the "no dead code" project rule made full removal (not deprecation) mandatory.
**Source:** 01-02-SUMMARY.md, 01-VERIFICATION.md

---

## Patterns

### Pure server helper cross-imported by client Vitest
A server-side decision is factored into a `ctx`/`db`-free `.ts` module under `spacetimedb/src/` that `index.ts` imports for execution and a test in `src/game/data/__tests__/` imports via a `../../../../spacetimedb/src/` relative path.

**When to use:** Whenever server/reducer logic needs a fast, deterministic unit test without standing up a live SpacetimeDB module. Analog: `combatMath.ts` + `serverWorldSim.test.ts`.
**Source:** 01-RESEARCH.md, 01-PATTERNS.md, 01-01-SUMMARY.md

### Additive currency column mirrored at four sites in one wave
Adding a `player` currency column requires touching four sites together or the module fails to `insert`: (1) table def `t.u32().default(0)`, (2) `seedPlayer` insert (`: 0`), (3) `RestorePlayerRow` object mirror, (4) `snapshot.mjs` keep-list (snake_case `transcend_shards`).

**When to use:** Any new durable `player` field. Note the camelCase (TS module) vs snake_case (HTTP/SQL/snapshot) split, and that the table column specifically needs `.default(0)` for a live additive migrate.
**Source:** 01-PATTERNS.md, 01-RESEARCH.md, 01-02-SUMMARY.md

### Read-through render from the subscribed player row
The client never computes or mutates the balance; it reads `myPlayer?.transcendShards ?? 0` from `useTable(tables.player)` and threads it as a `number` prop into screens. The `?? 0` guard also covers the pre-binding-regen/undefined window.

**When to use:** Displaying any server-authoritative value; keeps the value server-owned and avoids client-side authority over economy state.
**Source:** 01-PATTERNS.md, 01-04-SUMMARY.md

### Shared chip class over per-screen copies for identical UI elements
When the same visual element must appear in two screens identically, extract one CSS class (`.wallet-chip`) both consume, scoping only the positional differences (e.g. the 12px inter-chip gap scoped to `.gacha__wallet .wallet-chip`, `flex-shrink: 0` for the topbar pin).

**When to use:** Duplicated UI atoms where visual parity is a hard requirement; prevents drift between instances.
**Source:** 01-04-SUMMARY.md, 01-UI-SPEC.md

---

## Surprises

### First publish aborted on the missing column default
Despite passing typecheck and all 318 tests in plan 02, the very first deploy attempt in plan 03 failed hard because SpacetimeDB demands a `.default()` annotation to add a column to a populated table.

**Impact:** Required a one-line `.default(0)` deviation fix mid-deploy (commit 9c8c363); reinforced that green tests + typecheck do not catch migrate-time schema constraints — the DB must actually be published against populated data.
**Source:** 01-03-SUMMARY.md

### The gold shard chip was indistinguishable from gold gems
The UI-SPEC originally locked the shard chip to `--gold` `#f2c14e`, identical to the gems chip. After build, this made the two currencies visually ambiguous, forcing a post-build recolor to `--shard` amethyst `#9333ea`.

**Impact:** A locked design-contract color decision was reversed after seeing it rendered; the "match the exemplar exactly" rule broke down when the exemplar's color conflicted with the need to distinguish two adjacent currencies.
**Source:** 01-UI-SPEC.md (POST-BUILD REVISION)

### Deferred Phase 2 feedback was implemented in Phase 1
The per-pull "+1 shard" mint animation was explicitly deferred to Phase 2 in RESEARCH open-question 1, UI-SPEC, and the plan 04 summary — then implemented in this phase anyway once shards got their distinct color.

**Impact:** Scope crept forward from a later phase; the deferral appears in multiple frozen artifacts while the code shipped the feature, leaving the written contracts stale relative to what actually landed.
**Source:** 01-UI-SPEC.md, 01-RESEARCH.md, 01-04-SUMMARY.md

---
