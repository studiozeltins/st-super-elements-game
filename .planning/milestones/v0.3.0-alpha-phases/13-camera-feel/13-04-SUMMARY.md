---
phase: 13-camera-feel
plan: 04
subsystem: rendering
tags: [three, camera, integration, reduce-motion, accessibility, settings, playtest]

# Dependency graph
requires:
  - phase: 13-camera-feel
    plan: 01
    provides: "cameraFeelMath.ts pure twin — CAMERA_FEEL constants + spring/gate math"
  - phase: 13-camera-feel
    plan: 02
    provides: "createCameraFeel — apply/kickFov/shake/setReduceMotion/setPixelScale owner"
  - phase: 13-camera-feel
    plan: 03
    provides: "createCharacterModel.animate 4th MotionConfig arg (local lean + breathing)"
provides:
  - "createGame wires createCameraFeel: updateCamera delegates to apply(); 5 shake sites → cameraFeel.shake(); crit handlers → kickFov(); legacy shake state deleted (no-legacy)"
  - "Game.setReduceMotion(enabled) — one owner fanning to cameraFeel + MOTION_CFG_SCRATCH; the OS prefers-reduced-motion read unified as the frame-1 seed"
  - "MOTION_CFG_SCRATCH — one reused {reduceMotion, pixelScale} object passed to the LOCAL animate() (remote stays 3-arg)"
  - "App reduceMotion state + persist/apply effect + construct-time seed; SettingsScreen 'Samazināt kustību' toggle under ATTĒLOŠANA"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One persisted signal (settings.reduceMotion) → Game.setReduceMotion → cameraFeel + model scratch: single owner for ALL discretionary motion (lean, breathing, FOV kick, shake)"
    - "MOTION_CFG_SCRATCH mutated-in-place per frame, never re-allocated (Pitfall 5 / zero-alloc render loop)"
    - "localStorage settings.reduceMotion coerced with === '1'; absent key → OS prefers-reduced-motion (never eval/deserialize into logic — T-13-04a)"
    - "Optional trailing MotionConfig arg is the local/remote switch: local animate() 4-arg, remote animate() 3-arg (D-05)"

key-files:
  created: []
  modified:
    - src/game/createGame.ts
    - src/App.tsx
    - src/ui/SettingsScreen.tsx

key-decisions:
  - "13-04: the existing ~:364 `const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)')` becomes a `let` so it is BOTH the createCameraFeel frame-1 seed AND runtime-reassignable by setReduceMotion — one unified OS read, no second matchMedia in the loop (D-08/D-09)"
  - "13-04: legacy shake state (shakeMagnitude + SHAKE_DECAY_RATE/SHAKE_FLOOR + in-body jitter/decay + all 5 assignment sites) DELETED from createGame — the state now lives only in createCameraFeel; grep shakeMagnitude == 0 (no-legacy rule, closing 13-02's deferred deletion)"
  - "13-04: FOV kick taps only the two 'my crit landed' handlers (spawnWorldNumber isMine&&crit; spawnPlayerNumber isMine&&(crit||pvpCrit)); spawnSelfNumber (damage taken) is NOT tapped (D-06)"
  - "13-04: reduceMotion default = OS prefers-reduced-motion ONLY when the key is absent; the construct-time seed uses the same predicate as the state init so a fresh game is correct on frame 1 (D-09)"

requirements-completed: [CAM-01, CAM-02, CAM-03, CAM-04]

