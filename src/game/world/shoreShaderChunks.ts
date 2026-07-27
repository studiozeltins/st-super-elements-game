/**
 * GLSL snippets shared by the shore shaders — the terrain-sand surf (terrainShader.ts)
 * and the sea (createSeaWater.ts). Injected into each shader's source the same way the
 * terrain patch injects SCORCH_BAND_GLSL, so the foam idiom lives in ONE place.
 */

/** Cheap per-cell hash → [0,1). `basis` picks an independent channel. */
export const HASH2_GLSL = /* glsl */ `
  float hash2(vec2 c, vec2 basis) { return fract(sin(dot(c, basis)) * 43758.5453); }
`;

/**
 * Chunky pixel-art bubble foam mask from a foam `band` (0..1) and a per-cell hash
 * `fh` (0..1): on/off bubble pixels plus occasional brighter bubble cores. Used by
 * both the sea foam and the terrain swash lip so they read as the same bubbles.
 */
export const PIXEL_BUBBLES_GLSL = /* glsl */ `
  float pixelBubbles(float band, float fh) {
    float b = step(0.42, band) * step(fh, 0.38 + band * 0.45);
    b += step(0.7, band) * step(fract(fh * 7.3), 0.27) * 0.6;
    return b;
  }
`;
