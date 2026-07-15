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
        vec3 groundColor(float mat, vec2 w) {
          float cells; vec3 p0, p1, p2; float seamW; vec3 seamC;
          if (mat < 0.5) {          // cobble
            cells = 1.7; seamW = 0.1;
            p0 = ${vec3(0xccc1ab)}; p1 = ${vec3(0xb2a892)}; p2 = ${vec3(0x9c927d)};
            seamC = ${vec3(0x565046)};
          } else if (mat < 1.5) {   // flagstone
            cells = 0.62; seamW = 0.06;
            p0 = ${vec3(0xcfc7b3)}; p1 = ${vec3(0xc2b9a2)}; p2 = ${vec3(0xd6cdb8)};
            seamC = ${vec3(0x8f8674)};
          } else {                  // gravel
            cells = 4.2; seamW = 0.0;
            p0 = ${vec3(0x9c9384)}; p1 = ${vec3(0x8a8272)}; p2 = ${vec3(0x7c7466)};
            seamC = ${vec3(0x6a6456)};
          }
          // Wobble the cell grid so mortar seams are not mechanically straight.
          vec2 gp = w * cells + (vec2(vnoise(w * 1.3), vnoise(w * 1.3 + 9.0)) - 0.5) * 0.35;
          vec2 cell = floor(gp);
          vec2 f = fract(gp);
          float rnd = phash(cell);
          vec3 stone = rnd < 0.34 ? p0 : (rnd < 0.67 ? p1 : p2);
          stone *= 0.92 + phash(cell + 3.1) * 0.16;
          float edge = min(min(f.x, f.y), min(1.0 - f.x, 1.0 - f.y));
          if (seamW > 0.0) {
            stone = mix(seamC, stone, smoothstep(0.0, seamW, edge));
          }
          // Fake rounded-stone HEIGHT (baked, no real normals — survives the pixel
          // filter): crevices between stones darken (AO), stone tops brighten, and a
          // top-left rim light gives each cobble a domed, 3D read.
          float relief = smoothstep(0.0, 0.3, edge);
          stone *= 0.7 + relief * 0.42;
          vec2 cc = f - 0.5;
          float rim = dot(normalize(cc + 1e-4), vec2(-0.7071, -0.7071));
          stone *= 1.0 + rim * (1.0 - relief) * 0.28;
          return stone;
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
