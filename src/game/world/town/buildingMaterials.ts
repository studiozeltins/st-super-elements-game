import * as THREE from 'three';
import { sunDirUniform } from '../../systems/sunUniform';
import { PIXEL_SURFACE_COMMON, sunEdgeApply } from './pixelSurfaceShaders';

/**
 * Reusable pixel-art building materials — the ONE place wall/roof surfaces are
 * textured, so no building is a flat monolith color. Each is a MeshLambertMaterial
 * (receives shadow + drifts with day/night) patched with a per-cell pixel pattern
 * in object space, matching the terrain/cobble pixel style. THREE-only, no uniforms
 * — the base color is baked into the shader string, so every material is self
 * contained and cheap.
 */

function colorToVec3(hex: number): string {
  const c = new THREE.Color(hex);
  return `vec3(${c.r.toFixed(3)}, ${c.g.toFixed(3)}, ${c.b.toFixed(3)})`;
}

const PHASH = /* glsl */ `
  float phash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
`;

/** Injects object-space position + normal varyings for the pattern to read. */
function patchVertexLocalSpace(shader: THREE.WebGLProgramParametersWithUniforms): void {
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      /* glsl */ `
      #include <common>
      varying vec3 vLocalPos;
      varying vec3 vLocalNrm;
      varying vec3 vWorldNrm;
      varying vec3 vWorldPos;
      `
    )
    .replace(
      '#include <beginnormal_vertex>',
      /* glsl */ `
      #include <beginnormal_vertex>
      vLocalNrm = objectNormal;
      vWorldNrm = normalize(mat3(modelMatrix) * objectNormal);
      `
    )
    .replace(
      '#include <begin_vertex>',
      /* glsl */ `
      #include <begin_vertex>
      vLocalPos = position;
      vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
      `
    );
}

// Materials are memoized by their key so every house/roof doesn't compile its own
// shader program — one program per (style,color) is shared across all buildings,
// cutting draw-call state changes (a real FPS cost with a full district town).
const wallCache = new Map<string, THREE.MeshLambertMaterial>();
const roofCache = new Map<number, THREE.MeshLambertMaterial>();

/**
 * Wall material — offset running-bond brick courses with mortar seams, a per-cell
 * bevel, and the sun-facing edge line. `style` only sets how much each brick's
 * tone varies: `'stone'` is near-uniform (the church — every brick the same
 * color); `'brick'` gives a wide random dark↔light spread so house walls read as
 * a patchy, weathered masonry mix rather than one flat color.
 */
