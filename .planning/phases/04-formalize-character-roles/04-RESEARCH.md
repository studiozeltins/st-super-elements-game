# Phase 4: Formalize character roles - Research

**Researched:** 2026-07-07
**Domain:** Static character-metadata modelling (client catalog + server const mirror) + read-only HUD badge
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

No `04-CONTEXT.md` exists for this phase. Constraints below are lifted from the binding
upstream artifacts that DO exist: the requirement (`REQ-combat-roles`), `STATE.md` decisions,
`04-UI-SPEC.md` (approved), and `CLAUDE.md`. Treat these as locked.

### Locked Decisions
- **Role enum is fixed:** `role: 'tank' | 'dps' | 'healer' | 'support'` — exactly four values,
  exactly one per character. [CITED: REQUIREMENTS.md REQ-combat-roles]
- **Seed mapping is prescribed** (not Claude's discretion): healers (Marina, Nereida, Lapa,
  Rasa) = `healer`; high-HP non-healers (Glacia, Terron, Ignis, Petra) = `tank`; anemo utility
  (Aeris, Zefs) = `support`; everyone else = `dps`. [CITED: REQUIREMENTS.md REQ-combat-roles]
- **Role is stored server-side** by mirroring into `CHARACTER_STATS` in
  `spacetimedb/src/index.ts`, so Phase 6 (raid) can enforce it. [CITED: REQUIREMENTS.md]
- **`serverSync.test.ts` must cover the new field.** [CITED: REQUIREMENTS.md; STATE.md INV-5]
- **UI is exactly one new element** — a read-only role badge — reusing the existing bespoke
  HUD tag design verbatim; no new design language. [CITED: 04-UI-SPEC.md]
- **Badge surfaces:** `.cchar__id` block in `CharacterScreen.tsx` and `.sheet__meta` row in
  `CharacterSheet.tsx`. [CITED: 04-UI-SPEC.md]
- **Four new `--role-*` CSS tokens** added to `:root` in `src/index.css`; badge is a text pill
  (`color: var(--role-*)`, `border: 1px solid currentColor`, no fill). [CITED: 04-UI-SPEC.md]
- **Latvian uppercase labels:** tank=`SARGS`, dps=`UZBRUCĒJS`, healer=`DZIEDNIEKS`,
  support=`ATBALSTS`; each `aria-label="Loma: {Label}"`. [CITED: 04-UI-SPEC.md]
- **Defensive fallback:** invalid/missing role → render NO badge silently (never a placeholder
  or error string). [CITED: 04-UI-SPEC.md]
- **`pnpm test` + `pnpm build` green.** [CITED: REQUIREMENTS.md acceptance]
- **Branch/tooling:** all work on `feat/transcendence`; pnpm only; server module path is
  `./spacetimedb` (ignore the wrong-path `spacetime:publish` npm scripts). [CITED: STATE.md;
  CLAUDE.md]

### Claude's Discretion
- Exact TypeScript shape of the `Role` type export and where the `ROLE_META` map lives (the
  UI-SPEC only mandates it exists as `Record<Role, {label; token}>` shared by both surfaces).
- Whether `role` is a required field on `CharacterDefinition` (recommended — see below) vs.
  optional-with-default.
- Exact new `serverSync.test.ts` assertion structure (must cover the field; form is open).
- DOM ordering of the badge within `.sheet__meta` relative to the `C{n}` level chip (see the
  `margin-left:auto` note in Common Pitfalls).

### Deferred Ideas (OUT OF SCOPE)
- **Any raid enforcement of roles** — that is Phase 6/7. This phase only *tags and displays*.
- **Per-skin `--role-*` remapping** (frost/synth/verdant/abyss/celestia) — UI-SPEC explicitly
  says skins are not required to remap the tokens this phase.
