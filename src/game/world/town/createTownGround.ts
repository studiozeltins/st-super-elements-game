import * as THREE from 'three';
import { DISTRICT_HALF, type District, type GroundMaterial } from './townPlan';

/**
 * The whole town's paved ground as ONE mesh + shader, so district materials
 * INTERLOCK along a noise-jittered boundary instead of meeting at a straight
 * tile seam. For each world cell the shader decides which district owns it using
 * grid coordinates perturbed by value noise — so cobble fingers into flagstone
 * and back — then paints that material's pixel pattern (also slightly wobbled so
 * seams within a material aren't mechanically straight). Outside the town it
 * discards, leaving a ragged paved/grass edge. Receives shadow + day/night.
 */

const STEP = DISTRICT_HALF * 2;
const MATERIAL_ID: Record<GroundMaterial, number> = { cobble: 0, flagstone: 1, gravel: 2 };

function vec3(hex: number): string {
  const c = new THREE.Color(hex);
  return `vec3(${c.r.toFixed(3)}, ${c.g.toFixed(3)}, ${c.b.toFixed(3)})`;
}

/** Emits the GLSL `materialId(vec2 g)` branch chain from the district grid. */
function materialIdGlsl(districts: District[]): string {
  const branches = districts
    .map(d => {
      const gx = Math.round(d.cx / STEP);
      const gz = Math.round(d.cz / STEP);
      return `if (g.x == ${gx.toFixed(1)} && g.y == ${gz.toFixed(1)}) return ${MATERIAL_ID[d.ground].toFixed(1)};`;
    })
    .join('\n          ');
  return /* glsl */ `
    float materialId(vec2 g) {
      ${branches}
      return -1.0;
    }
  `;
}

export function createTownGround(districts: District[]): THREE.Mesh {
  // Cover the full grid plus a margin for the jittered ragged edge.
  let maxCell = 1;
  for (const d of districts) {
    maxCell = Math.max(maxCell, Math.abs(Math.round(d.cx / STEP)), Math.abs(Math.round(d.cz / STEP)));
  }
  const side = (maxCell * 2 + 1) * STEP + 6;
  const geometry = new THREE.PlaneGeometry(side, side);
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n varying vec2 vTownXZ;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n vTownXZ = (modelMatrix * vec4(position, 1.0)).xz;'
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec2 vTownXZ;
        float phash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
        float vnoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          float a = phash(i), b = phash(i + vec2(1.0, 0.0));
          float c = phash(i + vec2(0.0, 1.0)), d = phash(i + vec2(1.0, 1.0));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }
        ${materialIdGlsl(districts)}
        // PIXEL-ART cobble: flat per-stone tone (no smooth gradient), hard 1-px
        // seam + hard-step edge relief, and grunge — a wide tone spread, mossy
        // stones, occasional MISSING cobble worn to dirt, and grass sprouting only
        // in some seams. Deliberately NOT coordinate-wobbled (that read as liquid).
        vec3 cobble(vec2 w) {
          float cells = 1.7;
          vec2 gp = w * cells;
          vec2 cell = floor(gp);
          vec2 f = fract(gp);
          float rnd = phash(cell + 3.1);
          vec3 dark = ${vec3(0x585044)};
          vec3 mid = ${vec3(0x8f8674)};
          vec3 light = ${vec3(0xc3b89f)};
          vec3 stone = rnd < 0.5 ? mix(dark, mid, rnd * 2.0) : mix(mid, light, (rnd - 0.5) * 2.0);
          stone *= 0.86 + phash(cell + 7.0) * 0.26;               // brightness grunge
          if (phash(cell + 5.0) < 0.13) stone = mix(stone, ${vec3(0x6f7a4a)}, 0.4); // mossy stone
          // Hard-step relief: a bright top/left inner rim, dark bottom/right rim.
          if (min(f.x, f.y) < 0.14) stone *= 1.1;
          if (min(1.0 - f.x, 1.0 - f.y) < 0.14) stone *= 0.86;
          // Hard 1-px mortar seam.
          float seam = min(min(f.x, f.y), min(1.0 - f.x, 1.0 - f.y));
          float mortar = step(seam, 0.09);
          vec3 col = mix(stone, ${vec3(0x30291f)}, mortar);
          // Grunge: a few cobbles are worn away to packed dirt.
          if (phash(cell + 11.0) < 0.06) col = ${vec3(0x453626)} * (0.85 + phash(cell + 2.0) * 0.3);
          // Grass sprouts in SOME seams only.
          if (mortar > 0.5 && phash(cell + 13.0) < 0.22) col = mix(col, ${vec3(0x3f6a2a)}, 0.6);
          return col;
        }
        vec3 slab(vec2 w, float cells, vec3 a, vec3 b, vec3 seamC) {
          vec2 gp = w * cells;
          vec2 f = fract(gp);
          vec3 s = mix(a, b, phash(floor(gp)));
          float e = min(min(f.x, f.y), min(1.0 - f.x, 1.0 - f.y));
          return mix(seamC, s, step(0.05, e));
        }
        vec3 groundColor(float mat, vec2 w) {
          if (mat < 0.5) return cobble(w);
          if (mat < 1.5) return slab(w, 0.62, ${vec3(0xcfc7b3)}, ${vec3(0xc2b9a2)}, ${vec3(0x8f8674)});
          return slab(w, 4.2, ${vec3(0x9c9384)}, ${vec3(0x7c7466)}, ${vec3(0x6a6456)});
        }
        `
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
        #include <color_fragment>
        {
          vec2 w = vTownXZ;
          // Jitter the district grid lookup → interlocking, non-straight material seams.
          vec2 j = (vec2(vnoise(w * 0.32), vnoise(w * 0.32 + 21.7)) - 0.5) * 5.0;
          vec2 gj = (w + j) / ${STEP.toFixed(1)};
          vec2 g = vec2(floor(gj.x + 0.5), floor(gj.y + 0.5));
          float mat = materialId(g);
          if (mat < 0.0) discard;   // outside the town → ragged grass edge
          diffuseColor.rgb = groundColor(mat, w);
        }
        `
      );
  };
  material.customProgramCacheKey = () => 'townGround';

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = 0.02;
  mesh.receiveShadow = true;
  return mesh;
}
