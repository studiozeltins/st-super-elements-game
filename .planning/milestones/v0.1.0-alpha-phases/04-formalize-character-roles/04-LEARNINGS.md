---
phase: 4
phase_name: "Formalize character roles"
project: "super-elements"
generated: "2026-07-08"
counts:
  decisions: 6
  lessons: 5
  patterns: 4
  surprises: 2
missing_artifacts:
  - "CONTEXT.md (no 04-CONTEXT.md; constraints lifted from REQ/STATE/UI-SPEC per 04-RESEARCH.md)"
---

# Phase 4 Learnings: Formalize character roles

## Decisions
### Role stored as const design data, not a SpacetimeDB table
`role` was added to the `CHARACTER_STATS` const object literal in `spacetimedb/src/index.ts` (and mirrored in client `characters.ts`), with no table, migration, column, seed reducer, or binding regeneration.

**Rationale:** Role is static per-character design data identical on both sides, not player state. A table would add a migration, a seed reducer, binding regen, and a runtime read for zero benefit — `stars`/`maxHealth`/heal fields already model this exact kind of data as consts.
**Source:** 04-01-SUMMARY.md

---

### `role` is a required field on CharacterDefinition
Made `role: Role` a required (non-optional) field rather than `role?` with a `dps` default.

**Rationale:** A required field turns "every character has a role" into a compile-time guarantee — a missing role is a `pnpm build` error, forcing exhaustive seeding across all 17 entries.
**Source:** 04-01-SUMMARY.md

---

### Single ROLE_META map with an `aria` field carried alongside label + token
Exported one `ROLE_META: Record<Role, {label; token; aria}>` from `characters.ts` as the sole source of role display metadata; added the Title-case `aria` string into the map instead of deriving it at render.

**Rationale:** Both UI surfaces import one source (no per-character hard-coding), and storing the Title-case accessible name avoids runtime string munging between the uppercase visible label and `aria-label="Loma: {Title-case}"`.
**Source:** 04-01-SUMMARY.md, 04-PATTERNS.md

---

### `statsFor` fallback carries `role: 'dps'`
The `statsFor` fallback object for unknown character ids includes `role: 'dps' as const`.

**Rationale:** Phase 6 raid logic reads `statsFor(id).role`; an unknown id must still type-check and return a valid role rather than `undefined`.
**Source:** 04-01-SUMMARY.md

---

### Additive local publish only; maincloud deferred to Phase 7
Published the module additively to the local server (no `--delete-data`); explicitly deferred the maincloud publish to the Phase 7 deploy pass.

**Rationale:** `role` is a brand-new field on static const data (no rows to backfill, hot-swappable, no data risk). Maincloud is a paused DB, so deferring matches the Phase 02 paused-DB precedent.
**Source:** 04-01-SUMMARY.md

---

### Four dedicated `--role-*` tokens instead of repurposing reserved hues
Added `--role-tank/dps/healer/support` to `:root` rather than reusing `--accent`/`--gold`/`--shard`/`--danger`.

**Rationale:** The four reserved hues are spoken-for (active identity, gems, transcend, destructive). The role badges need their own distinct hue channel so tank/dps/healer/support read as four separate facts and don't collide semantically with existing markers.
**Source:** 04-UI-SPEC.md, 04-02-SUMMARY.md

---

## Lessons
### Verify architectural framing against the codebase, not the task brief
The `additional_context` described role as "an additive schema change… new column, seed via reducer or init" — wrong for this repo. A grep confirmed `CHARACTER_STATS` is a plain `const` literal, not a table, which collapsed the whole server change to appending one inline field per entry.

**Context:** RESEARCH caught this before planning; had the brief been trusted, the plan would have added a needless table, seed reducer, migration, and binding regen.
**Source:** 04-RESEARCH.md, 04-01-SUMMARY.md

---

### serverSync parity test reads server SOURCE TEXT, not the live DB
`serverSync.test.ts` `readFileSync`s `spacetimedb/src/index.ts` and regex-extracts fields, so `pnpm test` passes with no publish. The publish is only needed so the running module carries `role` for Phase 6 to read at runtime.