- **Making the badge interactive** (hover/press/filter) — it is a passive `<span>`.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-combat-roles | Add `role` to every character in `characters.ts`, mirror in server `CHARACTER_STATS`, seed per the prescribed mapping, cover in `serverSync.test.ts`, show a role badge on `CharacterSheet.tsx` / `CharacterScreen.tsx`, store server-side for Phase 6. | Standard Stack (files + exact locations), Architecture Patterns (mirror + badge), Runtime State Inventory (no migration needed — const, not table), Role mapping table (all 17 chars resolved), Code Examples (test extension, badge markup, CSS tokens). |
</phase_requirements>

## Summary

This is a **pure internal data + presentation phase** with zero external dependencies. It adds one
static, intrinsic attribute (`role`) to the 17-character roster in two places that are already kept
in lockstep by `serverSync.test.ts`, and surfaces it as a read-only text badge that clones an
existing HUD tag component. There is no new library, no new table, no new reducer, and — critically
— **no schema migration**.

The single most important architectural fact the planner must internalize: **`CHARACTER_STATS` is a
plain `const` object literal in the module source (`spacetimedb/src/index.ts` line 41), NOT a
SpacetimeDB table.** [VERIFIED: grep of spacetimedb/src/index.ts] The `additional_context` framing
this as "an additive schema change… new column, seed via reducer or init" is **incorrect for this
codebase** — there is no `character_stats` table, no column to add, and nothing to seed at runtime.
"Store role server-side" is satisfied by adding `role: 'tank'` to each entry of that const. That
also means **client bindings do NOT need regeneration** (`spacetime:generate` emits types for
tables/reducers; `CHARACTER_STATS` is neither). The client `role` value lives in the hand-authored
`src/game/data/characters.ts`, consumed directly by React — it never travels through a binding.

Deploy is therefore the lightest possible: a plain additive `spacetime publish` of the module
(no `--delete-data`, no `seed_world`, no data risk), needed only so the running module *carries* the
role for Phase 6 to read later. The `serverSync.test.ts` gate does not even require a publish — it
reads the server *source file* as text, not the live DB.

**Primary recommendation:** Add a `Role` type + required `role` field to `CharacterDefinition` and
to each server `CHARACTER_STATS` entry (single-line literals so the existing regex extractor keeps
working); extend `serverSync.test.ts` with (a) a "every character has a valid role" test and (b) a
per-character client↔server role-equality test using the existing `extractServerStats`/`readField`
plumbing; add a shared `ROLE_META` map + four `--role-*` tokens; render `.cchar__role-tag` /
`.sheet__role` cloning `.cchar__active-tag`. Then `pnpm test`, `pnpm build`, and an additive publish
to local.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Role source-of-truth (per-character intrinsic data) | Client catalog (`characters.ts`) + Server const (`CHARACTER_STATS`) | — | Role is static design data, identical on both sides; the two copies are the "mirror" INV-5 enforces. Not player state → not a table. |
| Role storage "server-side" | Server module const | — | Satisfied by the const literal; Phase 6 raid logic reads `statsFor(id).role`. No table/column. |
| Client↔server parity guarantee | Test (`serverSync.test.ts`) | — | Reads server source text + client catalog, asserts equality. Existing pattern. |
| Role badge display | Browser / React (`CharacterScreen.tsx`, `CharacterSheet.tsx`) | CSS tokens (`src/index.css`) | Read-only presentation; consumes client catalog directly, no server round-trip. |
| Role → label/color derivation | Browser (shared `ROLE_META` map) | — | UI-SPEC mandates a single map, not per-character hard-coding. |

## Standard Stack

No new packages. All tooling already present and in active use.

### Core
| Library / Tool | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| TypeScript | ~5.6.2 | Type the `Role` union + field | Already the project language. [VERIFIED: package.json] |
| React | ^18.3.1 | Render the badge span | Existing UI framework. [VERIFIED: package.json] |
| Vitest | 3.2.4 | `serverSync.test.ts` coverage | Existing test runner; `pnpm test` = `vitest run`. [VERIFIED: package.json] |
| SpacetimeDB SDK | 2.6.* | Module host | Role is a const in the module; no SDK API change. [VERIFIED: package.json] |
| spacetime CLI | (installed) | Additive publish of module | Deploy so Phase 6 can read role at runtime. [CITED: CLAUDE.md] |