export function createWallMaterial(
  baseColor: number,
  style: 'stone' | 'brick'
): THREE.MeshLambertMaterial {
  const cacheKey = `${style}_${baseColor}`;
  const cached = wallCache.get(cacheKey);
  if (cached) return cached;
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const base = colorToVec3(baseColor);
  // Per-brick tone: base * [LO..HI] by a per-brick hash, plus a ±JITTER speckle.
  // Church ('stone') = tight around base (uniform); houses ('brick') = wide.
  const [lo, hi, jitter] = style === 'brick' ? [0.62, 1.14, 0.22] : [0.84, 1.0, 0.1];
  material.onBeforeCompile = shader => {
    patchVertexLocalSpace(shader);
    shader.uniforms.uSunDir = sunDirUniform; // by reference — game loop updates it

    // Establishes `uv` (in-plane surface coords) and `tCell` (position within the
    // current brick, 0 at center → ±0.5 at the seam). Shared by the color pattern,
    // the bevel normal, and the edge line so the three stay in register. BEVEL/
    // START tune how domed each brick reads — walls are vertical flat faces where
    // relief reads weakly, so keep it subtle.
    const uvCell = /* glsl */ `
      vec3 nrm = abs(normalize(vLocalNrm));
      vec2 uv = nrm.x > 0.5 ? vLocalPos.zy : (nrm.z > 0.5 ? vLocalPos.xy : vLocalPos.xz);
      float ROW = 0.5, BRICK = 1.0;
      float row = floor(uv.y / ROW);
      float rbOffset = mod(row, 2.0) * 0.5;   // running bond
      vec2 tCell = fract(vec2((uv.x + rbOffset) / BRICK, uv.y / ROW)) - 0.5;
      float BEVEL = 0.40, START = 0.26;
    `;

    const pattern = /* glsl */ `
      vec2 bcell = vec2(floor((uv.x + rbOffset) / BRICK), row);
      vec3 stone = ${base} * mix(${lo.toFixed(2)}, ${hi.toFixed(2)}, phash(bcell));
      stone *= 1.0 + (phash(bcell + 3.0) - 0.5) * ${jitter.toFixed(2)};
      float mortar = (abs(tCell.x) > 0.46 || abs(tCell.y) > 0.4) ? 0.0 : 1.0;
      diffuseColor.rgb = mix(vec3(0.4, 0.39, 0.37), stone, mortar);
    `;

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec3 vLocalPos;
        varying vec3 vLocalNrm;
        varying vec3 vWorldNrm;
        uniform vec3 uSunDir;
        ${PIXEL_SURFACE_COMMON}
        `
      )
      .replace(
        '#include <normal_fragment_begin>',
        /* glsl */ `
        #include <normal_fragment_begin>
        {
          ${uvCell}
          vec3 mapN = gridBevelMapN(tCell, BEVEL, START);
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
          ${uvCell}
          ${pattern}
          // Sun-facing tile edge line: crisp near the seam, only on faces the sun
          // hits (back-facing walls stay dark). Applied post-lighting below.
          float faceSun = max(0.0, dot(normalize(vWorldNrm), normalize(uSunDir)));
          float seam = 0.5 - max(abs(tCell.x), abs(tCell.y));
          float nearSeam = 1.0 - smoothstep(0.0, 0.13, seam);
          gEdge = nearSeam * faceSun;
          gEdgeCol = min(diffuseColor.rgb * 1.6 + 0.05, vec3(1.0));
        }
        `
      )
      .replace('#include <opaque_fragment>', sunEdgeApply(0.8));
  };
  material.customProgramCacheKey = () => `wall_${style}_${baseColor}`;
  wallCache.set(cacheKey, material);
  return material;
}

let plankMaterial: THREE.MeshLambertMaterial | null = null;

/**
 * Bridge-plank wood material (shared by the ONE instanced plank mesh). Paints
 * pixel-art wooden boards: the plank width is split into board slats with dark
 * seams, each board + world cell hash-shaded, plus a per-pixel grain speckle — so
 * the deck reads as pixelated wood slabs instead of one flat brown box. Per-plank
 * tone varies by the instance world position (instanceMatrix), so no two planks
 * are identically colored. THREE-only, no uniforms.
 */
export function createBridgePlankMaterial(baseColor: number): THREE.MeshLambertMaterial {
  if (plankMaterial) return plankMaterial;
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const base = colorToVec3(baseColor);
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec3 vLocalPos;
        varying vec3 vLocalNrm;
        varying vec3 vPlankWorld;
        `
      )
      .replace(
        '#include <beginnormal_vertex>',
        /* glsl */ `
        #include <beginnormal_vertex>
        vLocalNrm = objectNormal;
        `
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        vLocalPos = position;
        // Instanced deck: instanceMatrix[3].xyz is this plank's world origin — a
        // stable per-plank seed for its wood tone.
        vPlankWorld = (modelMatrix * instanceMatrix[3]).xyz;
        `
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec3 vLocalPos;
        varying vec3 vLocalNrm;
        varying vec3 vPlankWorld;
        ${PHASH}
        `
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
        #include <color_fragment>
        {
          // In-plane axes from the dominant face: top/bottom use xz, sides use the
          // matching pair. uv.x runs ACROSS the plank (boards), uv.y ALONG it.
          vec3 n = abs(normalize(vLocalNrm));
          vec2 uv = n.y > 0.5 ? vLocalPos.xz : (n.x > 0.5 ? vLocalPos.zy : vLocalPos.xy);
          float BOARD = 0.72;                       // slat width across the plank
          float board = floor(uv.x / BOARD);
          vec3 wood = ${base} * (0.82 + phash(vec2(board, 3.0)) * 0.30);   // per-board tone
          vec2 pcell = floor(vPlankWorld.xz / 2.0);
          wood *= 0.9 + phash(pcell + 2.0) * 0.18;                         // per-plank tone
          vec2 grain = floor(uv * vec2(3.0, 7.0));
          wood *= 0.9 + phash(grain + 5.0) * 0.16;                         // pixel grain speckle
          float seam = abs(fract(uv.x / BOARD) - 0.5);
          wood *= seam > 0.44 ? 0.55 : 1.0;                                // dark board seam
          diffuseColor.rgb = wood;
        }
        `
      );
  };
  material.customProgramCacheKey = () => `bridgePlank_${baseColor}`;
  plankMaterial = material;
  return material;
}

/**
 * Tiled roof material — horizontal tile courses climbing the slope, each course a
 * row of per-tile-shaded pixels with a darker grout line and a scalloped lower
 * edge, so a pitched roof reads as laid tiles instead of a flat colored slab.
 */
export function createRoofMaterial(baseColor: number): THREE.MeshLambertMaterial {
  const cached = roofCache.get(baseColor);
  if (cached) return cached;
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const base = colorToVec3(baseColor);
  material.onBeforeCompile = shader => {
    patchVertexLocalSpace(shader);
    shader.uniforms.uSunDir = sunDirUniform; // by reference — game loop updates it
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec3 vLocalPos;
        varying vec3 vLocalNrm;
        varying vec3 vWorldNrm;
        uniform vec3 uSunDir;
        ${PIXEL_SURFACE_COMMON}
        `
      )
      .replace(
        '#include <normal_fragment_begin>',
        /* glsl */ `
        #include <normal_fragment_begin>
        {
          // Dome each tile: flat top sloping to its seams so the sun lights every
          // tile at its own angle — the pitched roof reads as laid 3D tiles.
          vec2 uv = vec2(vLocalPos.z, vLocalPos.y);
          float ROW = 0.34, COL = 0.42;
          float offset = mod(floor(uv.y / ROW), 2.0) * 0.5;
          vec2 tCell = fract(vec2((uv.x + offset * COL) / COL, uv.y / ROW)) - 0.5;
          vec3 wn = bevelWorldNormal(gridBevelMapN(tCell, 0.6, 0.2), vWorldNrm, uv);
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
        }
        `
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
        #include <color_fragment>
        {
          // Courses climb the roof (world/local Y); tiles run along the ridge (Z).
          vec2 uv = vec2(vLocalPos.z, vLocalPos.y);
          float ROW = 0.34;
          float COL = 0.42;
          float row = floor(uv.y / ROW);
          float offset = mod(row, 2.0) * 0.5;  // staggered tiles
          vec2 tile = vec2(floor((uv.x + offset * COL) / COL), row);
          vec3 t = mix(${base}, ${base} * 0.78, phash(tile));
          t *= 0.94 + phash(tile + 5.0) * 0.12;
          // Grout: darken the top of each course and the tile seams.
          float courseEdge = fract(uv.y / ROW);
          float seam = abs(fract((uv.x + offset * COL) / COL) - 0.5);
          float grout = (courseEdge > 0.82 || seam > 0.45) ? 0.68 : 1.0;
          t *= grout;
          diffuseColor.rgb = t;
          // Sun-lit tile EDGE LINE (stashed, applied POST-lighting so it shows day
          // AND night): on the sun-facing slope, the exposed lower lip of each tile.
          float slopeSun = max(0.0, dot(normalize(vWorldNrm), normalize(uSunDir)));
          float lip = smoothstep(0.35, 0.0, courseEdge);
          gEdge = lip * slopeSun;                              // scaled by lit luminance post-light
          gEdgeCol = min(t * 1.7 + 0.06, vec3(1.0));           // lighter tile, not white
        }
        `
      )
      .replace('#include <opaque_fragment>', sunEdgeApply(0.8));
  };
  material.customProgramCacheKey = () => `roof_${baseColor}`;
  roofCache.set(baseColor, material);
  return material;
}
