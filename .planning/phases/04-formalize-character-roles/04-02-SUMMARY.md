---
phase: 04-formalize-character-roles
plan: 02
subsystem: ui
tags: [react, css, hud, accessibility, latvian, character-roles]

# Dependency graph
requires:
  - phase: 04-01
    provides: "Role union + required role field on all 17 roster entries and the exported ROLE_META (label/token/aria) map in characters.ts"
provides:
  - "Four --role-* CSS tokens in :root (tank/dps/healer/support hues)"
  - ".cchar__role-tag and .sheet__role badge CSS rules cloning the .cchar__active-tag box model"
  - "Read-only combat-role badge rendered on CharacterScreen (.cchar__id stack) and CharacterSheet (.sheet__meta row)"
affects: [phase-6-role-gated-combat, hud-skins]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Derive-once badge: single ROLE_META map consumed by both HUD surfaces (no per-character hard-coding)"
    - "Defensive render-nothing fallback via {ROLE_META[character.role] && (...)} guard"
    - "Colored-outline text pill (color inline, border inherits currentColor) as a third sibling of the existing HUD tag family"

key-files:
  created: []
  modified:
    - src/index.css
    - src/ui/CharacterScreen.tsx
    - src/ui/CharacterSheet.tsx

key-decisions:
  - "Reused the shipped .cchar__active-tag box model verbatim (5px 10px padding, 10px stack offset) for pixel parity — did not re-derive to the 4/8 spacing scale"
  - "Color set inline per role via var(--role-*); CSS rule omits color so the 1px border inherits currentColor"
  - "Placed CharacterSheet badge BEFORE .sheet__level (which has margin-left:auto) to avoid stranding it flush-right"

patterns-established:
  - "Combat-role badge: color-blind-safe (Latvian uppercase text label + redundant per-role color), passive <span> (no interactive states)"

requirements-completed: [REQ-combat-roles]

coverage:
  - id: D1
    description: "Four --role-* tokens and .cchar__role-tag/.sheet__role badge CSS rules added; pnpm build compiles cleanly"
    requirement: "REQ-combat-roles"
    verification:
      - kind: automated_ui
        ref: "pnpm build (vite tsc + css compile) — green"
        status: pass
    human_judgment: false
  - id: D2
    description: "Role badge visible on CharacterScreen (active->role->transcend) and CharacterSheet (before level chip) with correct Latvian label, per-role color, and aria-label; invalid/missing role renders no badge"
    requirement: "REQ-combat-roles"
    verification:
      - kind: manual_procedural
        ref: "04-VALIDATION.md manual UAT: open character screen + character card, confirm badge placement/color/label"
        status: unknown
    human_judgment: true
    rationale: "Visual placement, per-role color rendering, and pixel-parity with existing tags require human visual inspection per 04-VALIDATION.md (manual-only); build proves it compiles but not that it looks correct"

# Metrics
duration: 8min
completed: 2026-07-07
status: complete
---

# Phase 4 Plan 02: Combat-Role Badge Summary

**Read-only Latvian combat-role badge (SARGS/UZBRUCĒJS/DZIEDNIEKS/ATBALSTS) rendered as a colored-outline text pill on CharacterScreen and CharacterSheet, driven by the single ROLE_META map with a render-nothing fallback for invalid roles.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-07-07T13:10:00Z
- **Completed:** 2026-07-07T13:19:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added four dedicated combat-role hues to `:root` (`--role-tank #4a8fd8`, `--role-dps #f0476b`, `--role-healer #2fd8a6`, `--role-support #7c8cf8`) without repurposing any reserved token.
- Added `.cchar__role-tag` (stacked column tag) and `.sheet__role` (inline row chip) CSS rules cloning the `.cchar__active-tag` box model; color set inline so the border inherits currentColor.
- Rendered the role badge on both identity surfaces — CharacterScreen in the `.cchar__id` stack (active -> role -> transcend order) and CharacterSheet in the `.sheet__meta` row before the `.sheet__level` chip.
- Both surfaces consume the single `ROLE_META` from characters.ts; the `{ROLE_META[character.role] && (...)}` guard is the defensive render-nothing fallback.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add --role-* tokens and badge CSS rules** - `8fa0827` (feat)
2. **Task 2: Render role badge on CharacterScreen and CharacterSheet** - `5c40b0b` (feat)

## Files Created/Modified
- `src/index.css` - Four `--role-*` `:root` tokens; `.cchar__role-tag` and `.sheet__role` rules cloning the active-tag box model (color omitted).
- `src/ui/CharacterScreen.tsx` - Import `ROLE_META`; badge `<span className="cchar__role-tag">` between active-tag and transcend-tag with inline color, aria-label, and guard.
- `src/ui/CharacterSheet.tsx` - Import `ROLE_META` alongside `CHARACTERS`; badge `<span className="sheet__role">` before the `.sheet__level` chip.

## Decisions Made
- Reused the shipped tag box model verbatim (5px 10px padding, 10px stack offset) for pixel-exact parity with the existing active/transcend tags rather than the 4/8 spacing scale — per 04-UI-SPEC's explicit exception.
- Set badge color inline via `var(--role-*)` and left the CSS `color` undeclared so the `1px solid currentColor` border tracks the role hue automatically.
- Placed the CharacterSheet badge before `.sheet__level` (which carries `margin-left:auto`) to keep it grouped with stars/weapon rather than stranded flush-right.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - client visual-only change; no server publish or binding regeneration required.

## Next Phase Readiness
- Badge is display-only. Phase 6 role-gated combat MUST read the server `CHARACTER_STATS` role (never the displayed badge value) per the plan threat register (T-04-03).
- `pnpm build` green and full test suite (373 tests) remains green.

## Self-Check: PASSED

- All 3 modified files present on disk.
- Both task commits (`8fa0827`, `5c40b0b`) present in git history.
- Badge CSS tokens/classes present in src/index.css.

---
*Phase: 04-formalize-character-roles*
*Completed: 2026-07-07*