**Context:** Separates the test gate (source-level) from the deploy step (runtime), so the additive publish is a deploy detail, not a blocker for green tests.
**Source:** 04-RESEARCH.md

---

### Server CHARACTER_STATS entries must stay single-line
The extractor splits entries with a `[^}]*` regex that assumes one-line, non-nested `{…}` bodies. Multi-lining an entry (e.g. to fit `role`) silently drops or mis-parses it. `role: '...'` was appended inline before the `...NO_HEAL` spread.

**Context:** A character missing from `serverStats` keys or a `null` `readField` result is the warning sign of a broken entry.
**Source:** 04-RESEARCH.md, 04-PATTERNS.md

---

### `.sheet__level` has `margin-left:auto` — order matters in the meta row
The `C{n}` level chip is pushed flush-right by `margin-left:auto`. A badge appended after it lands stranded on the far right, detached from stars/weapon. The role badge was inserted BEFORE `.sheet__level` (stars → weapon → role → [auto gap] → level).

**Context:** A layout pitfall invisible at compile time; only caught by reading the existing CSS rule before placing the new element.
**Source:** 04-RESEARCH.md, 04-PATTERNS.md

---

### SpacetimeDB SQL requires a column alias on aggregates
A `SELECT COUNT(*)` verification query failed until aliased as `COUNT(*) AS n`.

**Context:** Encountered while confirming player/owned_character rows were intact after the additive publish — a CLI/SQL quirk, not a code issue.
**Source:** 04-01-SUMMARY.md

---

## Patterns
### Static-const mirror guarded by a source-text-reading test
Per-character intrinsic data lives twice (client `characters.ts` + server `CHARACTER_STATS`) and a Vitest test reads both as text and asserts per-id equality (INV-5). `role` became the 4th synced field alongside stars/maxHealth/healthRegen/heal.

**When to use:** Any static design attribute that both client and server must agree on without going over the wire. Extend the existing test with valid-value + client↔server equality `it.each` blocks; keep server entries single-line.
**Source:** 04-01-SUMMARY.md, 04-PATTERNS.md

---

### Defensive render-nothing fallback via truthiness guard
`{ROLE_META[character.role] && (…badge…)}` — an invalid/missing role renders no badge silently, never a placeholder or error string.

**When to use:** Read-only display of catalog-derived data where a bad value should degrade to absence, not a broken/empty element.
**Source:** 04-02-SUMMARY.md

---

### Derive-once badge from a single shared map
Both HUD surfaces import one `ROLE_META` for label/color/aria; no per-character hard-coding of labels or colors in JSX.

**When to use:** When the same small metadata (label + color token + accessible name) must render identically across multiple surfaces.
**Source:** 04-02-SUMMARY.md, 04-UI-SPEC.md

---

### Colored-outline text pill as a new sibling in an existing tag family
The badge clones the shipped `.cchar__active-tag` box model verbatim (padding `5px 10px`, `10px` stack offset, `border:1px solid currentColor`) with color set inline via `var(--role-*)` and the CSS `color` omitted so the border tracks the role hue. Color is never the only channel — a Latvian text label makes it color-blind-safe.

**When to use:** Adding a new indicator that must sit visually alongside existing HUD tags — reuse the sibling's exact box model for pixel parity rather than re-deriving from the spacing scale.
**Source:** 04-02-SUMMARY.md, 04-UI-SPEC.md

---

## Surprises
### User requested removal of the unrelated "AKTĪVS VARONIS" label during UAT
While confirming the role badge looked correct, the user separately asked to remove the active-character label (no backend meaning, wasted space). Removed in commit b543c41 — out of REQ-combat-roles scope, not a phase-4 gap.

**Impact:** A tangential UX cleanup surfaced by the manual UAT session; the role badge itself was unaffected and passed.
**Source:** 04-UAT.md

---

### Silva has healthRegen but is classified dps, not healer
Silva carries `healthRegen: 8` yet maps to `dps` because it is self-regen only — excluded from the client `HEALERS` map and server `healType:'none'`.

**Impact:** A HP-regen value did not imply the healer role; the mapping rule (named party healers only) had to be applied by kit, catching a would-be miscategorization across the 17-character seed.
**Source:** 04-RESEARCH.md
