import * as THREE from 'three';
import { sunDirUniform } from '../../systems/sunUniform';
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
    shader.uniforms.uSunDir = sunDirUniform; // by reference — game loop updates it
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
        uniform vec3 uSunDir;
        float phash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
        vec2 hash2(vec2 p) {
          return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.545);
        }
        float vnoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          float a = phash(i), b = phash(i + vec2(1.0, 0.0));
          float c = phash(i + vec2(0.0, 1.0)), d = phash(i + vec2(1.0, 1.0));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }
        // Per-fragment stone data stashed by cobble() so groundNormal() reuses it
        // (one Voronoi; color_fragment runs before normals). gStoneOutward points
        // from the stone center toward this fragment; gStoneDome is 0 at center → 1
        // at the edge — together they slope each cobble into a rounded dome so its
        // seams catch light and read as depth under the sun AND the lanterns.
        vec2 gStoneId = vec2(0.0);
        vec2 gStoneOutward = vec2(0.0);
        float gStoneDome = 0.0;
        // Sun-facing edge line, applied POST-lighting (so it shows day AND night,
        // like the silhouette outline — a pre-light brighten would vanish at night).
        float gCobEdge = 0.0;
        vec3 gCobEdgeCol = vec3(0.0);
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
          // Uniform cobble size everywhere; edginess only weights the seam grass.
          float maxc = max(abs(w.x), abs(w.y));
          float edginess = smoothstep(${(townHalf * 0.4).toFixed(1)}, ${townHalf.toFixed(1)}, maxc);
          float density = 1.35;
          vec2 p = w * density;
          vec2 ip = floor(p), fp = fract(p);
          float f1 = 8.0, f2 = 8.0; vec2 id = ip; vec2 nearR = vec2(0.0);
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
            vec2 g = vec2(float(x), float(y));
            vec2 r = g + hash2(ip + g) - fp;
            float d = dot(r, r);
            if (d < f1) { f2 = f1; f1 = d; id = ip + g; nearR = r; } else if (d < f2) { f2 = d; }
          }
          f1 = sqrt(f1); f2 = sqrt(f2);
          gStoneId = id;                                // reused by groundNormal()
          // nearR points fragment→center; outward = center→fragment. Dome slopes
          // the stone from a flat top down to its edges so seams read as recesses.
          gStoneOutward = -normalize(nearR + 1e-4);
          gStoneDome = clamp(f1 * 1.5, 0.0, 1.0);
          float border = f2 - f1;                       // ~0 at the mortar seam
          // Flat per-stone tone, wide dark→light spread (old, weathered stones).
          float tone = phash(id + 3.1);
          vec3 dark = ${vec3(0x484a4c)}, mid = ${vec3(0x7c7d7e)}, light = ${vec3(0xacadae)};
          vec3 stone = tone < 0.5 ? mix(dark, mid, tone * 2.0) : mix(mid, light, (tone - 0.5) * 2.0);
          // Rocky SURFACE texture: multi-scale value-noise mottling + fine grit,
          // offset per stone so neighbours don't share a pattern. This is what
          // makes each cobble read as weathered stone instead of a flat polygon.
          vec2 tw = w + id * 3.17;
          float surf = vnoise(tw * 5.5) * 0.55 + vnoise(tw * 13.0) * 0.3 + vnoise(tw * 31.0) * 0.15;
          stone *= 0.66 + surf * 0.66;
          // Dark mineral pits/stains speckled across the surface.
          if (vnoise(tw * 22.0) < 0.24) stone *= 0.82;
          // Some stones mossy/stained overall.
          if (phash(id + 5.0) < 0.14) stone = mix(stone, ${vec3(0x6d7a46)}, 0.4);
          // Baked AO into the seams (dome normal carries the rest of the depth).
          stone *= 0.72 + smoothstep(0.0, 0.16, border) * 0.3;
          // DISTINCT dark mortar border — wider defined gap between stones.
          float mortar = 1.0 - smoothstep(0.03, 0.09, border);
          vec3 col = mix(stone, ${vec3(0x22201d)}, mortar);
          // A few cobbles worn away to packed dirt.
          if (phash(id + 11.0) < 0.05) col = ${vec3(0x453626)} * (0.85 + phash(id + 2.0) * 0.3);
          // Grass in the SEAMS, concentrated in the outer city (per-stone random,
          // never a uniform line): mossy green filling some cracks, more at the edge.
          float crack = 1.0 - smoothstep(0.0, 0.1, border);
          if (crack > 0.0 && phash(id + 13.0) < 0.12 + edginess * 0.55) {
            col = mix(col, ${vec3(0x40692b)}, crack * (0.5 + edginess * 0.45));
          }
          // Sun-facing EDGE LINE per stone: near the seam, on the side of the stone
          // that faces the sun. Stashed for the post-lighting pass below.
          float nearEdge = 1.0 - smoothstep(0.0, 0.3, border);
          float sunAlign = max(0.0, dot(gStoneOutward, normalize(uSunDir.xz + vec2(1e-4))));
          gCobEdge = nearEdge * sunAlign;                       // scaled by lit luminance post-light
          gCobEdgeCol = mix(col, vec3(0.7, 0.71, 0.74), 0.6);  // lightened grey, not white
          return col;
        }
        // Per-stone SLANT + ruggedness as a real world-space normal, so the sun
        // lights each cobble at its own angle (3D relief, not flat baked shading).
        // Each Voronoi stone gets a random tilt; fine noise adds surface roughness.
        vec3 groundNormal(vec2 w) {
          vec2 id = gStoneId;                            // set by cobble() this fragment
          vec2 slant = (hash2(id + 7.7) - 0.5) * 0.5;    // per-stone random tilt
          vec2 rug = (vec2(phash(floor(w * 11.0) + 1.0), phash(floor(w * 11.0) + 8.0)) - 0.5) * 0.35;
          vec2 dome = gStoneOutward * gStoneDome * 1.1;  // rounded stone; distinct edges
          return normalize(vec3(slant.x + rug.x + dome.x, 1.0, slant.y + rug.y + dome.y));
        }
        `
      )
      .replace(
        '#include <normal_fragment_begin>',
        /* glsl */ `
        #include <normal_fragment_begin>
        normal = normalize((viewMatrix * vec4(groundNormal(vTownXZ), 0.0)).xyz);
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
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `
        #include <opaque_fragment>
        // Sun edge line, post-light — scaled by the surface's own lit luminance so it
        // reads by day but fades to a faint catch under blue moonlight (not a bright rim).
        float cobEdgeLum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
        gl_FragColor.rgb = mix(gl_FragColor.rgb, gCobEdgeCol, gCobEdge * cobEdgeLum * 0.7);
        `
      );
  };
  material.customProgramCacheKey = () => 'townGroundVoronoi';

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = 0.02;
  mesh.receiveShadow = true;
  return mesh;
}
