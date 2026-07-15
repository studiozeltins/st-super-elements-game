import * as THREE from 'three';
import type { District, GroundMaterial } from './townPlan';

/**
 * Per-district paved ground — a flat tile whose fragment shader paints the
 * district's surface as pixel-art per world cell (so adjacent same-material
 * tiles align seamlessly): cobble (rounded 3-tone stones + mortar), flagstone
 * (large pale slabs, thin seams), or gravel (fine speckled grit). One
 * MeshLambertMaterial per material, receives shadow + drifts with day/night.
 */

interface GroundSpec {
  cells: number; // cells per world unit (smaller = bigger stones)
  palette: [string, string, string];
  seamWidth: number; // 0 disables mortar seams (gravel)
  seam: string;
}

function vec3(hex: number): string {
  const c = new THREE.Color(hex);
  return `vec3(${c.r.toFixed(3)}, ${c.g.toFixed(3)}, ${c.b.toFixed(3)})`;
}

const SPECS: Record<GroundMaterial, GroundSpec> = {
  cobble: {
    cells: 1.7,
    palette: [vec3(0xccc1ab), vec3(0xb2a892), vec3(0x9c927d)],
    seamWidth: 0.1,
    seam: vec3(0x565046),
  },
  flagstone: {
    cells: 0.62,
    palette: [vec3(0xcfc7b3), vec3(0xc2b9a2), vec3(0xd6cdb8)],
    seamWidth: 0.05,
    seam: vec3(0x8f8674),
  },
  gravel: {
    cells: 4.2,
    palette: [vec3(0x9c9384), vec3(0x8a8272), vec3(0x7c7466)],
    seamWidth: 0.0,
    seam: vec3(0x6a6456),
  },
};

const materialCache = new Map<GroundMaterial, THREE.MeshLambertMaterial>();

function groundMaterial(kind: GroundMaterial): THREE.MeshLambertMaterial {
  const cached = materialCache.get(kind);
  if (cached) return cached;
  const spec = SPECS[kind];
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n varying vec2 vGroundXZ;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n vGroundXZ = (modelMatrix * vec4(position, 1.0)).xz;'
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec2 vGroundXZ;
        float phash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
        `
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
        #include <color_fragment>
        {
          vec2 gp = vGroundXZ * ${spec.cells.toFixed(2)};
          vec2 cell = floor(gp);
          vec2 f = fract(gp);
          float rnd = phash(cell);
          vec3 stone = rnd < 0.34 ? ${spec.palette[0]} : (rnd < 0.67 ? ${spec.palette[1]} : ${spec.palette[2]});
          stone *= 0.92 + phash(cell + 3.1) * 0.16;
          float seamW = ${spec.seamWidth.toFixed(3)};
          if (seamW > 0.0) {
            float edge = min(min(f.x, f.y), min(1.0 - f.x, 1.0 - f.y));
            stone = mix(${spec.seam}, stone, smoothstep(0.0, seamW, edge));
          }
          diffuseColor.rgb = stone;
        }
        `
      );
  };
  material.customProgramCacheKey = () => `ground_${kind}`;
  materialCache.set(kind, material);
  return material;
}

/** Builds one district's flat ground tile, positioned at its center. */
export function createDistrictGround(district: District): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(district.half * 2, district.half * 2);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, groundMaterial(district.ground));
  mesh.position.set(district.cx, 0.02, district.cz);
  mesh.receiveShadow = true;
  return mesh;
}
