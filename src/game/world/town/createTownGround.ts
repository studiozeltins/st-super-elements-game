import * as THREE from 'three';
import { DISTRICT_HALF, type District } from './townPlan';

/**
 * The town's paved ground as ONE mesh + shader. Cobbles are VORONOI cells (not a
 * square grid) so the stones are irregular, varied-size old-city cobbles with
 * natural mortar gaps. Each stone gets a flat pixel tone, crevice-depth shading,
 * a fine pixel-noise grunge texture, occasional worn-to-dirt gaps, moss, and
 * grass sprouting in the cracks. Toward the town edge whole cobbles are randomly
 * discarded so the pavement SCATTERS into the grass instead of ending on a hard
 * line. Receives shadow + drifts with day/night.
 */

const STEP = DISTRICT_HALF * 2;

function townHalfExtent(districts: District[]): number {
  let maxCell = 1;
  for (const d of districts) {
    maxCell = Math.max(maxCell, Math.abs(Math.round(d.cx / STEP)), Math.abs(Math.round(d.cz / STEP)));
  }
  return maxCell * STEP + DISTRICT_HALF;
}

function vec3(hex: number): string {
  const c = new THREE.Color(hex);
  return `vec3(${c.r.toFixed(3)}, ${c.g.toFixed(3)}, ${c.b.toFixed(3)})`;
}

export function createTownGround(districts: District[]): THREE.Mesh {
  const townHalf = townHalfExtent(districts);
  const transInner = townHalf - 4.5; // where the scatter/grass transition begins
  const side = townHalf * 2 + 8;
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
        vec2 hash2(vec2 p) {
          return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.545);
        }
        // Coarse cobble-cell id at a world point — used to discard whole stones.
        vec2 cobbleId(vec2 w) {
          float density = 1.35;
          vec2 p = w * density;
          vec2 ip = floor(p), fp = fract(p);
          float f1 = 8.0; vec2 id = ip;
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
            vec2 g = vec2(float(x), float(y));
            vec2 r = g + hash2(ip + g) - fp;
            float d = dot(r, r);
            if (d < f1) { f1 = d; id = ip + g; }
          }
          return id;
        }
        vec3 cobble(vec2 w) {
          float density = 1.35;
          vec2 p = w * density;
          vec2 ip = floor(p), fp = fract(p);
          float f1 = 8.0, f2 = 8.0; vec2 id = ip;
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
            vec2 g = vec2(float(x), float(y));
            vec2 r = g + hash2(ip + g) - fp;
            float d = dot(r, r);
            if (d < f1) { f2 = f1; f1 = d; id = ip + g; } else if (d < f2) { f2 = d; }
          }
          f1 = sqrt(f1); f2 = sqrt(f2);
          float border = f2 - f1;                       // ~0 at the mortar seam
          // Flat per-stone tone, wide dark→light spread (old, weathered stones).
          float tone = phash(id + 3.1);
          vec3 dark = ${vec3(0x4f473b)}, mid = ${vec3(0x877c69)}, light = ${vec3(0xbfb39a)};
          vec3 stone = tone < 0.5 ? mix(dark, mid, tone * 2.0) : mix(mid, light, (tone - 0.5) * 2.0);
          // Fine pixel-noise grunge texture across each stone.
          vec2 px = floor(w * 7.0);
          stone *= 0.85 + phash(px + id.x * 1.7) * 0.3;
          // Some stones mossy/stained.
          if (phash(id + 5.0) < 0.14) stone = mix(stone, ${vec3(0x6d7a46)}, 0.4);
          // Crevice DEPTH: stones darken into the mortar gaps (baked AO relief).
          stone *= 0.62 + smoothstep(0.0, 0.14, border) * 0.5;
          // Hard-ish mortar seam.
          float mortar = 1.0 - smoothstep(0.02, 0.07, border);
          vec3 col = mix(stone, ${vec3(0x2c261d)}, mortar * 0.9);
          // A few cobbles worn away to packed dirt.
          if (phash(id + 11.0) < 0.05) col = ${vec3(0x453626)} * (0.85 + phash(id + 2.0) * 0.3);
          // Grass tufts in the cracks (many seams, clearly visible).
          if (border < 0.11 && phash(id + 13.0) < 0.45) {
            col = mix(col, ${vec3(0x3d6a28)}, (1.0 - smoothstep(0.0, 0.11, border)) * 0.85);
          }
          return col;
        }
        `
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
        #include <color_fragment>
        {
          vec2 w = vTownXZ;
          float maxc = max(abs(w.x), abs(w.y));
          if (maxc > ${townHalf.toFixed(1)}) discard;             // outside the town
          // Scatter whole cobbles into the grass over the last few units so the
          // pavement fades in, not on a hard line. Only the transition band pays
          // for the extra cobble-id lookup; the solid interior skips it.
          if (maxc > ${transInner.toFixed(1)}) {
            float keep = smoothstep(${townHalf.toFixed(1)}, ${transInner.toFixed(1)}, maxc);
            if (phash(cobbleId(w)) > keep + 0.02) discard;
          }
          diffuseColor.rgb = cobble(w);
        }
        `
      );
  };
  material.customProgramCacheKey = () => 'townGroundVoronoi';

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = 0.02;
  mesh.receiveShadow = true;
  return mesh;
}