### Supporting
| Item | Purpose | When to Use |
|------|---------|-------------|
| `src/index.css` `:root` | Hold four `--role-*` tokens | Once, for the badge colors. [CITED: 04-UI-SPEC.md] |
| Plain CSS class (`.cchar__role-tag`, `.sheet__role`) | Badge box model clone | Reuse `.cchar__active-tag` declaration verbatim. [VERIFIED: src/index.css:3030] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `role` on `CHARACTER_STATS` const | A real `character_role` DB table seeded via `init` | Rejected — role is static design data, not player state; a table adds a migration, a seed reducer, binding regen, and a runtime read for zero benefit. The requirement + existing `CHARACTER_STATS` pattern (stars/maxHealth/heal are all consts) point the other way. |
| Required `role` field | Optional `role?` with `dps` default | Rejected — a required field makes "every character has a role" a compile-time guarantee and forces the seeding to be exhaustive; the defensive "render no badge" fallback still covers runtime junk. |

**Installation:** none.

**Version verification:** N/A — no packages added or changed. (Toolchain versions confirmed from
`package.json`. [VERIFIED: package.json])

## Package Legitimacy Audit

Not applicable — this phase installs **no external packages**. No registry lookups required.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                         ┌─────────────────────────────────────┐
                         │  DESIGN DATA (static, authored)      │
                         │                                      │
  characters.ts ─────────┤  role: Role  (client catalog)        │
  (client, hand-authored)│         ║  mirror (INV-5)            │
                         │         ║                            │
  spacetimedb/index.ts ──┤  CHARACTER_STATS[id].role (server)   │
  (server const, NOT a   │                                      │
   table)                └───────┬──────────────────┬───────────┘
                                 │                  │
              serverSync.test.ts │                  │ statsFor(id).role
              reads BOTH as text │                  │ (Phase 6 raid — out of scope now)
              asserts equality   │                  ▼
                                 ▼            (future runtime read)
                        ┌────────────────┐
                        │  pnpm test gate │
                        └────────────────┘

  RENDER PATH (browser only, no server round-trip):
  characters.ts role ──► ROLE_META[role] {label, token} ──► <span .cchar__role-tag> / <span .sheet__role>
                                                             color: var(--role-*)  (from :root)
