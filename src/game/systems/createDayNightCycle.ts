import * as THREE from 'three';
import { phase01, samplePalette, sunDir } from './dayNightMath';
import type { ServerClock } from '../net/createServerClock';
import type { AmbienceHandles } from '../world/createMondstadtWorld';
import { LANTERN_BASE_INTENSITY, LANTERN_LAMP_COLOR } from '../world/assets/createLantern';

/**
 * The day/night cycle — the ONE writer of the ambience handles (the sibling of
 * createWind for atmosphere instead of motion). It pulls the current phase from
 * the server clock, samples the tested dayNightMath palette, and drifts the
 * fog/sky/light colors + lantern intensity through AmbienceHandles. All the
 * palette MATH lives in dayNightMath (THREE-free, unit-tested); this factory
 * only loads the already-blended hex/intensity numbers into preallocated scratch
 * THREE.Colors and `.copy()`s them into the live scene objects — so CPU math and
 * render can never drift, and there is ZERO per-frame allocation (D-13 discipline).
 *
 * IMPORTANT: consumers hold the OBJECTS (fog.color, the lights, the sky-dome
 * uniform). Their `.color`/`.intensity` are mutated in place every frame; this
 * is the only system that touches them. The sun DIRECTION is a first-class
 * per-frame write channel now (Phase 09.1): when movingSunEnabled this factory
 * writes sunDir(phase) through ambience.setSunDirection every frame; otherwise the
 * world keeps its frozen high-noon default. Materials are never re-tinted; the
 * lights carry the mood.
 *
 * `createGame.frame()` is the only caller of `update()` — the phase advances in
 * the game loop, NEVER per React render (client-perf rule).
 */
export interface DayNightCycle {
  /** Re-sample the palette for the current server time. Called ONCE per frame. */
  update(): void;
}

/**
 * The neutral daylight phase used for the `?nodaynight` freeze (D-09): the "day"
 * keyframe whose horizon === the shipped fog hex (0x8ecae6), so the disabled
 * scene reads identically to the pre-day/night look for FPS bisection.
 */
const NEUTRAL_DAY_PHASE = 0.3;

export function createDayNightCycle(
  enabled: boolean,
  movingSunEnabled: boolean,
  clock: ServerClock,
  ambience: AmbienceHandles,
): DayNightCycle {
  // Scratch Colors constructed ONCE at factory scope. apply() only setHex()s the
  // blended palette hex into these and .copy()s into the live objects — never
  // `new THREE.Color()` per frame (zero-alloc render path, ATMO/D-13).
  const scratchHorizon = new THREE.Color();
  const scratchSkyTop = new THREE.Color();
  const scratchSunColor = new THREE.Color();
  const scratchHemiSky = new THREE.Color();
  const scratchHemiGround = new THREE.Color();
  // Persistent sun-direction scratch — sunDir() mutates this in place each frame,
  // so the moving-sun path heap-allocates nothing (zero-alloc render rule, D-13).
  const scratchSunDir = { x: 0, y: 0, z: 0 };
  // One scratch Color for the lamp-glow fade — setHex + multiplyScalar per lamp,
  // never `new` per frame (zero-alloc render path).
  const scratchLamp = new THREE.Color();

  function apply(phase: number): void {
    const palette = samplePalette(phase);

    // Horizon → fog.color, which IS the sky-dome bottomColor uniform instance
    // (ATMO-02 single-source): writing fog.color drifts both together.
    scratchHorizon.setHex(palette.horizon);
    ambience.fog.color.copy(scratchHorizon);

    // Sky-dome top via the setSkyTop scratch (copies into the topColor uniform).
    scratchSkyTop.setHex(palette.skyTop);
    ambience.setSkyTop(scratchSkyTop);

    // Sun color + intensity drift with the palette.
    scratchSunColor.setHex(palette.sunColor);
    ambience.sunLight.color.copy(scratchSunColor);
    ambience.sunLight.intensity = palette.sunIntensity;

    // Sun DIRECTION rides the same phase (Phase 09.1, SHADOW-01): when moving,
    // write the capped-dome sunDir(phase) into the persistent scratch and push it
    // through the single ambience channel (pure math → reused scratch, zero alloc).
    // When !movingSunEnabled we DON'T call sunDir — the world keeps its frozen
    // FROZEN_SUN_DIR default (byte-exact SHADOW-04), while colors above STILL drift
    // whenever dayNightEnabled (D-10).
    if (movingSunEnabled) {
      sunDir(phase, scratchSunDir);
      ambience.setSunDirection(scratchSunDir.x, scratchSunDir.y, scratchSunDir.z);
    }

    // Fountain water reflects the current sky — drive its uSkyTop/uHorizon so the
    // pool is bright day water and dark blue by night (matches the sky dome).
    for (let i = 0; i < ambience.waterMaterials.length; i += 1) {
      const u = ambience.waterMaterials[i].uniforms;
      (u.uSkyTop.value as THREE.Color).setHex(palette.skyTop);
      (u.uHorizon.value as THREE.Color).setHex(palette.horizon);
    }

    // Hemisphere fill: sky color, ground color, intensity.
    scratchHemiSky.setHex(palette.hemiSky);
    ambience.skyLight.color.copy(scratchHemiSky);
    scratchHemiGround.setHex(palette.hemiGround);
    ambience.skyLight.groundColor.copy(scratchHemiGround);
    ambience.skyLight.intensity = palette.hemiIntensity;

    // Plaza lanterns fade by intensity only (no add/remove): base * lanternLevel
    // (0 by day, 1 by night — DAYNITE-04). The subtree is matrix-frozen. On top of
    // the level, a per-lantern candle FLICKER (two detuned sines → organic wobble)
    // modulates both the PointLight intensity and the emissive lamp-body glow, so
    // by day (level 0) the lamp reads as dark OFF glass, by night it glows + breathes.
    const level = palette.lanternLevel;
    // Wrap the clock to keep the sine argument small (no bigint→float precision loss).
    const tSec = Number(clock.nowMicros() % 1_000_000_000n) / 1_000_000;
    for (let i = 0; i < ambience.lanternLights.length; i += 1) {
      const flicker =
        1 + 0.1 * Math.sin(tSec * 8.5 + i * 2.1) + 0.06 * Math.sin(tSec * 17.3 + i * 4.7);
      const glow = Math.max(0, level * flicker);
      ambience.lanternLights[i].intensity = LANTERN_BASE_INTENSITY * glow;
      const lamp = ambience.lanternLamps[i];
      if (lamp) {
        scratchLamp.setHex(LANTERN_LAMP_COLOR).multiplyScalar(Math.min(1, glow));
        (lamp.material as THREE.MeshBasicMaterial).color.copy(scratchLamp);
      }
    }
  }

  if (enabled) {
    // Snap to the current time of day on load — no 30s sunrise ramp from a cold
    // neutral start (Pitfall 6).
    apply(phase01(clock.nowMicros()));
  } else {
    // ?nodaynight: apply a neutral day keyframe ONCE; update() is a no-op so the
    // frozen scene is a clean FPS-bisection baseline (D-09).
    apply(NEUTRAL_DAY_PHASE);
  }

  return {
    update() {
      if (!enabled) return;
      apply(phase01(clock.nowMicros()));
    },
  };
}
