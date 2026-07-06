---
phase: 03-shards-at-risk
plan: 04
subsystem: shard-client-feedback
tags: [three.js, react, hud, shard-drop, toast, counter-flash]
requires:
  - tables.shardDrop-bindings
  - reducers.collectShard-bindings
provides:
  - shard-drop-renderer
  - shard-movement-toast
  - shard-counter-flash
affects:
  - src/game/createGame.ts
  - src/App.tsx
  - src/index.css
  - src/ui/CharacterScreen.tsx
  - src/ui/GachaScreen.tsx
tech-stack:
  added: []
  patterns:
    - "Clone the gem 3D drop pipeline (mesh + magnet/grace/collect + sync/dispose) into a purple shard variant, reusing the GEM_PICKUP_DELAY/MAGNET/COLLECT constants verbatim"
    - "Client-side shard-movement disambiguation from a transcendShards diff plus two local timing signals (recent pvpHit-on-me, recent local collect request) — no new broadcast table"
    - "Loss vs gain distinguished by MOTION (--drain shrink) not hue — --danger stays reserved"
key-files:
  created: []
  modified:
    - src/game/createGame.ts
    - src/App.tsx
    - src/index.css
    - src/ui/CharacterScreen.tsx
    - src/ui/GachaScreen.tsx
decisions:
  - "Toast implemented as a fixed-slot DOM element in the App HUD (always visible in combat) rather than a Three.js self-number, since the counter chips live in overlay screens that are closed during play."
  - "UP-diff pickup vs kill-steal is told apart by a lastShardPickupAt timestamp recorded inside the sendCollectShard bridge — the pickup is the only shard gain the client itself initiates."
  - "DOWN-diff victim-theft vs PVE-drop is told apart by a recent pvpHit-on-me timestamp (the shard only leaves on a fatal hit, so a non-fatal hit produces no diff and no false toast)."
metrics:
  duration: ~20m
  completed: 2026-07-06
  tasks: 3
  files: 5
status: complete
---

# Phase 3 Plan 04: Client Shard Drop, Toast & Counter Flash Summary

Rendered `shard_drop` pickups as a distinct purple "rare shard" (a 1.4x, brighter, always-sparkling relative of the gold gem) and surfaced shard loss/theft on the client — a diff-driven lost/stolen/stole self toast plus a gain/loss flash on the existing shard counter — all by reusing the shipped gem renderer and event-feedback patterns, with no new palette, screens, or broadcast tables.

## What Was Built

- **Shard drop renderer (`createGame.ts`)** — `createShardMesh` builds `OctahedronGeometry(0.42)` in `0x9333ea` (color + emissive, `emissiveIntensity 0.6`) with a denser purple landing burst and always-on sparkle; `updateShardDrops` mirrors `updateGemDrops` (spin/bob, grace gate, magnet, collect) using a private `requestedShardPickups` Set and `network.sendCollectShard(rawId)`; `syncShardDrops` reconciles a private `shardDrops` Map (add/remove/dispose). `updateShardDrops` runs in the same animation frame as `updateGemDrops`; `syncShardDrops` and `sendCollectShard` are exposed on the `Game` / `GameNetworkActions` interfaces.
- **Subscription plumbing (`App.tsx`)** — `tables.shardDrop` added to the subscribe list, read via `useTable`, and pushed into `gameRef.syncShardDrops` by a sibling `useEffect`, mirroring the gemDrop wiring. The `sendCollectShard` bridge maps to `connection.reducers.collectShard({ dropId })`.
- **Counter flash + movement toast (`App.tsx`, `index.css`, two screens)** — a `prevShardsRef` + diff `useEffect` on `myPlayer.transcendShards` toggles `--pulse` (gain) / `--drain` (loss). `.wallet-chip--drain` (new keyframe) is a quick shrink with a dimmed glow, staying in `--shard` purple (no `--danger`). The flash class is threaded to the `CharacterScreen` and `GachaScreen` shard chips. A diff-driven `.shard-toast` (fixed HUD slot, `◈` glyph, ~1.5s auto-dismiss) shows three textually distinct Latvian strings — `Zvaigžņu šķemba nokrita` (PVE drop), `Zvaigžņu šķemba nozagta!` (stolen victim), `Nozagi zvaigžņu šķembu!` (killer steal) — while a plain ground pickup shows the counter pulse but no toast.

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Render shard_drop pickups (createShardMesh/updateShardDrops/syncShardDrops) | adce511 | src/game/createGame.ts, src/App.tsx |
| 2 | Wire shardDrop subscribe/useTable/sync + sendCollectShard bridge | 849f3d3 | src/App.tsx |
| 3 | Shard lost/stolen toast + counter flash | b9d488c | src/App.tsx, src/index.css, src/ui/CharacterScreen.tsx, src/ui/GachaScreen.tsx |