```

The role never crosses the wire for display — the client already has the full catalog. The server
copy exists solely as the enforcement source for Phase 6 and as the thing `serverSync.test.ts`
compares against.

### Recommended Project Structure (files touched — all exist)
```
src/game/data/characters.ts          # add `Role` type + `role` field to interface + each entry
src/game/data/__tests__/serverSync.test.ts  # extend extractServerStats + 2 new test blocks
src/ui/CharacterScreen.tsx           # badge in .cchar__id tag stack + ROLE_META (or import)
src/ui/CharacterSheet.tsx            # badge in .sheet__meta row
src/index.css                        # 4 :root tokens + .cchar__role-tag / .sheet__role rules
spacetimedb/src/index.ts             # add role to each CHARACTER_STATS entry (+ CharacterStat type)
```
Optional: a tiny `src/game/data/roles.ts` (or a block in `characters.ts`) exporting `Role`,
`ROLE_META`, and the label/token maps so both UI surfaces import one source (satisfies UI-SPEC's
"derived once, do not hard-code per-character").

### Pattern 1: Static-const mirror (the load-bearing pattern)
**What:** Per-character design attributes live twice — client `characters.ts` and server
`CHARACTER_STATS` — and a source-text-reading test guarantees they match.
**When to use:** This exact phase. Follow it verbatim; `stars`, `maxHealth`, `healthRegen`, and the
heal fields already do.
**Example:** see Code Examples below.

### Pattern 2: Single-line server literals for the regex extractor
**What:** Each `CHARACTER_STATS` entry MUST stay a single-line object literal with no nested
braces. `extractServerStats()` splits the block with `/(\w+):\s*\{([^}]*)\}/g` and pulls fields with
`readField` (`/name:\s*'?([\w.]+)'?/`). `'tank'` etc. are pure `\w`, so they parse cleanly.
[VERIFIED: serverSync.test.ts:44-63]
**When to use:** When adding the `role: 'tank'` fragment to each entry — keep it on the one line.

### Anti-Patterns to Avoid
- **Creating a `character_role` table / reducer / init-seed.** Wrong tier; adds a migration and
  binding churn for static data. `CHARACTER_STATS` already models exactly this kind of data.
- **Running `spacetime:generate` expecting a role binding.** Role isn't a table field; bindings
  won't change. (The correct regen script is `pnpm generate` / `spacetime:generate`, but it is a
  no-op here.)
- **Hard-coding label/color per character in the JSX.** UI-SPEC forbids it; derive from `ROLE_META`.
- **Using `--danger` / `--accent` / `--gold` / `--shard` for a role.** Those hues are reserved;
  the four `--role-*` tokens are mandatory. [CITED: 04-UI-SPEC.md]
- **Multi-line-ing a `CHARACTER_STATS` entry** (e.g. to fit role) — breaks the `[^}]*` single-line
  assumption in the test extractor.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Badge box styling | New pill CSS from scratch | Clone `.cchar__active-tag` declaration verbatim (`padding:5px 10px; font:700 10px var(--font-display); letter-spacing:0.12em; border:1px solid currentColor`) | Pixel-parity with the sibling tags is a UI-SPEC requirement. [VERIFIED: src/index.css:3030] |
| Client↔server parity check | A bespoke script | Extend `serverSync.test.ts`'s existing `extractServerStats`/`readField` | The plumbing to read `role` already exists; `readField(body,'role')` works today. [VERIFIED: serverSync.test.ts] |
| Role→label lookup | Inline ternaries in JSX | One `ROLE_META: Record<Role,{label;token}>` map | Single source, both surfaces, color-blind-safe text label. [CITED: 04-UI-SPEC.md] |

**Key insight:** Every moving part this phase needs already has a shipped precedent in the repo
(the tag component, the sync test, the const mirror). The work is almost entirely *replication of an
established pattern*, which is why confidence is HIGH and risk is LOW.

## Runtime State Inventory

This is a rename/refactor-adjacent phase (adding a field to existing static data), so the inventory
applies. The headline: **nothing needs a data migration.**

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | **None** — `role` is added to a module `const` (`CHARACTER_STATS`), not to any SpacetimeDB table. No `player`, `owned_character`, or other row stores a role. [VERIFIED: grep — no `character_stats`/role table] | None. No records to backfill. |
| Live service config | **None** — no external service (n8n/Datadog/etc.) references character roles. | None. |
| OS-registered state | **None** — no scheduled task / process embeds a role. | None. |
| Secrets/env vars | **None** — no secret or env var references roles. | None. |
| Build artifacts | Client `dist/` is rebuilt by `pnpm build`; the running module must be republished so it carries `role` for Phase 6. **No stale artifact carries an old role** (the field is new). | Additive `spacetime publish` to local (and maincloud per procedure — see Environment Availability note; maincloud is a paused DB, deploy deferred consistent with Phase 02). Regenerating bindings is a no-op (role is not a table field). |

**The canonical question — after every file is updated, what runtime state still holds an old
value?** Answer: **none.** `role` is a brand-new field on static design data; there is no prior value
anywhere to become stale. The only runtime step is republishing the module so the in-DB module code
includes `role` (a pure code swap, hot-swappable, no client disconnect, no data touched).

## Common Pitfalls

### Pitfall 1: Treating `CHARACTER_STATS` as a table (schema-change fallacy)
**What goes wrong:** Planner adds a `character_role` table, a seed reducer, a migration note, and a
binding-regen step — none of which are needed and all of which add risk.
**Why it happens:** The `additional_context` explicitly (and wrongly, for this repo) describes it as
"an additive schema change… new column, seed via reducer or init."
**How to avoid:** Confirm with grep — `CHARACTER_STATS` is `const CHARACTER_STATS: Record<string,
CharacterStat> = { … }` at `spacetimedb/src/index.ts:41`, a plain literal. Add `role` to the
`CharacterStat` interface (line 32) and to each entry. That's the whole server change.
**Warning signs:** Any task mentioning `t.string()`, `--delete-data`, `seed_world`, `init`, or
`spacetime generate` producing a role type.

### Pitfall 2: Breaking the serverSync regex by multi-lining an entry
**What goes wrong:** `extractServerStats` silently drops or mis-parses an entry; sync test gives a
confusing failure.
**Why it happens:** The extractor assumes single-line, non-nested `{…}` bodies (`[^}]*`).
**How to avoid:** Keep every `CHARACTER_STATS` entry on one line; append `role: 'tank'` inline.
**Warning signs:** A character missing from `serverStats` keys, or `readField` returning `null`.

### Pitfall 3: `.sheet__meta` badge ordering vs. `margin-left:auto`
**What goes wrong:** The `C{n}` level chip (`.sheet__level`) has `margin-left:auto` (pushes it to
the far right of the meta row). If the role badge is appended *after* `.sheet__level` in the DOM, it
lands to the right of the level chip, looking detached.
**Why it happens:** `.sheet__level { margin-left: auto }`. [VERIFIED: src/index.css:2333]
**How to avoid:** Insert `.sheet__role` **before** `.sheet__level` in the JSX (stars → weapon →
role → [auto gap] → level), or give the role its own placement. UI-SPEC says "fourth inline item,
8px gap" — put it before the auto-margined level chip so the 8px gap reads correctly.
**Warning signs:** Role badge visually flush-right, separated from stars/weapon.

### Pitfall 4: Character count / mapping drift
**What goes wrong:** A character gets no role (fails "every character has a valid role") or the
mapping disagrees between client and server (fails the equality test).
**Why it happens:** 17 characters, four buckets, easy to miss one.
**How to avoid:** Use the exact table below; there are 17 ids, and 4+4+2+7=17.
**Warning signs:** `serverSync` "same ids" or role-equality test red; a `dps` fallback firing.

## Role Assignment (all 17 characters — grounded in kit/HP/resistances)

Derived strictly from the requirement's rule + each character's shipped stats. [VERIFIED: characters.ts
+ CHARACTER_STATS]

| Character | Element | maxHealth | Heals party? | Rule matched | **Role** |
|-----------|---------|-----------|--------------|--------------|----------|
| marina | hydro | 1150 | yes (active) | named healer | `healer` |
| nereida | hydro | 1120 | yes (active) | named healer | `healer` |
| lapa | dendro | 950 | yes (active, combo) | named healer | `healer` |
| rasa | hydro | 1000 | yes (passive) | named healer | `healer` |
| glacia | cryo | 1550 | no | high-HP non-healer | `tank` |
| terron | geo | 1400 | no | high-HP non-healer | `tank` |
| ignis | pyro | 1300 | no | high-HP non-healer | `tank` |
| petra | geo | 1200 | no | high-HP non-healer | `tank` |
| aeris | anemo | 950 | no | anemo utility | `support` |
| zefs | anemo | 900 | no | anemo utility | `support` |
| volta | electro | 1000 | no | rest | `dps` |
| silva | dendro | 1050 | no (self-regen 8 only) | rest | `dps` |
| sarma | cryo | 1000 | no | rest | `dps` |
| vesper | electro | 1080 | no | rest | `dps` |
| zibo | electro | 1000 | no | rest (starter) | `dps` |
| dzirkste | pyro | 1000 | no | rest | `dps` |
| stindzis | cryo | 950 | no | rest | `dps` |

Buckets: **healer** ×4 (marina, nereida, lapa, rasa) · **tank** ×4 (glacia, terron, ignis, petra) ·
**support** ×2 (aeris, zefs) · **dps** ×7 (volta, silva, sarma, vesper, zibo, dzirkste, stindzis).

Note: Silva has `healthRegen: 8` but is a *self*-regen only (not in the client `HEALERS` map /
server `healType:'none'`), so per the rule she is `dps`, not `healer`. [VERIFIED: characters.ts
HEALERS map excludes silva]

## Code Examples

### Client — type + field (`src/game/data/characters.ts`)
```typescript
// Source: pattern established by existing fields in this file
export type Role = 'tank' | 'dps' | 'healer' | 'support';

