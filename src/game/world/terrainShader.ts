import * as THREE from 'three';
import { SEA_LEVEL } from './terrain';
import { PIXEL_BUBBLES_GLSL } from './shoreShaderChunks';
import type { ScorchMapUniforms } from '../systems/createScorchMap';
import type { GroundInfluenceUniforms } from '../systems/createGroundInfluence';
import type { WindUniforms } from '../systems/createWind';

/**
 * The terrain fragment/vertex shader patch — everything painted per-fragment on the
 * ground plane: pixel-art grass clods, the packed-dirt road with cart ruts, the
 * strike SCORCH craters (+ vertex dents), and the BEACH sand with its animated swash
 * surf and walker footprints. Split out of terrain.ts (which owns height/colour/mesh)
 * so each module stays one job and under the size budget.
 *
 * All detail is sampled per world-space CELL so the ground reads as chunky pixels.
 * Scorch/footprint maps decay on their own clocks, so the ground heals by itself.
 */

const SCORCH_CELLS_PER_UNIT = 3.0;
/** Pixel grass-clod size — chunky world cells so the meadow reads as pixels. */
const GRASS_CELLS_PER_UNIT = 2.2;
/** Pixel-dirt clod size on the road — a touch chunkier than the scorch clods. */
const ROAD_CELLS_PER_UNIT = 2.4;
/** Pixel sand-grain clod size on the beach — finer than the road dirt. */
const SAND_CELLS_PER_UNIT = 3.2;

/** Band k needs scorch > 0.07 + k*0.2 — one SCORCH_PER_STRIKE per band. */
const SCORCH_BAND_GLSL = /* glsl */ `
  float scorchBand(float scorch) {
    return scorch < 0.07 ? -1.0 : min(4.0, floor((scorch - 0.07) * 5.0));
  }
`;

/** Swash clock → the surf run-up/recede curve that drives the beach waterline. */
const SWASH_GLSL = /* glsl */ `
  float swash(float t) {
    return sin(t * 0.5) * 0.6 + sin(t * 0.33 + 1.1) * 0.4; // -1..1
  }
`;

