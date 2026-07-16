import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { SeededRandom } from './types';
import { PIXEL_SURFACE_COMMON } from '../town/pixelSurfaceShaders';

/**
 * Irregular rock meshes — the replacement for the old cubic voxel boulders /
 * spires. Two shape functions so the look can be A/B'd in-world:
 *
 *   facetedRock — displaced icosahedron with FLAT facets (angular chiseled rock,
 *                 matches the low-poly trees/bushes). Default.
 *   smoothRock  — subdivided + welded so normals are SMOOTH (rounded weathered
 *                 river-boulder). Swap in with ?rock=smooth.
 *
 * Both share ONE rock material: a pixel-art stone mottle plus a NOISE depth map
 * that perturbs the normal into irregular crags (no regular grid). Displacement
 * is a pure function of vertex position, so it stays watertight on the
 * non-indexed icosahedron (duplicated corner verts move identically).
 *
 * Each builder returns the mesh plus its post-displacement bounds so the caller
 * can place collision (stand-on platform top + solid footprint radius).
 */

const SLATE = [0x3d4654, 0x5a6678, 0x8a94a4] as const;

export interface RockBuild {
  mesh: THREE.Mesh;
  /** Highest point (local space) — where a player standing on the rock rests. */
  topY: number;
  /** Largest horizontal half-extent — the collision footprint radius. */
  radiusXZ: number;
}

export type RockStyle = 'faceted' | 'smooth';

/** ?rock=smooth flips every rock to the smooth builder for side-by-side compare. */
export function rockStyle(): RockStyle {
  return /rock=smooth/.test(window.location.search) ? 'smooth' : 'faceted';
}

function hash3(x: number, y: number, z: number): number {
  return (Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453) % 1;
}

/** Per-rock seed offset so no two rocks share a silhouette. */
function seedOffset(random: SeededRandom): THREE.Vector3 {
  return new THREE.Vector3(random() * 100, random() * 100, random() * 100);
}