export interface CharacterDefinition {
  // …existing fields…
  role: Role;               // NEW — intrinsic combat role (mirrored in server CHARACTER_STATS)
  skill: SkillDefinition;
}

// each entry gains a role, e.g.:
//   glacia: { …, role: 'tank', skill: … }
//   marina: { …, role: 'healer', skill: … }
```

### Shared meta map (co-located, e.g. in `characters.ts` or a small `roles.ts`)
```typescript
// Source: 04-UI-SPEC.md Copywriting Contract (labels) + Color table (tokens)
export const ROLE_META: Record<Role, { label: string; token: string }> = {
  tank:    { label: 'SARGS',      token: '--role-tank' },
  dps:     { label: 'UZBRUCĒJS',  token: '--role-dps' },
  healer:  { label: 'DZIEDNIEKS', token: '--role-healer' },
  support: { label: 'ATBALSTS',   token: '--role-support' },
};
```

### Server — const mirror (`spacetimedb/src/index.ts`, keep single-line)
```typescript
// Source: existing CHARACTER_STATS pattern (line 32/41)
interface CharacterStat {
  stars: 4 | 5;
  maxHealth: number;
  healthRegen: number;
  role: 'tank' | 'dps' | 'healer' | 'support';   // NEW
  healType: HealType; healMode: HealMode; healPower: number;
}
// entries (single line each):
//   glacia:  { stars: 5, maxHealth: 1550, healthRegen: 0, role: 'tank',   ...NO_HEAL },
//   marina:  { stars: 5, maxHealth: 1150, healthRegen: 12, role: 'healer', healType: 'active', healMode: 'percent', healPower: 0.2 },
```
The `statsFor` fallback (line 150) should also gain a role, e.g. `role: 'dps'`, so an unknown id
still type-checks. Phase 6 reads `statsFor(id).role`.

### Test extension (`serverSync.test.ts`)
```typescript
// Source: existing extractServerStats/readField in this file
// 1) widen the ServerStat interface + populate role in extractServerStats():
//    role: readField(body, 'role') ?? 'dps',
// (readField already accepts \w values, so 'tank' etc. parse.)