coverage:
  - id: wire-camerafeel
    description: "createCameraFeel constructed in createGame; updateCamera delegates to apply(); 5 combat-shake sites route through cameraFeel.shake()"
    requirement: CAM-03
    verification:
      - kind: build
        ref: "npm run build clean (tsc -b + vite)"
        status: pass
      - kind: manual-grep
        ref: "grep -c shakeMagnitude == 0; grep -c 'cameraFeel.shake(' == 5"
        status: pass
    human_judgment: false
  - id: crit-fov-taps
    description: "kickFov fires only on the local player's own crit hits in the two spawn handlers, not on damage taken"
    requirement: CAM-03
    verification:
      - kind: manual-grep
        ref: "cameraFeel.kickFov( only in spawnWorldNumber (isMine&&crit) + spawnPlayerNumber (isMine&&(crit||pvpCrit)); absent from spawnSelfNumber"
        status: pass
      - kind: manual
        ref: "Task 3 playtest step 4 — FOV kick rare, non-strobing on AoE crit, no kick on damage"
        status: pass
    human_judgment: true
  - id: reduce-motion-owner
    description: "Game.setReduceMotion fans to cameraFeel + MOTION_CFG_SCRATCH; App persists + seeds; SettingsScreen toggle wired"
    requirement: CAM-04
    verification:
      - kind: build
        ref: "npm run build clean"
        status: pass
      - kind: manual
        ref: "Task 3 playtest step 6 — toggle instantly zeroes lean+breathing+FOV+shake, persists across reload, defaults to OS pref"
        status: pass
    human_judgment: true
  - id: lean-breathing-pixel
    description: "local character leans into run direction (no horizon tilt) and breathes while idle with no pixel-crawl in pixel mode"
    requirement: CAM-01
    verification:
      - kind: manual
        ref: "Task 3 playtest steps 2/3/5 — lean reads E/W & N/S, calm idle breathing, crawl-free standing silhouette in pixel mode"
        status: pass
    human_judgment: true

# Metrics
duration: 5min
completed: 2026-07-21
status: complete
---

# Phase 13 Plan 04: Camera-Feel Integration + Reduce-Motion Toggle Summary

**The wave-3 integration that makes CAM-01..04 observable in-game: `createCameraFeel` is constructed in `createGame`, `updateCamera` shrinks to delegate to `apply()`, the 5 combat-shake sites become `cameraFeel.shake()` impulses, the two "my crit landed" handlers tap `cameraFeel.kickFov()`, the LOCAL `animate()` receives the reused `MOTION_CFG_SCRATCH`, and a persisted "Samazināt kustību" toggle (App state + SettingsScreen) gives ONE owner — `Game.setReduceMotion` — that zeroes lean, breathing, FOV kick AND shake, unified with the OS `prefers-reduced-motion` read as the frame-1 seed. The legacy shake state is deleted (no-legacy). Human playtest APPROVED all six perceptual checks.**

## Performance

- **Duration:** ~5 min (execution); human playtest gate spanned the checkpoint
- **Completed:** 2026-07-21
- **Tasks:** 3 (2 auto + 1 human-verify gate)
- **Files modified:** 3

## Accomplishments
- **Task 1 — createGame wiring:** constructed `createCameraFeel({ camera, reduceMotion })`; shrank `updateCamera` to build `desiredPosition` + `cameraFeel.apply(desiredPosition, deltaSeconds)` + the existing lerp/lookAt; **deleted** the local shake state, the two shake constants, and the in-body jitter/decay block (now owned solely by createCameraFeel); replaced all 5 combat-shake magnitude assignments with `cameraFeel.shake(...)`; added a reused `MOTION_CFG_SCRATCH` mutated in place and passed as the LOCAL `animate()` 4th arg (remote stays 3-arg, D-05); tracked a `let pixelated` beside `setPixelFilter` and forwarded it to `cameraFeel.setPixelScale(...)`; tapped `kickFov(elapsedSeconds)` in `spawnWorldNumber` (isMine&&crit) and `spawnPlayerNumber` (isMine&&(crit||pvpCrit)) only; added `Game.setReduceMotion(enabled)` fanning to the module `reduceMotion`, `cameraFeel.setReduceMotion`, and the scratch.
- **Task 2 — reduce-motion toggle UI:** cloned the `pixelFilter` wiring in App.tsx — a `reduceMotion` state defaulting to OS `prefers-reduced-motion` when `settings.reduceMotion` is absent (coerced with `=== '1'`, T-13-04a), a persist+apply effect calling `setReduceMotion`, and a construct-time seed so a fresh game is correct on frame 1; added `reduceMotion` + `onToggleReduceMotion` props to `SettingsScreen` with a `<Toggle label="Samazināt kustību" />` under ATTĒLOŠANA.
- **Task 3 — human playtest gate:** all six perceptual checks (lean reads E/W & N/S with no horizon tilt, calm idle breathing, rare non-strobing crit FOV kick that never fires on damage, crawl-free standing silhouette in pixel mode, and a toggle that instantly zeroes all motion + persists + defaults to OS pref) confirmed by the user — verdict "approved".
- Verification: `npm run build` clean; `grep -c shakeMagnitude src/game/createGame.ts` == 0; `cameraFeel.shake(` == 5; `cameraFeel.kickFov(` in the two crit handlers only.