// Rock materials, cached by bump strength. Object-space triplanar so the texture
// sticks as the rock rotates; a multi-octave value-noise field drives BOTH the
// tone mottle and a sampled-gradient normal bump (the irregular "depth map").
// `bumpZ` is the tangent-normal Z: HIGHER = flatter bump (crisp facets survive),
// lower = deeper crags. Faceted rock wants a high value so its flat facets read.
const rockMaterialCache = new Map<number, THREE.MeshLambertMaterial>();
function rockMaterial(bumpZ: number): THREE.MeshLambertMaterial {
  const cached = rockMaterialCache.get(bumpZ);
  if (cached) return cached;
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec3 vObjPos;
        varying vec3 vObjNrm;
        varying vec3 vWorldNrm;
        varying vec3 vWorldPos;
        `
      )
      .replace(
        '#include <beginnormal_vertex>',
        /* glsl */ `
        #include <beginnormal_vertex>
        vObjNrm = objectNormal;
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
        varying vec3 vObjPos;
        varying vec3 vObjNrm;
        varying vec3 vWorldNrm;
        ${PIXEL_SURFACE_COMMON}
        // Rock height field: multi-octave value noise. Feeds tone + the bump.
        float rockH(vec2 p) {
          return vnoise(p * 2.0) * 0.6 + vnoise(p * 5.3) * 0.3 + vnoise(p * 12.7) * 0.1;
        }
        `
      )
      .replace(
        '#include <normal_fragment_begin>',
        /* glsl */ `
        #include <normal_fragment_begin>
        {
          // Triplanar face coords from the object-space normal.
          vec3 an = abs(normalize(vObjNrm));
          vec2 uv = an.y > 0.5 ? vObjPos.xz : (an.x > 0.5 ? vObjPos.zy : vObjPos.xy);
          // Sample the height field around this point → irregular crag normal.
          float e = 0.05;
          float hx = rockH(uv + vec2(e, 0.0)) - rockH(uv - vec2(e, 0.0));
          float hy = rockH(uv + vec2(0.0, e)) - rockH(uv - vec2(0.0, e));
          vec3 mapN = normalize(vec3(-hx, -hy, e * ${bumpZ.toFixed(2)}));
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
          vec3 an = abs(normalize(vObjNrm));
          vec2 uv = an.y > 0.5 ? vObjPos.xz : (an.x > 0.5 ? vObjPos.zy : vObjPos.xy);
          float rk = rockH(uv);
          vec3 col = diffuseColor.rgb * (0.72 + rk * 0.6);
          if (vnoise(uv * 6.5 + 3.0) < 0.2) col *= 0.8;   // dark mineral pits
          diffuseColor.rgb = col;
        }
        `
      );
  };
  material.customProgramCacheKey = () => `rock_${bumpZ}`;
  rockMaterialCache.set(bumpZ, material);
  return material;
}

/** Paints per-face (faceted) or per-vertex (smooth) slate tone into `color`. */
function paintSlate(geometry: THREE.BufferGeometry, random: SeededRandom): void {
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  const c = new THREE.Color();
  const indexed = geometry.index !== null;
  for (let v = 0; v < count; v += 1) {
    // Non-indexed = flat facets: shade per triangle (every 3 verts share a tone).
    if (!indexed && v % 3 === 0) c.setHex(SLATE[Math.floor(random() * SLATE.length)]);
    if (indexed) c.setHex(SLATE[Math.floor(random() * SLATE.length)]);
    colors[v * 3] = c.r;
    colors[v * 3 + 1] = c.g;
    colors[v * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/** Displace every vertex radially by `disp(dir)` then scale to the half-extents. */
function shapeRock(
  geometry: THREE.BufferGeometry,
  rx: number,
  ry: number,
  rz: number,
  disp: (nx: number, ny: number, nz: number) => number
): void {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i).normalize();
    const r = 1 + disp(v.x, v.y, v.z);
    pos.setXYZ(i, v.x * r * rx, v.y * r * ry, v.z * r * rz);
  }
  pos.needsUpdate = true;
}

function finish(geometry: THREE.BufferGeometry, random: SeededRandom, bumpZ: number): RockBuild {
  geometry.computeVertexNormals();
  paintSlate(geometry, random);
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox!;
  const mesh = new THREE.Mesh(geometry, rockMaterial(bumpZ));
  mesh.castShadow = true;
  return {
    mesh,
    topY: bb.max.y,
    radiusXZ: Math.max(bb.max.x, -bb.min.x, bb.max.z, -bb.min.z),
  };
}

/**
 * Angular chiseled rock — a chunky low-poly icosahedron (20 big faces) with
 * strong per-corner displacement, so it reads as an unmistakably faceted gem of
 * stone. Weak normal bump (high bumpZ) keeps the flat facets crisp.
 */
export function facetedRock(
  random: SeededRandom,
  rx: number,
  ry: number,
  rz: number
): RockBuild {
  const s = seedOffset(random);
  const geometry = new THREE.IcosahedronGeometry(1, 0); // 20 flat faces → chunky
  const amp = 0.34;
  // Stepped hash per coarse cell → hard facet jumps, watertight (fn of position).
  shapeRock(geometry, rx, ry, rz, (nx, ny, nz) => {
    const h = hash3(Math.round((nx + s.x) * 3), Math.round((ny + s.y) * 3), Math.round((nz + s.z) * 3));
    return (h - 0.5) * 2 * amp;
  });
  return finish(geometry, random, 9.0);
}

/** Rounded weathered boulder — smooth low-frequency lumps, welded smooth normals. */
export function smoothRock(
  random: SeededRandom,
  rx: number,
  ry: number,
  rz: number
): RockBuild {
  const s = seedOffset(random);
  const geometry = mergeVertices(new THREE.IcosahedronGeometry(1, 3)); // welded → smooth
  const amp = 0.16;
  // Sum of a few seeded sines of the direction → gentle organic lumps.
  shapeRock(geometry, rx, ry, rz, (nx, ny, nz) => {
    const l =
      Math.sin(nx * 3.1 + s.x) * 0.5 +
      Math.sin(ny * 2.7 + s.y) * 0.3 +
      Math.sin(nz * 3.7 + s.z) * 0.4 +
      Math.sin((nx + nz) * 4.3 + s.z) * 0.2;
    return l * amp;
  });
  return finish(geometry, random, 3.0);
}

/** Dispatch to the currently-selected rock style. */
export function buildRock(
  random: SeededRandom,
  rx: number,
  ry: number,
  rz: number
): RockBuild {
  return rockStyle() === 'smooth' ? smoothRock(random, rx, ry, rz) : facetedRock(random, rx, ry, rz);
}