const VALID_ROLES = ['tank', 'dps', 'healer', 'support'] as const;

it.each(Object.values(CHARACTERS).map(c => [c.id] as const))(
  '%s has a valid role', id => {
    expect(VALID_ROLES).toContain(CHARACTERS[id].role);
  }
);

it.each(Object.values(CHARACTERS).map(c => [c.id] as const))(
  '%s role matches server CHARACTER_STATS', id => {
    expect(serverStats[id].role).toBe(CHARACTERS[id].role);
  }
);
```

### Badge markup — CharacterScreen `.cchar__id` (order: active → role → transcend)
```tsx
// Source: 04-UI-SPEC.md Component Contract; clones .cchar__active-tag
{isActive && <span className="cchar__active-tag">AKTĪVS VARONIS</span>}
{ROLE_META[character.role] && (
  <span
    className="cchar__role-tag"
    style={{ color: `var(${ROLE_META[character.role].token})` } as CSSProperties}
    aria-label={`Loma: ${labelTitleCase(ROLE_META[character.role].label)}`}
  >
    {ROLE_META[character.role].label}
  </span>
)}
{transcendLevel > 0 && <span className="cchar__transcend-tag">C6 · B{transcendLevel}</span>}
```
(`aria-label` per UI-SPEC is Title-case Latvian, e.g. `Loma: Sargs`; the visible label is
uppercase. A tiny helper or a second `aria` field in `ROLE_META` can supply the Title-case form —
planner's discretion.)

### Badge markup — CharacterSheet `.sheet__meta` (before `.sheet__level`)
```tsx
<span className="sheet__weapon">{WEAPONS[character.weapon].displayName}</span>
{ROLE_META[character.role] && (
  <span className="sheet__role"
        style={{ color: `var(${ROLE_META[character.role].token})` } as React.CSSProperties}
        aria-label={`Loma: …`}>
    {ROLE_META[character.role].label}
  </span>
)}
<span className="sheet__level">C{constellation} / C{MAX_CONSTELLATION}</span>
```

### CSS (`src/index.css`)
```css
/* :root additions (04-UI-SPEC Color table) */
--role-tank: #4a8fd8;
--role-dps: #f0476b;
--role-healer: #2fd8a6;
--role-support: #7c8cf8;