## Task Commits

1. **Task 1: Wire createCameraFeel into createGame — updateCamera delegate, shake impulses, crit taps, scratch, setReduceMotion** — `51a43dd` (feat)
2. **Task 2: Reduce-motion toggle UI — App state/persist/seed + SettingsScreen toggle** — `60db937` (feat)
3. **Task 3: Playtest gate — feel + pixel-crawl + toggle** — no code commit (perceptual acceptance gate); PASSED via human playtest approval.

## Files Created/Modified
- `src/game/createGame.ts` — cameraFeel constructed; updateCamera delegates to apply(); 5 shake sites → cameraFeel.shake(); legacy shake state/constants/jitter block deleted; MOTION_CFG_SCRATCH reused into LOCAL animate(); pixelated tracked → setPixelScale; crit handlers → kickFov(); Game.setReduceMotion added; unified reduceMotion `let` seed.
- `src/App.tsx` — reduceMotion state (OS-default when key absent), persist+apply effect, construct-time seed, SettingsScreen prop wiring.
- `src/ui/SettingsScreen.tsx` — reduce-motion Toggle under ATTĒLOŠANA + two new props.

## Decisions Made
- The existing OS `prefers-reduced-motion` read at ~:364 became a `let` so it is simultaneously the `createCameraFeel` frame-1 seed and the runtime-reassignable module signal driven by `setReduceMotion` — one unified read, no second `matchMedia` in the render loop (D-08/D-09).
- The legacy shake block deferred by 13-02 is now fully deleted from createGame; the state lives only in createCameraFeel (`grep shakeMagnitude` == 0), honouring the no-legacy rule and closing the wave-2/wave-3 split cleanly — both halves landed together with no duplication ever reaching a running build.
- FOV kick taps only "my crit landed" handlers; `spawnSelfNumber` (damage taken) is deliberately NOT tapped so incoming damage never kicks the camera (D-06).
- `reduceMotion` defaults to the OS preference ONLY when `settings.reduceMotion` is absent; once the user toggles, the persisted `'1'`/`'0'` wins. The construct-time seed reuses the exact state-init predicate so frame 1 is correct before the effect fires.

## Deviations from Plan
None — plan executed exactly as written. All five createGame clusters, the App three-touch-point wiring, and the SettingsScreen toggle are delivered; build clean; all greps match the `<done>` criteria; the human playtest returned "approved".

## Issues Encountered
None.

## Known Stubs
None — the phase is fully wired end-to-end. `setPixelScale` (stored-but-inert in 13-02) is now driven by the real `pixelated` flag through createGame, and the model scratch is fed by the persisted toggle. No placeholder data paths remain.

## User Setup Required
None.

## Next Phase Readiness
- Phase 13 (camera-feel) is complete: CAM-01 (run lean), CAM-02 (idle breathing), CAM-03 (burst FOV kick), CAM-04 (reduce-motion toggle) are all observable in-game and confirmed by playtest. This closes the v0.3.0-alpha "Living World" milestone's camera work.
- A `?no*`-style bisect is available via the reduce-motion toggle itself (it zeroes all discretionary camera motion), useful for future FPS bisects that need to isolate camera-feel cost.

## Threat Flags
None. T-13-04a (localStorage tampering) is mitigated by `=== '1'` coercion with an OS-pref fallback (no eval/deserialize). T-13-04b (FOV strobe on multi-crit AoE) is mitigated by the KICK_COOLDOWN_S rate gate in createCameraFeel and confirmed non-strobing in playtest step 4.

## Self-Check: PASSED
- FOUND: src/game/createGame.ts
- FOUND: src/App.tsx
- FOUND: src/ui/SettingsScreen.tsx
- FOUND: commit 51a43dd
- FOUND: commit 60db937

---
*Phase: 13-camera-feel*
*Completed: 2026-07-21*
