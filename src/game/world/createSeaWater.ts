import * as THREE from 'three';
import { WORLD_BOUND } from '../data/constants';
import { SEA_LEVEL, ISLANDS } from './terrain';
import { HASH2_GLSL, PIXEL_BUBBLES_GLSL } from './shoreShaderChunks';
import type { WindUniforms } from '../systems/createWind';

/**
 * The open sea surrounding the archipelago. One large translucent quad at
 * SEA_LEVEL that fills every gap between and around the islands (the terrain
 * plunges to the void beyond each island radius, and the water hides that abyss).
 *
 * Look (stylized top-down): a DEPTH gradient — teal shallows hugging each shore
 * fading to deep navy offshore — plus animated caustics from a tiling noise
 * texture, SWASH foam that runs up the shore and recedes (shares the beach's swash
 * clock so the sand's waterline and the sea's foam move as ONE wave), a sun/MOON
 * specular glint that tracks the day/night light, night DARKENING by sky luminance,
 * and foam washing around any rocks standing in the water (setRocks).
 *
 * Perf: one quad. Detail is cheap analytic sines + two texture reads; the island
 * and rock loops are gated to near-shore fragments.
 */
export interface SeaWater {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  /** Feed rock circles standing in the water so the surf washes around them. */
  setRocks(rocks: { x: number; z: number; radius: number }[]): void;
  dispose(): void;
}

// Reach well past the fog far plane so the sea meets the fogged horizon with no
// visible edge, whichever way the player looks.
const SEA_EXTENT = (WORLD_BOUND + 40) * 6;
// GLSL fixed array bounds.
const MAX_ISLANDS = 8;
const MAX_ROCKS = 16;

/**
 * A small SEAMLESSLY TILING fbm noise texture, generated once on the CPU. Cell
 * counts (4/8/16/32) all divide the texture size, so each octave wraps exactly.
 */
