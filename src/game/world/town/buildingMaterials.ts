import * as THREE from 'three';

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
      `
    );
}

// Materials are memoized by their key so every house/roof doesn't compile its own
// shader program — one program per (style,color) is shared across all buildings,
// cutting draw-call state changes (a real FPS cost with a full district town).
const wallCache = new Map<string, THREE.MeshPhongMaterial>();
const roofCache = new Map<number, THREE.MeshPhongMaterial>();

/**
 * Wall material. `style: 'timber'` paints half-timbered plaster panels (dark
 * beams framing per-panel-shaded plaster); `style: 'stone'` paints offset stone
 * brick courses with mortar seams — for the church and other masonry.
 */
export function createWallMaterial(
  baseColor: number,
  style: 'timber' | 'stone'
): THREE.MeshPhongMaterial {
  const cacheKey = `${style}_${baseColor}`;
  const cached = wallCache.get(cacheKey);
  if (cached) return cached;
  const material = new THREE.MeshPhongMaterial({
    color: 0xffffff,
    flatShading: true,
    specular: 0x6a6a6a,
    shininess: 26,
  });
  const base = colorToVec3(baseColor);
  material.onBeforeCompile = shader => {
    patchVertexLocalSpace(shader);

    const pattern =
      style === 'timber'
        ? /* glsl */ `
          // Choose the two in-plane axes from the dominant face normal.
          vec3 n = abs(normalize(vLocalNrm));
          vec2 uv = n.x > 0.5 ? vLocalPos.zy : (n.z > 0.5 ? vLocalPos.xy : vLocalPos.xz);
          float POST = 1.15;   // vertical post spacing
          float FLOOR = 1.35;  // horizontal beam spacing
          float beamW = 0.13;
          float vx = abs(fract(uv.x / POST + 0.5) - 0.5) * POST;
          float hy = abs(fract(uv.y / FLOOR + 0.5) - 0.5) * FLOOR;
          float beam = (vx < beamW || hy < beamW) ? 1.0 : 0.0;
          vec2 panel = floor(vec2(uv.x / POST, uv.y / FLOOR));
          vec3 plaster = ${base} * (0.9 + phash(panel) * 0.16);
          vec2 speck = floor(uv * 4.0);
          plaster *= 0.95 + phash(speck + 7.0) * 0.1;
          diffuseColor.rgb = mix(plaster, vec3(0.28, 0.19, 0.12), beam);
        `
        : /* glsl */ `
          vec3 n = abs(normalize(vLocalNrm));
          vec2 uv = n.x > 0.5 ? vLocalPos.zy : (n.z > 0.5 ? vLocalPos.xy : vLocalPos.xz);
          float ROW = 0.5;
          float BRICK = 1.0;
          float row = floor(uv.y / ROW);
          float offset = mod(row, 2.0) * 0.5;   // running bond
          vec2 bcell = vec2(floor((uv.x + offset) / BRICK), row);
          vec3 stone = mix(${base}, ${base} * 0.82, phash(bcell));
          stone *= 0.95 + phash(bcell + 3.0) * 0.12;
          float mx = abs(fract((uv.x + offset) / BRICK) - 0.5);
          float my = abs(fract(uv.y / ROW) - 0.5);
          float mortar = (mx > 0.46 || my > 0.4) ? 0.0 : 1.0;
          diffuseColor.rgb = mix(vec3(0.4, 0.39, 0.37), stone, mortar);
        `;

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec3 vLocalPos;
        varying vec3 vLocalNrm;
        ${PHASH}
        `
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
        #include <color_fragment>
        { ${pattern} }
        `
      );
  };
  material.customProgramCacheKey = () => `wall_${style}_${baseColor}`;
  wallCache.set(cacheKey, material);
  return material;
}

/**
 * Tiled roof material — horizontal tile courses climbing the slope, each course a
 * row of per-tile-shaded pixels with a darker grout line and a scalloped lower
 * edge, so a pitched roof reads as laid tiles instead of a flat colored slab.
 */
export function createRoofMaterial(baseColor: number): THREE.MeshPhongMaterial {
  const cached = roofCache.get(baseColor);
  if (cached) return cached;
  const material = new THREE.MeshPhongMaterial({
    color: 0xffffff,
    flatShading: true,
    specular: 0x808080, // glossy tiles — the brightest specular of the buildings
    shininess: 44,
  });
  const base = colorToVec3(baseColor);
  material.onBeforeCompile = shader => {
    patchVertexLocalSpace(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec3 vLocalPos;
        varying vec3 vLocalNrm;
        ${PHASH}
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
          diffuseColor.rgb = t * grout;
        }
        `
      );
  };
  material.customProgramCacheKey = () => `roof_${baseColor}`;
  roofCache.set(baseColor, material);
  return material;
}
