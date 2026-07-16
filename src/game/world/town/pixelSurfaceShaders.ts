/**
 * Shared GLSL for the pixel-art town surfaces (cobble ground, roof tiles, brick
 * walls). Two effects, factored out of the per-material shaders so the cobble /
 * roof / wall copies don't drift:
 *
 *  1. gridBevelMapN + bevelWorldNormal — fake per-cell RELIEF. A regular grid
 *     cell (tile / brick) is domed: flat top, sloping down to its seams, so the
 *     sun lights each little cell at its own angle and the surface reads 3D
 *     without any real geometry. Grid math is analytic (no Voronoi loop), so it's
 *     far cheaper than the cobble ground's Voronoi bevel.
 *  2. gEdge / gEdgeCol + SUN_EDGE_APPLY — the sun-facing 1px edge line, applied
 *     POST-lighting so it shows day AND night and fades to nothing in shadow via
 *     the lit-luminance term.
 *
 * vWorldPos is a fragment varying the bevel needs (world-space derivatives for
 * the tangent frame). The vertex stage MUST output it — see patchVertexLocalSpace
 * in buildingMaterials.ts, which every surface using this shares.
 */

/** Fragment-shader declarations: varyings, phash, bevel + sun-edge helpers. */
export const PIXEL_SURFACE_COMMON = /* glsl */ `
  varying vec3 vWorldPos;
  float phash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

  // Tangent-space normal for one grid cell. tCell = fract(cell) - 0.5 (0 at the
  // cell center, ±0.5 at its seams). Flat until |t| passes startEdge, then slopes
  // outward — a domed tile/brick whose seams catch light as recesses.
  vec3 gridBevelMapN(vec2 tCell, float bevel, float startEdge) {
    vec2 slope = vec2(
      smoothstep(startEdge, 0.5, abs(tCell.x)) * sign(tCell.x),
      smoothstep(startEdge, 0.5, abs(tCell.y)) * sign(tCell.y)
    );
    return normalize(vec3(-slope * bevel, 1.0));
  }

  // Rotate a tangent-space normal into world space using a derivative cotangent
  // frame (works on the sloped roof too, not just axis-aligned walls). Returns a
  // world normal; the caller transforms it to view space like the cobble ground.
  vec3 bevelWorldNormal(vec3 mapN, vec3 worldN, vec2 uv) {
    vec3 q0 = dFdx(vWorldPos), q1 = dFdy(vWorldPos);
    vec2 s0 = dFdx(uv), s1 = dFdy(uv);
    vec3 N = normalize(worldN);
    vec3 q1p = cross(q1, N), q0p = cross(N, q0);
    vec3 T = q1p * s0.x + q0p * s1.x;
    vec3 B = q1p * s0.y + q0p * s1.y;
    float det = max(dot(T, T), dot(B, B));
    float sc = det == 0.0 ? 0.0 : inversesqrt(det);
    return normalize(T * (mapN.x * sc) + B * (mapN.y * sc) + N * mapN.z);
  }

  // Sun-facing edge line, stashed here in color_fragment and consumed post-light.
  float gEdge = 0.0;
  vec3 gEdgeCol = vec3(0.0);
`;

/**
 * The post-lighting edge apply, injected at <opaque_fragment>. `lumGain` scales
 * how strongly the line follows the surface's own lit luminance (crisp in sun,
 * dim floor at night) — cobble/roof historically used ~0.8-1.0.
 */
export function sunEdgeApply(lumGain: number): string {
  return /* glsl */ `
    #include <opaque_fragment>
    float edgeLum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, gEdgeCol, gEdge * (0.03 + edgeLum * ${lumGain.toFixed(2)}));
  `;
}
