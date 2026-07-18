import * as THREE from 'three';
import { PIXEL_SURFACE_COMMON } from './pixelSurfaceShaders';

/**
 * Triplanar Voronoi COBBLESTONE material — the town-ground cobble look wrapped
 * onto any solid (the windmill tower). World-space triplanar so the stones stay a
 * uniform size around a curved wall and don't swim (use only on static meshes).
 * Each Voronoi cell is a domed cobble (bevel normal → real relief under the sun)
 * with a dark mortar seam, weathered per-stone tone, and a little grunge.
 */

function vec3(hex: number): string {
  const c = new THREE.Color(hex);
  return `vec3(${c.r.toFixed(3)}, ${c.g.toFixed(3)}, ${c.b.toFixed(3)})`;
}

let cobbleMaterialSingleton: THREE.MeshLambertMaterial | null = null;

export function cobbleTowerMaterial(): THREE.MeshLambertMaterial {
  if (cobbleMaterialSingleton) return cobbleMaterialSingleton;
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec3 vCobNrm;
        varying vec3 vObjPos;
        varying vec3 vWorldNrm;
        varying vec3 vWorldPos;
        `
      )
      .replace(
        '#include <beginnormal_vertex>',
        /* glsl */ `
        #include <beginnormal_vertex>
        vCobNrm = objectNormal;
        vWorldNrm = normalize(mat3(modelMatrix) * objectNormal);
        `
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        vObjPos = position;
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        `
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec3 vCobNrm;
        varying vec3 vObjPos;
        varying vec3 vWorldNrm;
        ${PIXEL_SURFACE_COMMON}
        // Wrap coords: cylindrical around the tower (one hidden back-seam, no
        // mirroring) on the walls; planar on the flat caps. Object space so it's
        // centred on the mesh and never swims.
        vec2 cobbleUv(vec3 n) {
          vec3 an = abs(normalize(n));
          if (an.y > 0.5) return vObjPos.xz;
          return vec2(atan(vObjPos.z, vObjPos.x) * 1.7, vObjPos.y);
        }
        // Stashed by the cobble pass, reused for the bevel normal (one Voronoi).
        vec2 gCobOut = vec2(0.0);
        float gCobDome = 0.0;
        vec3 cobble(vec2 w) {
          float density = 1.6;
          vec2 p = w * density;
          vec2 ip = floor(p), fp = fract(p);
          float f1 = 8.0, f2 = 8.0; vec2 id = ip; vec2 nearR = vec2(0.0);
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
            vec2 g = vec2(float(x), float(y));
            vec2 r = g + phash2(ip + g) - fp;
            float d = dot(r, r);
            if (d < f1) { f2 = f1; f1 = d; id = ip + g; nearR = r; } else if (d < f2) { f2 = d; }
          }
          f1 = sqrt(f1); f2 = sqrt(f2);
          gCobOut = -normalize(nearR + 1e-4);      // stone centre → fragment
          gCobDome = clamp(f1 * 1.6, 0.0, 1.0);     // 0 centre → 1 edge (domed)
          float border = f2 - f1;
          float tone = phash(id + 3.1);
          vec3 dark = ${vec3(0x5a5f66)}, mid = ${vec3(0x868b92)}, light = ${vec3(0xaeb2b8)};
          vec3 stone = tone < 0.5 ? mix(dark, mid, tone * 2.0) : mix(mid, light, (tone - 0.5) * 2.0);
          stone *= 0.8 + vnoise(w * 6.0 + id * 3.1) * 0.4;   // per-stone grunge
          stone *= 0.72 + smoothstep(0.0, 0.16, border) * 0.3; // baked AO in the seam
          float mortar = 1.0 - smoothstep(0.03, 0.1, border);
          return mix(stone, ${vec3(0x2a2723)}, mortar);
        }
        `
      )
      .replace(
        '#include <normal_fragment_begin>',
        /* glsl */ `
        #include <normal_fragment_begin>
        {
          vec2 uv = cobbleUv(vCobNrm);
          cobble(uv);   // sets gCobOut / gCobDome for this fragment
          vec3 mapN = normalize(vec3(gCobOut * gCobDome * 1.2, 1.0));
          vec3 wn = bevelWorldNormal(mapN, vWorldNrm, uv);
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
        }
        `
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
        #include <color_fragment>
        {
          diffuseColor.rgb = cobble(cobbleUv(vCobNrm));
        }
        `
      );
  };
  material.customProgramCacheKey = () => 'cobbleTower';
  cobbleMaterialSingleton = material;
  return material;
}
