---
phase: 01-constellation-shard-currency
plan: 04
subsystem: ui
tags: [react, spacetimedb, currency, wallet-chip, css]

# Dependency graph
requires:
  - phase: 01-03
    provides: regenerated bindings so player.transcendShards is typed as u32
  - phase: 01-02
    provides: server C6-overflow mint semantics (resolveDupeGrant) that populate the balance
provides:
  - transcendShards read-only render in GachaScreen wallet (every tab)
  - transcendShards read-only render in CharacterScreen topbar
  - shared .wallet-chip CSS treatment (gold + 15px + 0.04em tracking)
  - transcendShards prop threaded through App.tsx into both screens
affects: [phase-2-shard-feedback, transcendence-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Read-through render: client renders myPlayer?.transcendShards ?? 0 straight from the subscribed player row; never computes or mutates the balance"
    - "Shared .wallet-chip class consumed by both screens for one identical currency chip"

key-files:
  created: []
  modified:
    - src/index.css
    - src/App.tsx
    - src/ui/GachaScreen.tsx
    - src/ui/CharacterScreen.tsx

key-decisions:
  - "Extracted a shared .wallet-chip class (preferred DRY path) rather than a screen-local copy, so the gacha and character chips are provably identical."
  - "12px gap between the shard chip and the swapping readout scoped to .gacha__wallet .wallet-chip so it does not leak into the character-screen topbar."

patterns-established:
  - "Currency chip: <span class=wallet-chip aria-label=...><span class=gacha__gem>◈</span> {n}</span>, gold ◈ U+25C8 glyph, always rendered (shows 0)."

requirements-completed: [REQ-shard-currency-mint]

coverage:
  - id: D1
    description: "transcendShards balance renders as a gold ◈ chip in the GachaScreen wallet on every tab, left of the swapping gems/owned readout"
    requirement: "REQ-shard-currency-mint"
    verification:
      - kind: automated_ui
        ref: "pnpm build (tsc + vite) green; grep transcendShards src/ui/GachaScreen.tsx == 4"
        status: pass
      - kind: manual_procedural
        ref: "playtest step 2 — chip visible on characters/banners/party tabs, gold, same number"
        status: unknown
    human_judgment: true
    rationale: "Visual identity, glyph rendering, and on-every-tab placement require a human to eyeball the built HUD; build only proves it compiles."
  - id: D2
    description: "transcendShards balance renders as an identical gold ◈ chip in the CharacterScreen topbar, pinned before the close button outside the roster scroll region"
    requirement: "REQ-shard-currency-mint"
    verification:
      - kind: automated_ui
        ref: "pnpm build green; grep transcendShards src/ui/CharacterScreen.tsx == 4"
        status: pass
      - kind: manual_procedural
        ref: "playtest step 2 — topbar chip visible, pinned while roster scrolls, matches gacha chip"
        status: unknown
    human_judgment: true
    rationale: "Pinned-vs-scroll behaviour and visual parity with the gacha chip need human observation."
  - id: D3
    description: "C6-overflow dupe mints exactly 1 shard (gems unchanged, no 800-gem refund); sub-C6 dupe increments constellation only — reflected reactively in both chips"
    requirement: "REQ-shard-currency-mint"
    verification:
      - kind: manual_procedural
        ref: "playtest steps 3-5 — pull dupe at C6 and below C6, confirm shard counter + gem balance via in-game and spacetime sql"
        status: unknown
    human_judgment: true
    rationale: "End-to-end mint semantics + reactive subscription push can only be confirmed by a live local playtest; this is the plan's blocking human-verify gate."

# Metrics
duration: 8min
completed: 2026-07-06
status: awaiting-verification
---

# Phase 01 Plan 04: Surface transcend-shard balance in Gacha + Character screens Summary

**Read-only gold ◈ transcend-shard chip threaded from the subscribed player row into the GachaScreen wallet (every tab) and the CharacterScreen topbar via a shared `.wallet-chip` class; build green, live playtest pending human sign-off.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-06T14:24:00Z
- **Completed:** 2026-07-06T14:32:45Z (render work; playtest gate open)
- **Tasks:** 2 of 3 executed (Task 3 is the blocking human-verify checkpoint)
- **Files modified:** 4

## Accomplishments
- Added `transcendShards: number` to `GachaScreenProps` and `CharacterScreenProps`; threaded `transcendShards={myPlayer?.transcendShards ?? 0}` into both screens from `useTable(tables.player)`.
- Rendered an identical gold `◈` (U+25C8) shard chip: in the gacha wallet on every tab (left of the swapping gems/owned readout, 12px gap) and in the character-screen topbar (right-aligned before the close button, pinned outside the roster scroll region).
- Extracted a shared `.wallet-chip` treatment (gold `--gold` #f2c14e, 15px, `letter-spacing: 0.04em`, lifted verbatim from `.gacha__wallet`) so both chips are provably identical; `aria-label="Zvaigžņu šķembas: {n}"`, always rendered including `0`.
- Client only displays the subscribed value — no client-side computation or mutation of the balance (threat T-1-06 mitigated).
- `pnpm build` green against the regenerated 01-03 bindings.

## Task Commits

Each task was committed atomically:

1. **Task 1: Wallet-chip CSS + thread transcendShards through App.tsx into GachaScreen** - `3ca26e5` (feat)
2. **Task 2: Shard chip in CharacterScreen topbar** - `57e8ecc` (feat)
3. **Task 3: Human-verify shard chips render + C6-dupe mint playtest** - PENDING (blocking human-verify checkpoint; not self-approved)

**Plan metadata:** _(this docs commit)_

## Files Created/Modified
- `src/index.css` - Added shared `.wallet-chip` class + scoped 12px gap for the gacha wallet.
- `src/App.tsx` - Passed `transcendShards={myPlayer?.transcendShards ?? 0}` to both `GachaScreen` and `CharacterScreen`.
- `src/ui/GachaScreen.tsx` - New `transcendShards` prop; `◈` chip inside `.gacha__wallet` on every tab.
- `src/ui/CharacterScreen.tsx` - New `transcendShards` prop; `◈` chip in `.cscreen__topbar` before the close button.

## Decisions Made
- Chose the shared `.wallet-chip` class (UI-SPEC preferred DRY path) over a screen-local copy so both instances are guaranteed visually identical.
- Scoped the 12px inter-chip gap to `.gacha__wallet .wallet-chip` so it applies only where the shard chip sits next to the swapping readout, not in the character topbar.
- Added `flex-shrink: 0` to `.wallet-chip` so it stays pinned as a flex child of the topbar while the roster (`flex: 1`) scrolls; harmless in the gacha wallet where the chip is inline.

## Deviations from Plan

None - plan executed exactly as written. No auto-fixes (Rules 1-4) were needed; the existing `gems` chip was a clean in-file exemplar and the 01-03 bindings already typed `transcendShards`.

## Issues Encountered
None.

## Human Verification Pending (blocking gate — Task 3)

The client render is complete and build-verified, but the plan is `autonomous: false` and ends at a `checkpoint:human-verify`. This was **NOT self-approved**. A human must run the local playtest:

1. `pnpm build` is green; open the LAN/laragon build (or `pnpm dev`) and log in.
2. Confirm the `◈` shard chip is visible in the Gacha wallet on ALL tabs (characters / banners / party) and in the Character screen topbar; both gold, same glyph/size, same number (including `0`).
3. Take a character to C6, then pull another dupe of that SAME character: shard counter +1 and gems do NOT jump by 800 (no refund). Optionally verify via `spacetime sql 2d-impact-game-fr9ti --server local "SELECT transcend_shards, gems FROM player WHERE ..."`.
4. Pull a dupe of a character still BELOW C6: constellation increments and NO shard is minted.
5. Confirm both chips update reactively without reload (subscription push).

**Resume signal:** reply "approved" once both chips render correctly and the C6-dupe mints exactly 1 shard with gems unchanged; otherwise describe what you saw.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Success criterion 3 (shard balance visible in Character and Gacha screens) is implemented and build-verified; pending the human playtest above.
- Per-pull "+1 shard" mint feedback animation is explicitly deferred to Phase 2 (UI-SPEC / RESEARCH open question 1).

## Self-Check: PASSED

- `01-04-SUMMARY.md` present.
- Commits `3ca26e5`, `57e8ecc`, `3ef3092` all in git history.

---
*Phase: 01-constellation-shard-currency*
*Completed: 2026-07-06 (render); playtest gate open*