## Verification

- `pnpm build` (`tsc -b && vite build`) green after each task.
- Source checks: `createShardMesh` uses `OctahedronGeometry(0.42)` + `0x9333ea` (not `GEM_RADIUS`/gold); `updateShardDrops`/`syncShardDrops` exist and are wired into the frame loop + `Game` interface; `network.sendCollectShard` referenced. `tables.shardDrop` in the subscribe list; `shardDropRows` via `useTable`; sync `useEffect` present; `sendCollectShard` on both the bridge object and `GameNetworkActions`.
- `.wallet-chip--drain` present in `index.css` (shrink keyframe, `--shard`, no `--danger`); three distinct Latvian toast strings present; the pickup path (recent local `collectShard` request) suppresses the steal toast.
- Live in-combat UI checks (purple/1.4x/brighter/sparkling drop; drain-not-danger loss flash; three distinct toasts; pickup shows no steal toast) are deferred to the Plan 05 playtest per the plan's verification note.

## Deviations from Plan

### Auto-fixed / Adjusted

**1. [Rule 3 - Blocking] `sendCollectShard` bridge added in Task 1 (not Task 2)**
- **Found during:** Task 1
- **Issue:** Task 1 makes `sendCollectShard` a required member of the `GameNetworkActions` interface, which `App.tsx`'s inline network object must satisfy — so `tsc -b` (part of `pnpm build`) fails until the bridge line exists.
- **Fix:** Added the one-line `sendCollectShard` bridge entry to `App.tsx` in Task 1 to keep the per-commit build green; Task 2 then added the subscribe/`useTable`/sync wiring and (in Task 3) the pickup-timestamp side effect on that same bridge.
- **Files modified:** src/App.tsx
- **Commit:** adce511

**2. [Rule 2 - Critical wiring] Counter flash threaded through `CharacterScreen.tsx` + `GachaScreen.tsx`**
- **Found during:** Task 3
- **Issue:** The plan's `files_modified` listed only `createGame.ts`, `App.tsx`, `index.css`, but the `.wallet-chip` shard counter is not rendered in `App.tsx` — it lives in the `CharacterScreen` and `GachaScreen` overlay components. The must-have "the counter flashes `--pulse`/`--drain`" cannot be satisfied without threading the flash modifier to those chips.
- **Fix:** App computes `shardFlashClass` from the diff and passes it as an optional `shardFlashClass` prop to both screens, which append it to their `wallet-chip` className. The diff trigger and toast still live entirely in `App.tsx` as specified.
- **Files modified:** src/ui/CharacterScreen.tsx, src/ui/GachaScreen.tsx
- **Commit:** b9d488c

**3. [Design choice within plan latitude] Toast is a DOM HUD element**
- The plan allowed "extend `spawnSelfNumber` … or a small self-anchored DOM toast." A fixed-slot DOM toast in the App HUD was chosen because it is always visible during combat (the counter chips are overlay-only) and avoids adding text rendering to the Three.js layer. Mechanism/color/glyph match the UI-SPEC; only the anchor is the fixed HUD slot the spec explicitly permits.

## Known Stubs

None — all surfaces are wired to live data (`tables.shardDrop` subscription, `myPlayer.transcendShards` diff, `pvpHit` table, and the local collect request). No placeholder values, empty data sources, or TODOs introduced.

## Self-Check: PASSED

- FOUND: src/game/createGame.ts (createShardMesh / updateShardDrops / syncShardDrops)
- FOUND: src/App.tsx (shardDrop subscribe + useTable + sync effect + sendCollectShard bridge + diff toast/flash)
- FOUND: src/index.css (.wallet-chip--drain, .shard-toast)
- FOUND: commit adce511
- FOUND: commit 849f3d3
- FOUND: commit b9d488c
