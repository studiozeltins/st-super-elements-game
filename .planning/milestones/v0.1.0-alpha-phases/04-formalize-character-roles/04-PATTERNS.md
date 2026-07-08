# Phase 4: Formalize character roles - Pattern Map

**Mapped:** 2026-07-07
**Files analyzed:** 6 (all modified; 0 created — an optional 7th, `roles.ts`, is planner's discretion)
**Analogs found:** 6 / 6 (every touched file has a shipped in-file precedent — this phase is pure replication)

## File Classification

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------|------|-----------|----------------|---------------|
| `src/game/data/characters.ts` | model / catalog (client) | transform (static design data) | itself — existing `stars`/`maxHealth`/`healthRegen` fields on `CharacterDefinition` | exact (same file, sibling field) |
| `spacetimedb/src/index.ts` (`CHARACTER_STATS`) | model / const (server) | transform (static design data) | itself — existing `CHARACTER_STATS` entries + `CharacterStat` interface + `statsFor` fallback | exact (same file, sibling field) |
| `src/game/data/__tests__/serverSync.test.ts` | test | transform (source-text parse + equality) | itself — existing `extractServerStats` / `readField` / `it.each` heal-spec block | exact (same file, sibling assertion) |
| `src/ui/CharacterScreen.tsx` | component (React) | request-response (render static prop) | `.cchar__active-tag` / `.cchar__transcend-tag` spans in same `.cchar__id` block | exact (same DOM block, sibling tag) |
| `src/ui/CharacterSheet.tsx` | component (React) | request-response (render static prop) | `.sheet__weapon` / `.sheet__level` spans in same `.sheet__meta` row | exact (same DOM row, sibling chip) |
| `src/index.css` | config / stylesheet | n/a (declarative) | `.cchar__active-tag` rule (line 3030) + `:root` tokens (lines 22-25) | exact (clone rule + sibling token) |

Optional new file: `src/game/data/roles.ts` — utility (shared `Role` type + `ROLE_META` map). No dedicated analog; nearest is any small exported-const data module (e.g. `weapons.ts`, `elements.ts`). Planner may instead co-locate `Role`/`ROLE_META` inside `characters.ts`.

## Pattern Assignments

### `src/game/data/characters.ts` (model, static-const mirror — CLIENT half)

**Analog:** itself — the `CharacterDefinition` interface and each roster entry.

**Interface pattern to extend** (lines 24-40) — add `role: Role` beside `maxHealth`/`healthRegen`:
```typescript
export interface CharacterDefinition {
  id: string;
  displayName: string;
  title: string;
  stars: 4 | 5;
  element: ElementId;
  weapon: WeaponId;
  moveSpeed: number;
  /** Per-character health pool. */
  maxHealth: number;
  /** Passive health regenerated per second (0 = no regen). */
  healthRegen: number;
  hairColor: number;
  /** Incoming-damage resistances (multipliers). Absent = no resistances. */
  resistances?: ResistanceProfile;
  skill: SkillDefinition;
}
```
Add `export type Role = 'tank' | 'dps' | 'healer' | 'support';` near the other type exports at the top (siblings: `SkillKind` line 4, `DamageChannel` line 9). Then insert `role: Role;` into the interface (recommended: required, per RESEARCH primary recommendation).

**Roster entry pattern** (lines 65-77, `aeris`) — each of the 17 entries gains one `role:` line:
```typescript
  aeris: {
    id: 'aeris',
    displayName: 'Aeris',
    title: 'Vēja dejotāja',
    stars: 5,
    element: 'anemo',
    weapon: 'sword',
    moveSpeed: 7.5,
    maxHealth: 950,
    healthRegen: 0,
    hairColor: 0xd8f5e8,
    skill: skill('wind-spiral', 'Vēja spirāle', 'dash', 140, 6, { radius: 2.5 }),
  },
```
Client entries are multi-line (unlike the server const), so `role` placement is free — put it next to `healthRegen`. Sync note already present at line 63: `// Keep ids/stars/maxHealth/healthRegen in sync with CHARACTER_STATS in spacetimedb/src/index.ts.` — update this comment to include `role`.

**Shared meta map** (co-locate here, or in a new `roles.ts`) — from RESEARCH Code Examples + UI-SPEC labels/tokens:
```typescript
export const ROLE_META: Record<Role, { label: string; token: string; aria: string }> = {
  tank:    { label: 'SARGS',      token: '--role-tank',    aria: 'Sargs' },
  dps:     { label: 'UZBRUCĒJS',  token: '--role-dps',     aria: 'Uzbrucējs' },
  healer:  { label: 'DZIEDNIEKS', token: '--role-healer',  aria: 'Dziednieks' },
  support: { label: 'ATBALSTS',   token: '--role-support', aria: 'Atbalsts' },
};
```
(RESEARCH Open Question 1: add an `aria` field so the Title-case accessible name needs no runtime string munging — recommended over deriving at render.)

**Role assignment (all 17 — locked by REQ-combat-roles):**
healer ×4: marina, nereida, lapa, rasa · tank ×4: glacia, terron, ignis, petra · support ×2: aeris, zefs · dps ×7: volta, silva, sarma, vesper, zibo, dzirkste, stindzis.

---

### `spacetimedb/src/index.ts` — `CHARACTER_STATS` (model, static-const mirror — SERVER half)

**Analog:** itself — `CharacterStat` interface (line 32) + const entries (lines 41-63) + `statsFor` (line 149).

**Interface pattern to extend** (lines 32-39) — add `role` beside the heal fields:
```typescript
interface CharacterStat {
  stars: 4 | 5;
  maxHealth: number;
  healthRegen: number;
  healType: HealType;
  healMode: HealMode;
  healPower: number;
}
```
Add `role: 'tank' | 'dps' | 'healer' | 'support';` (inline union — server file has no `Role` import from the client).

**Const entry pattern** (lines 41-63) — CRITICAL: keep every entry a **single-line** literal (the serverSync regex `[^}]*` assumes no nested braces / one line per entry). Append `role: '...'` inline:
```typescript
const CHARACTER_STATS: Record<string, CharacterStat> = {
  aeris: { stars: 5, maxHealth: 950, healthRegen: 0, role: 'support', ...NO_HEAL },
  terron: { stars: 5, maxHealth: 1400, healthRegen: 0, role: 'tank', ...NO_HEAL },
  volta: { stars: 5, maxHealth: 1000, healthRegen: 0, role: 'dps', ...NO_HEAL },
  glacia: { stars: 5, maxHealth: 1550, healthRegen: 0, role: 'tank', ...NO_HEAL },
  marina: { stars: 5, maxHealth: 1150, healthRegen: 12, role: 'healer', healType: 'active', healMode: 'percent', healPower: 0.2 },
  // ...all 17 entries, one line each, role added inline
};
```
Place `role:` BEFORE the `...NO_HEAL` spread (or before the explicit heal fields) so it is not shadowed and stays on the same line.

**Fallback pattern** (line 149-151) — `statsFor` must also carry a `role` so unknown ids type-check:
```typescript
function statsFor(characterId: string) {
  return CHARACTER_STATS[characterId] ?? { stars: 4 as const, maxHealth: DEFAULT_MAX_HEALTH, healthRegen: 0, role: 'dps' as const, ...NO_HEAL };
}
```
(Phase 6 raid logic reads `statsFor(id).role` — out of scope now, but this is the accessor it will use.)

---

### `src/game/data/__tests__/serverSync.test.ts` (test, source-text parse + equality)

**Analog:** itself — `ServerStat` interface (line 30), `readField` (line 39), `extractServerStats` (line 44), and the heal-spec `it.each` block (lines 90-100).

**`readField` already parses role literals** (line 39-42) — `[\w.]+` matches `tank`/`dps`/`healer`/`support` cleanly; NO change to the regex needed:
```typescript
function readField(body: string, name: string): string | null {
  const match = new RegExp(`${name}:\\s*'?([\\w.]+)'?`).exec(body);
  return match ? match[1] : null;
}
```

**Extend `ServerStat` + `extractServerStats`** (lines 30-63) — add `role` to the interface and populate it:
```typescript
interface ServerStat {
  stars: number;
  maxHealth: number;
  healthRegen: number;
  role: string;              // NEW
  healType: string;
  healMode: string;
  healPower: number;
}
// inside extractServerStats() stats[id] = { ... }:
  role: readField(body, 'role') ?? 'dps',
```

**New assertions — clone the existing `it.each` heal-spec block** (lines 90-100 is the template):
```typescript
const VALID_ROLES = ['tank', 'dps', 'healer', 'support'] as const;

it.each(Object.values(CHARACTERS).map(character => [character.id] as const))(
  '%s has a valid role',
  id => {
    expect(VALID_ROLES).toContain(CHARACTERS[id].role);
  }
);

it.each(Object.values(CHARACTERS).map(character => [character.id] as const))(
  '%s role matches server CHARACTER_STATS',
  id => {
    expect(serverStats[id].role).toBe(CHARACTERS[id].role);
  }
);
```
The existing "contains exactly the same character ids" test (line 74) already guards count drift — no new id test needed.

---

### `src/ui/CharacterScreen.tsx` (component — badge in `.cchar__id`)

**Analog:** the `.cchar__active-tag` / `.cchar__transcend-tag` spans in the same block (lines 328-339).

**Existing tag stack to extend** (lines 328-339) — insert role-tag between active and transcend (UI-SPEC order: active → role → transcend):
```tsx
<div className="cchar__id">
  <CharacterIdentity character={character} className="cident--lg" />
  {isActive && <span className="cchar__active-tag">AKTĪVS VARONIS</span>}
  {ROLE_META[character.role] && (
    <span
      className="cchar__role-tag"
      style={{ color: `var(${ROLE_META[character.role].token})` }}
      aria-label={`Loma: ${ROLE_META[character.role].aria}`}
    >
      {ROLE_META[character.role].label}
    </span>
  )}
  {transcendLevel > 0 && (
    <span
      className="cchar__transcend-tag"
      aria-label={`Būsts līmenis B${transcendLevel}, sešas cieņas zvaigznes`}
    >
      C6 · B{transcendLevel}
    </span>
  )}
</div>
```
The `ROLE_META[character.role] &&` guard IS the UI-SPEC defensive fallback (invalid/missing role → render no badge silently). Import `ROLE_META` from `characters.ts` (or `roles.ts`). `character` is already in scope in this component.

---

### `src/ui/CharacterSheet.tsx` (component — badge in `.sheet__meta`)

**Analog:** the `.sheet__weapon` / `.sheet__level` chips in the same row (lines 88-96).

**Existing meta row to extend** (lines 88-96) — insert role BEFORE `.sheet__level` (PITFALL: `.sheet__level` has `margin-left:auto` at index.css:2333; appending after it strands the badge flush-right):
```tsx
<div className="sheet__meta">
  <span className={`sheet__stars rarity-${character.stars}`}>
    {'✦'.repeat(character.stars)}
  </span>
  <span className="sheet__weapon">{WEAPONS[character.weapon].displayName}</span>
  {ROLE_META[character.role] && (
    <span
      className="sheet__role"
      style={{ color: `var(${ROLE_META[character.role].token})` }}
      aria-label={`Loma: ${ROLE_META[character.role].aria}`}
    >
      {ROLE_META[character.role].label}
    </span>
  )}
  <span className="sheet__level">
    C{constellation} / C{MAX_CONSTELLATION}
  </span>
</div>
```
`character` and `CHARACTERS` are already imported (line 2). Import `ROLE_META` alongside `CHARACTERS` from `../game/data/characters`.

---

### `src/index.css` (config — tokens + badge rules)

**Analog:** `:root` reserved tokens (lines 22-25) + `.cchar__active-tag` rule (lines 3030-3038).

**Add four tokens to `:root`** — siblings of the reserved hues (do NOT repurpose `--accent`/`--gold`/`--shard`/`--danger`):
```css
:root {
  --accent: #7ec843;
  --gold: #f2c14e;
  --shard: #9333ea;
  --danger: #ff5c3c;
  /* NEW — combat-role hues (04-UI-SPEC Color table) */
  --role-tank: #4a8fd8;
  --role-dps: #f0476b;
  --role-healer: #2fd8a6;
  --role-support: #7c8cf8;
}
```

**Clone `.cchar__active-tag` verbatim** (lines 3030-3038 is the exact template) — color comes from inline `style`, so the rule omits `color:`:
```css
/* Role badge — third sibling of .cchar__active-tag / .cchar__transcend-tag.
   Color set inline per role via var(--role-*); border inherits currentColor. */
.cchar__role-tag {
  align-self: flex-start;
  margin-top: 10px;
  padding: 5px 10px;
  font: 700 10px var(--font-display);
  letter-spacing: 0.12em;
  border: 1px solid currentColor;
}
.sheet__role {
  padding: 5px 10px;
  font: 700 10px var(--font-display);
  letter-spacing: 0.12em;
  border: 1px solid currentColor;
}
```
`.sheet__role` drops `align-self`/`margin-top` (it is an inline row item, not a stacked column tag like `.cchar__role-tag`).

## Shared Patterns

### Static-const mirror (the load-bearing pattern — applies to ALL of characters.ts, index.ts, serverSync.test.ts)
**Source:** existing `stars`/`maxHealth`/`healthRegen`/heal fields, dual-written in `src/game/data/characters.ts` (lines 24-40, 64+) and `spacetimedb/src/index.ts` (`CHARACTER_STATS`, lines 41-63), guarded by `serverSync.test.ts`.
**Apply to:** every file that stores `role`. Client entries are multi-line; **server entries MUST stay single-line** (regex `[^}]*` constraint). The test reads the server file as *text* (line 28: `readFileSync(... 'spacetimedb/src/index.ts')`) — no publish or binding regen is needed to make `pnpm test` pass.

### Defensive render-nothing fallback (applies to both UI surfaces)
**Source:** UI-SPEC "invalid/missing role → render NO badge silently."
**Apply to:** both badge sites via the `{ROLE_META[character.role] && ( ... )}` guard. Never emit a placeholder or error string.

### Derive-once label/color (applies to both UI surfaces)
**Source:** UI-SPEC "do not hard-code per-character; one `ROLE_META` map shared by both surfaces."
**Apply to:** import a single `ROLE_META` (from `characters.ts` or a new `roles.ts`) in both `CharacterScreen.tsx` and `CharacterSheet.tsx`. Color via inline `style={{ color: 'var(<token>)' }}`, label + aria via the map.

## No Analog Found

None. Every touched file has an exact in-file or sibling-element precedent. The only element with no dedicated analog is the OPTIONAL new `src/game/data/roles.ts` extraction (a trivial exported-const module like `weapons.ts`/`elements.ts`); the planner may skip it and co-locate `Role`/`ROLE_META` inside `characters.ts`.

## Metadata

**Analog search scope:** `src/game/data/` (characters, tests), `spacetimedb/src/` (module const), `src/ui/` (CharacterScreen, CharacterSheet), `src/index.css` (`:root` + tag rules).
**Files scanned:** 6 (all read directly; targeted non-overlapping reads for the large `index.ts` and `index.css`).
**Pattern extraction date:** 2026-07-07