export function patchTerrainShader(
  material: THREE.MeshLambertMaterial,
  scorch: ScorchMapUniforms,
  influence: GroundInfluenceUniforms,
  wind: WindUniforms
) {
  material.onBeforeCompile = shader => {
    shader.uniforms.uScorchMap = scorch.textureUniform;
    shader.uniforms.uScorchBounds = scorch.boundsUniform;
    // Ground-influence WEAR channel (walkers stamp it) — footprints on the sand.
    shader.uniforms.uInfluence = influence.textureUniform;
    shader.uniforms.uInfluenceBounds = influence.boundsUniform;
    // Shared swash clock (the wind seconds clock) — the surf run-up/recede on sand.
    shader.uniforms.uTime = wind.timeUniform;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        uniform sampler2D uScorchMap;
        uniform vec4 uScorchBounds;
        varying vec2 vScorchWorld;
        attribute float aRoad;
        attribute float aRoadCross;
        attribute float aSand;
        varying float vRoad;
        varying float vRoadCross;
        varying float vSand;
        varying float vTerrainHeight;
        ${SCORCH_BAND_GLSL}
        `
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        vec3 transformed = vec3(position);
        // Geometry is baked into world XZ (plane rotated, terrain at origin).
        vScorchWorld = position.xz;
        vRoad = aRoad;
        vRoadCross = aRoadCross;
        vSand = aSand;
        vTerrainHeight = position.y; // the geometry Y IS the terrain height
        vec2 scorchUv = (position.xz - uScorchBounds.xy) * uScorchBounds.zw;
        float dentBand = scorchBand(texture2D(uScorchMap, scorchUv).r);
        transformed.y -= (dentBand + 1.0) * 0.05; // stepped dent, deeper per stack
        `
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        uniform sampler2D uScorchMap;
        uniform vec4 uScorchBounds;
        uniform sampler2D uInfluence;
        uniform vec4 uInfluenceBounds;
        uniform float uTime;
        varying vec2 vScorchWorld;
        varying float vRoad;
        varying float vRoadCross;
        varying float vSand;
        varying float vTerrainHeight;
        ${SWASH_GLSL}
        ${SCORCH_BAND_GLSL}
        float scorchHash(vec2 cell, vec2 basis) {
          return fract(sin(dot(cell, basis)) * 43758.5453);
        }
        ${PIXEL_BUBBLES_GLSL}
        // Smooth value noise + fbm — gives the grass STRUCTURE (soft clumps and
        // bare patches) instead of per-cell random blocks.
        float tNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = scorchHash(i, vec2(127.1, 311.7));
          float b = scorchHash(i + vec2(1.0, 0.0), vec2(127.1, 311.7));
          float c = scorchHash(i + vec2(0.0, 1.0), vec2(127.1, 311.7));
          float d = scorchHash(i + vec2(1.0, 1.0), vec2(127.1, 311.7));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
        float tFbm(vec2 p) {
          return tNoise(p) * 0.6 + tNoise(p * 2.1 + 5.0) * 0.3 + tNoise(p * 4.3 + 9.0) * 0.1;
        }
        `
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
        #include <color_fragment>
        {
          // STRUCTURED pixel-art grass: sample smooth fbm at the pixel-CELL centre,
          // so the ground reads as soft clumps of lush and dry grass with occasional
          // worn bare-dirt patches (a lived-in meadow), still snapped to chunky
          // pixels. Only tints actual grass — grey cliffs/abyss pass through.
          vec2 gp = floor(vScorchWorld * ${GRASS_CELLS_PER_UNIT.toFixed(1)}) / ${GRASS_CELLS_PER_UNIT.toFixed(1)};
          float isGrass = step(diffuseColor.r + 0.015, diffuseColor.g)
            * step(diffuseColor.b, diffuseColor.g);
          float clump = tFbm(gp * 0.14);           // big lush/dry clumps
          float fine = tNoise(gp * 0.75 + 3.0);    // medium break-up
          float tone = clamp(clump * 0.72 + fine * 0.28, 0.0, 1.0);
          vec3 lush = diffuseColor.rgb * vec3(0.84, 1.10, 0.78);
          vec3 dry = diffuseColor.rgb * vec3(1.10, 1.00, 0.74);
          vec3 grass = mix(dry, lush, smoothstep(0.34, 0.72, tone)) * (0.9 + fine * 0.18);
          float bare = tFbm(gp * 0.1 + 17.0);      // worn dirt patches, "a path was trodden"
          grass = mix(grass, vec3(0.44, 0.35, 0.23), smoothstep(0.76, 0.9, bare) * 0.6);
          diffuseColor.rgb = mix(diffuseColor.rgb, grass, isGrass);
        }
        // Pixel-art BEACH SAND: chunky sand-grain clods, DRY (light warm) up the
        // beach vs WET (darker, damp) below the waterline, plus footprint trails —
        // the ground-influence WEAR channel (every walker stamps it) presses the
        // sand into darker damp tracks that heal as the map decays.
        if (vSand > 0.02) {
          vec2 scell = floor(vScorchWorld * ${SAND_CELLS_PER_UNIT.toFixed(1)});
          float sr = scorchHash(scell, vec2(41.3, 289.1));
          vec3 dry = sr < 0.40 ? vec3(0.86, 0.77, 0.55)
            : sr < 0.75 ? vec3(0.80, 0.71, 0.50)
            : vec3(0.90, 0.83, 0.62);
          vec3 wet = sr < 0.5 ? vec3(0.52, 0.44, 0.31) : vec3(0.47, 0.40, 0.28);
          // SWASH: the waterline runs UP the beach and recedes. Three zones so real
          // water is seen to sweep the sand: a thin blue WATER SHEET below the line,
          // a DAMP sheen just above (the wet sand left as it pulls back), dry above.
          // The line is WAVY (tNoise) so it is ragged surf, not a clean contour, and
          // it shares the sea's swash clock so both move as one wave.
          float edgeN = tNoise(vScorchWorld * 0.6 + uTime * 0.12);
          // Run-up ONLY (swash remapped to 0..1, never negative), clamped so the
          // wash NEVER recedes below the sea plane's own edge — that fixed waterline
          // stays hidden under the sheet, so the water never looks stuck. Waves
          // sweep between the sea edge and ~0.7 up the beach.
          float runUp = swash(uTime) * 0.5 + 0.5;
          float wetLine = max(
            ${SEA_LEVEL.toFixed(2)} + 0.02,
            ${SEA_LEVEL.toFixed(2)} + 0.08 + 0.7 * runUp + (edgeN - 0.5) * 0.2
          );
          float damp  = smoothstep(wetLine + 0.5, wetLine - 0.02, vTerrainHeight);
          float sheet = smoothstep(wetLine + 0.06, wetLine - 0.12, vTerrainHeight);
          vec3 sand = mix(dry, wet, damp);
          sand *= 0.90 + scorchHash(scell + 5.0, vec2(11.1, 71.7)) * 0.18;    // per-clod brightness
          if (scorchHash(scell + 2.0, vec2(63.2, 13.9)) < 0.05) sand *= 0.78; // dark grain fleck
          // Thin sea sheet washed up — matched to the sea's SHALLOW teal, brightened
          // to survive the terrain's diffuse lighting so it reads as the SAME water.
          sand = mix(sand, vec3(0.40, 0.82, 0.82), sheet * 0.78);
          // PIXEL-ART BUBBLE FOAM on the swash lip — shared with the sea foam.
          float lipBand = smoothstep(0.16, 0.0, abs(vTerrainHeight - wetLine));
          float bubbles = pixelBubbles(lipBand, scorchHash(scell + 9.0, vec2(19.1, 47.3)));
          sand += clamp(lipBand * 0.22 + bubbles * 0.5, 0.0, 0.72);
          // FOOTPRINTS: the ground-influence WEAR channel darkens the sand into
          // pressed damp tracks (self-healing as the map decays).
          vec2 infUv = (vScorchWorld - uInfluenceBounds.xy) * uInfluenceBounds.zw;
          float wear = texture2D(uInfluence, infUv).a;
          sand = mix(sand, sand * vec3(0.60, 0.56, 0.50), clamp(wear * 1.4, 0.0, 0.8));
          diffuseColor.rgb = mix(diffuseColor.rgb, sand, vSand);
        }
        // Pixel-art PACKED-DIRT ROAD: per world-space cell, pick one of a few brown
        // clod shades + speckle so the path reads as chunky pixel dirt (matching the
        // scorch clods), not the smooth per-vertex gradient. Applied FIRST so scorch
        // craters below still win on top of it.
        if (vRoad > 0.02) {
          vec2 rcell = floor(vScorchWorld * ${ROAD_CELLS_PER_UNIT.toFixed(1)});
          float rh = scorchHash(rcell, vec2(53.7, 21.3));
          vec3 rd = rh < 0.38 ? vec3(0.63, 0.49, 0.31)
            : rh < 0.72 ? vec3(0.55, 0.42, 0.26)
            : vec3(0.46, 0.34, 0.20);
          rd *= 0.86 + scorchHash(rcell, vec2(11.2, 91.5)) * 0.28;   // per-clod brightness
          if (scorchHash(rcell + 3.0, vec2(7.1, 88.2)) < 0.13) rd *= 0.68; // dark gravel specks
          // CART-WHEEL RUTS: two grooves at ±gauge across the road (from the signed
          // cross-road coord). Dark packed-earth trough with a lit lip = fake depth,
          // and a faint worn centre strip where the cart belly dragged.
          float ar = abs(vRoadCross);
          float rutDist = abs(ar - 0.85);                          // 0 at a rut centreline
          float trough = 1.0 - smoothstep(0.0, 0.24, rutDist);     // inside the groove
          float lip = smoothstep(0.24, 0.32, rutDist) * (1.0 - smoothstep(0.32, 0.46, rutDist));
          rd *= 1.0 - trough * 0.4;                                // darker packed trough
          rd += lip * 0.05;                                        // sunlit lip on the ridge
          rd *= 1.0 - (1.0 - smoothstep(0.0, 0.5, ar)) * 0.12;     // worn centre drag strip
          diffuseColor.rgb = mix(diffuseColor.rgb, rd, vRoad);
        }
        {
          // One sample per world-space cell = square pixel-art dirt clods.
          vec2 cell = floor(vScorchWorld * ${SCORCH_CELLS_PER_UNIT.toFixed(1)});
          vec2 cellUv = ((cell + 0.5) / ${SCORCH_CELLS_PER_UNIT.toFixed(1)}
            - uScorchBounds.xy) * uScorchBounds.zw;
          float scorch = texture2D(uScorchMap, cellUv).r
            + (scorchHash(cell, vec2(127.1, 311.7)) - 0.5) * 0.13;
          float band = scorchBand(scorch);
          if (band >= 0.0) {
            vec3 shade = band < 0.5 ? vec3(0.52, 0.40, 0.24)
              : band < 1.5 ? vec3(0.44, 0.32, 0.18)
              : band < 2.5 ? vec3(0.35, 0.25, 0.14)
              : band < 3.5 ? vec3(0.27, 0.18, 0.10)
              : vec3(0.19, 0.12, 0.07);
            // Per-cell brightness speckle: dirt texture, still flat per pixel.
            diffuseColor.rgb = shade * (0.9 + scorchHash(cell, vec2(269.5, 183.3)) * 0.2);
          }
        }
        `
      );
  };
  material.customProgramCacheKey = () => 'terrainScorch';
}