function makeWaterNoiseTexture(): THREE.DataTexture {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  const hash = (ix: number, iy: number, seed: number): number => {
    let h = (ix * 374761393 + iy * 668265263 + seed * 2246822519) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = (h * 1274126177) >>> 0;
    return (h & 0xffff) / 0xffff;
  };
  const smooth = (x: number): number => x * x * (3 - 2 * x);
  const noise = (u: number, v: number, cells: number, seed: number): number => {
    const fx = u * cells;
    const fy = v * cells;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = smooth(fx - x0);
    const ty = smooth(fy - y0);
    const x0w = ((x0 % cells) + cells) % cells;
    const y0w = ((y0 % cells) + cells) % cells;
    const x1w = (x0w + 1) % cells;
    const y1w = (y0w + 1) % cells;
    const a = hash(x0w, y0w, seed) + (hash(x1w, y0w, seed) - hash(x0w, y0w, seed)) * tx;
    const b = hash(x0w, y1w, seed) + (hash(x1w, y1w, seed) - hash(x0w, y1w, seed)) * tx;
    return a + (b - a) * ty;
  };
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const u = px / size;
      const v = py / size;
      const f =
        noise(u, v, 4, 1) * 0.5 +
        noise(u, v, 8, 2) * 0.3 +
        noise(u, v, 16, 3) * 0.15 +
        noise(u, v, 32, 4) * 0.05;
      const i = (py * size + px) * 4;
      const c = Math.max(0, Math.min(255, Math.round(f * 255)));
      data[i] = c;
      data[i + 1] = c;
      data[i + 2] = c;
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

const VERT = /* glsl */ `
  varying vec3 vWorldPos;
  void main() {
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uSkyTop;
  uniform vec3 uHorizon;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform float uTime;
  uniform sampler2D uNoise;
  uniform vec2 uIslandCenter[${MAX_ISLANDS}];
  uniform float uIslandRadius[${MAX_ISLANDS}];
  uniform int uIslandCount;
  uniform vec2 uRockCenter[${MAX_ROCKS}];
  uniform float uRockRadius[${MAX_ROCKS}];
  uniform int uRockCount;
  varying vec3 vWorldPos;

  const vec3 SHALLOW = vec3(0.34, 0.74, 0.76);
  const vec3 MID     = vec3(0.10, 0.45, 0.70);
  const vec3 DEEP    = vec3(0.03, 0.16, 0.40);
  ${HASH2_GLSL}
  ${PIXEL_BUBBLES_GLSL}

  void main() {
    float t = uTime;
    vec2 p = vWorldPos.xz;

    // Distance from this sea point OUT to the nearest island coast (>0 = open sea).
    float gap = 1e9;
    for (int i = 0; i < ${MAX_ISLANDS}; i++) {
      if (i >= uIslandCount) break;
      gap = min(gap, distance(p, uIslandCenter[i]) - uIslandRadius[i]);
    }
    gap = max(gap, 0.0);

    // Animated surface noise FIRST — drives the flowing gradient AND the caustics.
    float n1 = texture2D(uNoise, p * 0.025 + vec2(t * 0.012, t * 0.016)).r;
    float n2 = texture2D(uNoise, p * 0.041 - vec2(t * 0.020, t * 0.010)).r;
    // DEPTH gradient with the shore distance DOMAIN-WARPED by the scrolling noise:
    // the depth flows and ripples instead of sitting as fixed concentric bands.
    float warp = (n1 - 0.5) * 7.0 + (n2 - 0.5) * 4.0;
    float shallow = 1.0 - smoothstep(0.0, 20.0, gap + warp);
    vec3 col = mix(DEEP, MID, smoothstep(0.0, 0.62, shallow));
    col = mix(col, SHALLOW, smoothstep(0.45, 1.0, shallow));
    col *= 1.0 - (n1 - 0.5) * 0.14;                        // mottled depth patches
    float caustic = smoothstep(1.2, 1.5, n1 + n2);         // thin bright net
    col += caustic * (0.12 + 0.4 * shallow);

    // Wave normal (cheap 2-sine) for the specular glint.
    vec3 nrm = normalize(vec3(
      -0.6 * cos(p.x * 0.6 + t * 0.9) * 0.12,
      1.0,
      -0.5 * cos(p.y * 0.5 - t * 0.7) * 0.12
    ));
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fres = pow(1.0 - max(viewDir.y, 0.0), 3.0);
    col = mix(col, mix(uHorizon, uSkyTop, 0.5), fres * 0.2);

    // Day/night level from sky luminance — NIGHT darkens the water (and dims foam).
    float lum = dot(uSkyTop, vec3(0.299, 0.587, 0.114));
    float dayBright = smoothstep(0.05, 0.5, lum);
    col *= 0.32 + 0.68 * dayBright;

    // SUN / MOON glint: a shimmering specular streak toward the light (uSunDir is
    // flipped to the moon at night in the day/night wiring), broken into glitter.
    vec3 halfway = normalize(normalize(uSunDir) + viewDir);
    float spec = pow(max(dot(nrm, halfway), 0.0), 48.0) * (0.5 + 0.9 * n1);
    col += uSunColor * spec * 1.3;

    // NO sea-side shoreline foam band: it read as a STUCK white line and its
    // ripples ran INVERSE to the sand's wash. The beach's terrain wash owns the
    // shore surf now; the sea only foams around rocks standing in the water.
    float foam = 0.0;
    if (gap < 12.0) {
      for (int i = 0; i < ${MAX_ROCKS}; i++) {
        if (i >= uRockCount) break;
        float rd = distance(p, uRockCenter[i]);
        float ring = 1.0 - smoothstep(0.0, uRockRadius[i] * 0.7, abs(rd - uRockRadius[i]));
        ring *= 0.5 + 0.5 * sin(rd * 3.0 - t * 3.0);   // ripples washing outward
        foam = max(foam, clamp(ring, 0.0, 1.0));
      }
    }
    // PIXEL-ART BUBBLE FOAM (shared with the terrain swash lip) — chunky pixel
    // bubbles per world cell, not a smooth white smear.
    float fh = hash2(floor(p * 3.5), vec2(41.3, 289.1));
    float foamPix = clamp(foam * 0.35 + pixelBubbles(foam, fh), 0.0, 1.0);
    vec3 foamCol = mix(vec3(0.66, 0.75, 0.92), vec3(0.95, 0.98, 1.0), dayBright);
    col = mix(col, foamCol, foamPix * (0.3 + 0.4 * dayBright));

    // Melt the far sea into the horizon sky so the finite plane has no hard edge.
    float dist = length(p - cameraPosition.xz);
    float horizonFade = smoothstep(120.0, 320.0, dist);
    col = mix(col, uHorizon, horizonFade);

    // Feather the shallow edge: the sea goes transparent right at the shoreline and
    // fades in over a few units, so it DISSOLVES into the wet-sand shelf instead of
    // cutting the hard 'strange line' where the plane meets the beach (and it hides
    // the plane/terrain z-fight there).
    float alpha = mix(0.92, 0.30, shallow) * smoothstep(0.0, 3.5, gap + warp * 0.5);
    gl_FragColor = vec4(col, mix(alpha, 0.72, horizonFade));
  }
`;

export function createSeaWater(wind: WindUniforms): SeaWater {
  // Pad the island arrays to the fixed GLSL bound (unused slots gated by uIslandCount).
  const centers: THREE.Vector2[] = [];
  const radii: number[] = [];
  for (let i = 0; i < MAX_ISLANDS; i += 1) {
    const island = ISLANDS[i];
    centers.push(new THREE.Vector2(island?.centerX ?? 0, island?.centerZ ?? 0));
    radii.push(island?.radius ?? 0);
  }
  const rockCenters: THREE.Vector2[] = [];
  const rockRadii: number[] = [];
  for (let i = 0; i < MAX_ROCKS; i += 1) {
    rockCenters.push(new THREE.Vector2(0, 0));
    rockRadii.push(0);
  }

  const noiseTexture = makeWaterNoiseTexture();
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSkyTop: { value: new THREE.Color(0x3f86d6) },
      uHorizon: { value: new THREE.Color(0x9fd3ee) },
      uSunColor: { value: new THREE.Color(0xfff2d8) },
      uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3) },
      // Shared seconds clock with the terrain swash — read by reference, never cached.
      uTime: wind.timeUniform,
      uNoise: { value: noiseTexture },
      uIslandCenter: { value: centers },
      uIslandRadius: { value: radii },
      uIslandCount: { value: Math.min(ISLANDS.length, MAX_ISLANDS) },
      uRockCenter: { value: rockCenters },
      uRockRadius: { value: rockRadii },
      uRockCount: { value: 0 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(SEA_EXTENT, SEA_EXTENT), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = SEA_LEVEL;
  // Sea is a background surface — it must not throw or catch shadows.
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  return {
    mesh,
    material,
    setRocks(rocks) {
      const count = Math.min(rocks.length, MAX_ROCKS);
      for (let i = 0; i < count; i += 1) {
        rockCenters[i].set(rocks[i].x, rocks[i].z);
        rockRadii[i] = rocks[i].radius;
      }
      material.uniforms.uRockCount.value = count;
    },
    dispose() {
      noiseTexture.dispose();
      material.dispose();
      mesh.geometry.dispose();
    },
  };
}
