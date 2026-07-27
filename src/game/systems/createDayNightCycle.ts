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

/** Pale cool moonlight tint for the sea glint when the sun is below the horizon. */
const MOON_GLINT_COLOR = 0xaec6ff;

export function createDayNightCycle(
  enabled: boolean,
  movingSunEnabled: boolean,
  clock: ServerClock,
  ambience: AmbienceHandles,
  /** ?time=<0..1> testing override — freeze the cycle at this phase (0 night, 0.5 noon). */
  phaseOverride?: number,
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

  // The current lantern-on level (0 day, 1 night). Cached so the per-frame candle
  // FLICKER keeps breathing even when the phase itself is frozen (?time / disabled).
  let lanternLevel = 0;

  /**
   * Per-lantern candle FLICKER (two detuned sines → organic wobble) over the
   * cached on-level. Runs EVERY frame — including when the day/night phase is
   * frozen — so a ?time=0 night still shows the lanterns breathing. Modulates
   * both the PointLight intensity and the emissive lamp-body glow: by day
   * (level 0) the lamp reads as dark OFF glass, by night it glows + breathes.
   */
  function updateLanternFlicker(): void {
    // Wrap the clock to keep the sine argument small (no bigint→float precision loss).
    const tSec = Number(clock.nowMicros() % 1_000_000_000n) / 1_000_000;
    for (let i = 0; i < ambience.lanternLights.length; i += 1) {
      const flicker =
        1 + 0.14 * Math.sin(tSec * 8.5 + i * 2.1) + 0.08 * Math.sin(tSec * 17.3 + i * 4.7);
      const glow = Math.max(0, lanternLevel * flicker);
      ambience.lanternLights[i].intensity = LANTERN_BASE_INTENSITY * glow;
      const lamp = ambience.lanternLamps[i];
      if (lamp) {
        scratchLamp.setHex(LANTERN_LAMP_COLOR).multiplyScalar(Math.min(1, glow));
        (lamp.material as THREE.MeshBasicMaterial).color.copy(scratchLamp);
      }
    }
  }

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

    // Sun DIRECTION rides the phase (Phase 09.1, SHADOW-01). Compute it ONCE for
    // both consumers (pure math → reused scratch, zero alloc): the sea's specular
    // glint ALWAYS reads it (below), but the SHADOW sun is only moved when
    // movingSunEnabled — otherwise the world keeps its frozen FROZEN_SUN_DIR default
    // (byte-exact SHADOW-04), while colors above STILL drift whenever enabled (D-10).
    sunDir(phase, scratchSunDir);
    if (movingSunEnabled) {
      ambience.setSunDirection(scratchSunDir.x, scratchSunDir.y, scratchSunDir.z);
    }
    // Glint light body: the SUN when it is above the horizon, otherwise its antipode
    // (≈ the MOON, up at night) so the sea always carries a reflected highlight.
    const sunUp = scratchSunDir.y > 0.02;
    const glintX = sunUp ? scratchSunDir.x : -scratchSunDir.x;
    const glintY = sunUp ? scratchSunDir.y : -scratchSunDir.y;
    const glintZ = sunUp ? scratchSunDir.z : -scratchSunDir.z;

    // Water reflects the sky (uSkyTop/uHorizon → bright day water, dark by night)
    // and, on the sea, the sun/moon glint (uSunDir/uSunColor — the fountain water
    // has no such uniforms, so both are guarded).
    for (let i = 0; i < ambience.waterMaterials.length; i += 1) {
      const u = ambience.waterMaterials[i].uniforms;
      (u.uSkyTop.value as THREE.Color).setHex(palette.skyTop);
      (u.uHorizon.value as THREE.Color).setHex(palette.horizon);
      if (u.uSunDir) (u.uSunDir.value as THREE.Vector3).set(glintX, glintY, glintZ);
      if (u.uSunColor) {
        (u.uSunColor.value as THREE.Color).setHex(sunUp ? palette.sunColor : MOON_GLINT_COLOR);
      }
    }

    // Hemisphere fill: sky color, ground color, intensity.
    scratchHemiSky.setHex(palette.hemiSky);
    ambience.skyLight.color.copy(scratchHemiSky);
    scratchHemiGround.setHex(palette.hemiGround);
    ambience.skyLight.groundColor.copy(scratchHemiGround);
    ambience.skyLight.intensity = palette.hemiIntensity;

    // Plaza lanterns fade by intensity only (no add/remove): base * lanternLevel
    // (0 by day, 1 by night — DAYNITE-04). Cache the level; the flicker is applied
    // every frame by updateLanternFlicker (so it breathes even under a frozen phase).
    lanternLevel = palette.lanternLevel;
    updateLanternFlicker();
  }

  if (phaseOverride != null) {
    // ?time=<0..1>: freeze the whole cycle at a fixed phase for testing.
    apply(((phaseOverride % 1) + 1) % 1);
  } else if (enabled) {
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
      // Phase frozen (?time / ?nodaynight): keep the fixed colors + sun, but still
      // tick the lantern flicker so a frozen night isn't a dead, static scene.
      if (phaseOverride != null || !enabled) {
        updateLanternFlicker();
        return;
      }
      apply(phase01(clock.nowMicros()));
    },
  };
}
