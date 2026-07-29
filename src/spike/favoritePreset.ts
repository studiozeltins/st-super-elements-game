/**
 * A hand-tuned Water Pro look exported from the vendor demo's "Export Settings"
 * (the user picked this one). Applied verbatim via `water.loadPreset(...)`.
 *
 * The `sky` block is KEPT: loadPreset reads `preset.sky.sun` (for the water's
 * sun/reflection lighting), so removing it crashes boot with
 * `Cannot read properties of undefined (reading 'sun')`. Its HDRI `source.url`
 * would 404 here, but the spike immediately replaces the water's sky with the
 * Sky Pro provider (`water.setSky(...)`) after loadPreset, so it never renders.
 * `postProcessing.enabled` is false — good, the spike owns post (the TSL pixel
 * filter), not Water Pro's chain.
 *
 * Typed loosely (WaterPreset accepts this exported shape); nothing in src/game
 * imports it.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export const FAVORITE_WATER: any = {
  caustics: { enabled: true, surface: { strength: 0.6, scale: 0.025, speed: 0.22 } },
  clipmap: { baseSize: 800, levels: 5 },
  environment: { intensity: 1 },
  color: {
    absorptionColor: "#231f1f",
    transmissionColor: "#50a890",
    waterColor: "#061b28",
  },
  foam: {
    surface: {
      enabled: true,
      opacity: 0.35,
      color: "#ffffff",
      size: 261,
      coverage: 0.17,
      texture: "foam2",
    },
    waves: {
      enabled: true,
      opacity: 0.15,
      color: "#ffffff",
      size: 481,
      windStretch: 0.47,
      texture: "foam3",
      persistence: { crestStrength: 1, decayTime: 2.61, windwardStrength: 1 },
    },
    shoreline: {
      enabled: true,
      opacity: 0.05,
      size: 101,
      coverage: 0.81,
      range: 43,
      color: "#edf9fd",
      texture: "foam2",
    },
  },
  fog: {
    color: "#e0b48a",
    enabled: true,
    fadeEnd: 10000,
    fadePower: 0.4,
    fadeStart: 2850,
    skyBlendDistance: 2700,
  },
  fresnel: {
    surface: {
      fadePower: 3.1,
      fadeStart: 0,
      iorRatio: 1.33,
      normalStrength: 0.72,
      refractionStrength: 0.06,
    },
    underwater: {
      waterAbsorption: 0.55,
      refractionIOR: 1.1,
      refractionStrength: 0.4,
      reflectionStrength: 0.5,
      normalStrength: 1.2,
    },
  },
  oceanFloor: {
    blendSoftness: 0.3,
    blendThreshold: 0.5,
    depth: 100,
    displacementScale: 140,
    displacementStrength: 8,
    enabled: true,
    lacunarity: 1.8,
    meshResolution: 64,
    normalScale: 0.2,
    persistence: 0.75,
    textureDisplacementStrength: 0.5,
    tileSize: 400,
    caustics: {
      depthAttenuation: 0,
      enabled: true,
      intensity: 0.9,
      scale: 150,
      waveDistortion: 0.26,
    },
    sunShafts: { enabled: true, intensity: 0.2 },
  },
  postProcessing: {
    enabled: false,
    bloom: { enabled: true, strength: 0.1, radius: 0.5, threshold: 1 },
    filmGrain: { enabled: true, intensity: 0.06 },
    vignette: { enabled: true, intensity: 0.3, smoothness: 0.85 },
    underwater: {
      distortionEnabled: true,
      distortionIntensity: 0.015,
      distortionScale: 4,
      distortionSpeed: 1.2,
      enabled: true,
      tintColor: "#ffffff",
    },
    rain: {
      color: "#b3bfcc",
      enabled: false,
      fadeDistance: 40,
      intensity: 0.27,
      opacity: 0.5,
      rippleDecay: 1,
      rippleDensity: 1,
      rippleFadeEnd: 500,
      rippleSize: 2.5,
      rippleStrength: 0.5,
      speed: 5,
      streakLength: 1,
      streakWidth: 0.01,
    },
    underwaterParticles: {
      color: "#ffffff",
      count: 1000,
      enabled: true,
      farDistance: 209,
      maxSize: 0.5,
      minSize: 0.1,
      nearDistance: 9,
      opacity: 0.5,
    },
  },
  sky: {
    source: { type: "hdri", url: "hdris/industrial_sunset_02_puresky_4k.jpg" },
    brightness: 0.3,
    reflectionBlurDistance: 1500,
    reflectionDistanceBlur: 0.5,
    reflectionRoughness: 0.02,
    sun: {
      azimuth: 91,
      diskColor: "#fdc1a0",
      diskEnabled: false,
      diskEmissiveColor: "#fff8e0",
      diskEmissiveIntensity: 5,
      diskRadius: 0.012,
      elevation: 14,
      intensity: 1.5,
    },
  },
  sparkle: {
    enabled: true,
    fadeDistance: 1440,
    intensity: 0.5,
    minDistance: 0,
    power: 2048,
  },
  spray: {
    bottomFadeStart: 0,
    bottomFadeStop: 0.2,
    duration: 2.1,
    enabled: true,
    fadeOutTime: 0.47,
    opacity: 0.15,
    respawnTime: 1,
    size: 49.9,
    spawnJitterTime: 1,
    stretchX: 1.05,
    stretchY: 0.66,
    submersionDepth: 2,
    velocityHeightFactor: 0,
    velocityScaleFactor: 0.15,
    velocityThreshold: 5.1,
  },
  ssr: { enabled: true, strength: 0.71 },
  sss: { enabled: true, intensity: 0.3, power: 1.39 },
  wake: {
    foamBreakThreshold: 0,
    foamPersistence: 0.99,
    foamStrength: 0.8,
    friction: 0.25,
  },
  waves: {
    fft: {
      amplitude: 1,
      frequency: 1,
      animationSpeed: 0.9,
      windSpeed: 50,
      windDirection: 0,
      choppiness: 0,
      spectralSharpness: 1.13,
      standingWaveRatio: 0.52,
      cascades: {
        ripples: { scale: 198, amplitudeScale: 0.12 },
        waves: { scale: 1251, amplitudeScale: 0.34 },
      },
    },
    gerstner: {
      wavelength: 852,
      amplitude: 0.84,
      wavelengthSpread: 3,
      directionalSpread: 0.8,
    },
  },
};