/* clone of .cchar__active-tag (line 3030) */
.cchar__role-tag {
  align-self: flex-start;
  margin-top: 10px;
  padding: 5px 10px;
  font: 700 10px var(--font-display);
  letter-spacing: 0.12em;
  border: 1px solid currentColor;   /* color set inline per role */
}
.sheet__role {
  padding: 5px 10px;
  font: 700 10px var(--font-display);
  letter-spacing: 0.12em;
  border: 1px solid currentColor;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| (n/a — new field) | Static const mirror pattern already used for stars/HP/heal | established | Reuse verbatim; no new technique introduced. |

**Deprecated/outdated:** none relevant.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Client bindings need NO regeneration because role is not a table field | Summary / Runtime State | LOW — if a future reader expects a binding, they find none; harmless. Verified conceptually (const, not table) but not executed. |
| A2 | Publishing is only needed for Phase 6 runtime read, not for the `pnpm test` gate | Runtime State | LOW — test reads source text (verified in serverSync.test.ts:28), so this holds; publish still recommended for module consistency. |
| A3 | Maincloud deploy is deferred (paused DB, no recovery-wipe), consistent with Phase 02 | Environment Availability | LOW — matches STATE.md Phase 02 decision; planner should confirm deploy targets. |
| A4 | `readField`'s `[\w.]+` cleanly parses `'tank'`/`'dps'`/`'healer'`/`'support'` | Test extension | LOW — all four are pure `\w`; verified against the regex. |

All other claims are `[VERIFIED]` against the codebase or `[CITED]` from REQUIREMENTS.md /
04-UI-SPEC.md / CLAUDE.md.

## Open Questions

1. **`aria-label` Title-case source**
   - What we know: UI-SPEC wants uppercase visible label (`SARGS`) + Title-case aria (`Loma: Sargs`).
   - What's unclear: whether to store both forms in `ROLE_META` or derive Title-case at render.
   - Recommendation: add an `aria` field to `ROLE_META` (e.g. `aria: 'Sargs'`) — one map, no
     runtime string munging. Planner's discretion.

2. **Deploy targets for the additive publish**
   - What we know: local publish is safe and expected; maincloud is a paused DB (Phase 02).
   - What's unclear: whether this phase publishes to maincloud now or defers to Phase 7's full
     migrate pass.
   - Recommendation: publish local this phase; defer maincloud to the Phase 7 deploy per the
     established pattern. Confirm during planning.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| pnpm | test/build | ✓ (project uses it) | — | none needed |
| vitest | `pnpm test` | ✓ | 3.2.4 | — |
| TypeScript/vite | `pnpm build` | ✓ | 5.6.2 / 7.1.5 | — |
| spacetime CLI | additive module publish (local) | ✓ (used across prior phases) | — | test gate passes without publish (reads source), but publish recommended for Phase 6 |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** maincloud publish is optional this phase (paused DB) — local
publish is the required target; maincloud deferred per Phase 02 precedent.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.4 |
| Config file | vite/vitest config in repo (jsdom env present) |
| Quick run command | `pnpm test` (= `vitest run`) |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-combat-roles | Every character has a valid role (one of 4) | unit | `pnpm test` (new `%s has a valid role` block) | ✅ serverSync.test.ts (extend) |
| REQ-combat-roles | Client role == server `CHARACTER_STATS` role per id | unit | `pnpm test` (new `%s role matches server` block) | ✅ serverSync.test.ts (extend) |
| REQ-combat-roles | Client↔server ids still identical after edit | unit | `pnpm test` (existing "same ids" test) | ✅ existing |
| REQ-combat-roles | Type-safety of `Role` union / no invalid literal | compile | `pnpm build` (`tsc -b`) | ✅ build |
| REQ-combat-roles | Badge renders / no runtime break | build | `pnpm build` | ✅ build |

### Sampling Rate
- **Per task commit:** `pnpm test`
- **Per wave merge:** `pnpm test` + `pnpm build`
- **Phase gate:** `pnpm test` + `pnpm build` green before `/gsd-verify-work`

### Wave 0 Gaps
None — `serverSync.test.ts` already exists with the exact extraction plumbing (`extractServerStats`,
`readField`, `it.each` over `CHARACTERS`) needed; this phase *extends* it, no new test file or
framework install required. Badge is visual (verify via UAT / `pnpm build`); no new automated UI
harness needed for a read-only static span.

## Security Domain

`security_enforcement: true`, ASVS level 1. This phase adds static, non-user-controlled design data
and a read-only display element. There is **no new input, no new reducer, no auth surface, no data
mutation, no user-supplied value.** Role values are compile-time literals from a fixed union.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | unchanged — no auth touched |
| V3 Session Management | no | unchanged |
| V4 Access Control | no | Phase 6 (raid enforcement) is where role gates behavior; not this phase |
| V5 Input Validation | minimal | Role is a fixed TS union; the defensive "render no badge on invalid role" (UI-SPEC) is the only guard, and it is display-only |
| V6 Cryptography | no | none |

### Known Threat Patterns for {static data + read-only badge}
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client tampering with displayed role | Tampering | Irrelevant this phase (display only); Phase 6 must read the **server** `CHARACTER_STATS` role, never a client-supplied role, for any enforcement (INV: `ctx.sender`/server-authoritative) |
| Injection via role string | Injection | None — roles are fixed literals, never user input, never interpolated into SQL/HTML unsafely (React escapes text) |

**Security note for the planner:** the only forward-looking security requirement is a *Phase 6*
one — raid role enforcement MUST derive role from the server `CHARACTER_STATS`, not trust any
client-sent role. Recording it here so it is not lost; no action this phase.

## Sources

### Primary (HIGH confidence)
- `spacetimedb/src/index.ts` (lines 30-63, 149-172) — `CHARACTER_STATS` const, `CharacterStat`
  interface, `statsFor` fallback. [VERIFIED]
- `src/game/data/characters.ts` — `CharacterDefinition`, roster, `HEALERS` map. [VERIFIED]
- `src/game/data/__tests__/serverSync.test.ts` — extractor + sync assertions. [VERIFIED]
- `src/ui/CharacterScreen.tsx` (`.cchar__id`, tag stack) / `src/ui/CharacterSheet.tsx`
  (`.sheet__meta`). [VERIFIED]
- `src/index.css` (lines 2333, 3030-3050) — `.sheet__level`, `.cchar__active-tag`,
  `.cchar__transcend-tag`. [VERIFIED]
- `.planning/phases/04-formalize-character-roles/04-UI-SPEC.md` (approved). [CITED]
- `.planning/REQUIREMENTS.md` REQ-combat-roles. [CITED]
- `CLAUDE.md` deploy/publish notes. [CITED]
- `package.json` (scripts, deps). [VERIFIED]

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` decisions (INV-5 sync, Phase 02 maincloud-paused precedent). [CITED]

### Tertiary (LOW confidence)
- None — no external/web sources needed (all providers disabled; phase is fully internal).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all tools verified in package.json.
- Architecture: HIGH — pattern already shipped for sibling fields; verified by grep/read.
- Pitfalls: HIGH — each grounded in a verified source line (regex, `margin-left:auto`, const-not-table).
- Role mapping: HIGH — every one of 17 characters resolved against shipped stats.

**Research date:** 2026-07-07
**Valid until:** 2026-08-06 (stable — internal static data; only invalidated if the roster or the
serverSync extractor changes).
</content>
</invoke>
