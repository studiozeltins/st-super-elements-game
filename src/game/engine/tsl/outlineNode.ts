import type { Node } from "three/webgpu";
import { Vector2 } from "three/webgpu";
import { Fn, vec4, float, uniform, step, normalize } from "three/tsl";

/**
 * The game's SIGNATURE one-sided, sun-facing depth-outline rim, reproduced as a
 * TSL Fn (D-04 salvage — ported from createPixelRenderer.ts's blit fragment
 * shader, lines 117-128). This is what makes the built-in pixelationPass NOT a
 * drop-in: that draws SYMMETRIC dark edges on every silhouette; the game rims
 * only the neighbour TOWARD the sun, and lightens the base colour there (never a
 * white edge).
 *
 * It reads LINEAR depth reconstructed from the scene pass depth texture (the
 * proven `lin()` math, RESEARCH assumption A1 fallback), samples the single
 * neighbour toward the sun screen direction, and where the depth jump exceeds a
 * threshold mixes the colour toward a lighter shade.
 *
 * Imported by the spike only — the game must NOT import src/game/engine/tsl/
 * this phase (SPIKE-01: zero game code touched).
 */

/** Screen-space direction toward the sun; updated per frame like setEdgeSunDir. */
const sunDir = new Vector2(0, 1);
export const sunDirUniform = uniform(sunDir);

/** Feed the sun's screen-space direction into the rim (call each frame). */
export function setOutlineSunDir(x: number, y: number): void {
  sunDir.set(x, y);
  sunDirUniform.value = sunDir;
}

export interface OutlineOptions {
  /** Camera near plane — for the linear-depth reconstruction. */
  near?: number;
  /** Camera far plane. */
  far?: number;
  /** How much lighter the rim is than the base colour (createPixelRenderer 0.95). */
  edgeStrength?: number;
  /** Relative depth-jump above which a rim is drawn (createPixelRenderer 0.06). */
  threshold?: number;
  /** Neighbour sample distance in texels toward the sun (createPixelRenderer 1.4). */
  texelScale?: number;
}

/**
 * Append the sun-facing rim to `colorNode`.
 * @param colorNode   the current fragment colour (vec3/vec4)
 * @param depthTex    the scene pass depth texture node (getTextureNode('depth'))
 * @param baseUV      UV at which to read depth (screenUV, or a snapped cell UV)
 * @param texel       one-texel step as a vec2 (1/res, or one cell for the chunky rim)
 */
export function outlineNode(
  colorNode: Node,
  depthTex: Node,
  baseUV: Node,
  texel: Node,
  options: OutlineOptions = {},
): Node {
  const near = uniform(options.near ?? 0.1);
  const far = uniform(options.far ?? 20000);
  const edgeStrength = uniform(options.edgeStrength ?? 0.95);
  const threshold = uniform(options.threshold ?? 0.06);
  const texelScale = float(options.texelScale ?? 1.4);

  // TSL's typed-node generics don't flow through the untyped `Node` params
  // (depthTex/colorNode/baseUV/texel), so cast them to the fluent node API for
  // the math below. This is throwaway spike wiring; runtime behaviour is exact.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const depth = depthTex as any;
  const col = (colorNode as any).rgb;
  const uv = baseUV as any;
  const texelN = texel as any;

  // Linear eye-space depth from the perspective depth texture (the exact GLSL
  // lin() the game used — matched here rather than getViewZNode so the neighbour
  // sample is a plain texture read at an offset UV).
  const lin = (at: any): any => {
    const z = depth.sample(at).r.mul(2).sub(1);
    return near
      .mul(far)
      .mul(2)
      .div(far.add(near).sub(z.mul(far.sub(near))));
  };

  return Fn(() => {
    const c = lin(uv);
    // Sample ONLY the neighbour toward the sun: at a sun-facing edge that
    // neighbour is background (farther) → a positive jump → rim on one side only.
    const sdir = normalize((sunDirUniform as any).add(0.00001));
    const fwd = lin(uv.add(sdir.mul(texelN).mul(texelScale)));
    const jump = fwd.sub(c).div(c);
    // Ignore the far background itself (c near far) so the sky edge does not rim.
    const edge = c
      .lessThan(far.mul(0.7))
      .select(step(threshold, jump), float(0));
    // Rim = a LIGHTER shade of the base colour underneath, not white. Fluent
    // .clamp/.mix on the `any` nodes avoids TSL's strict-TS overload friction.
    const lit = col.mul(edgeStrength.add(1)).add(0.05).clamp(0, 1);
    return vec4(col.mix(lit, edge), 1);
  })();
  /* eslint-enable @typescript-eslint/no-explicit-any */
}
