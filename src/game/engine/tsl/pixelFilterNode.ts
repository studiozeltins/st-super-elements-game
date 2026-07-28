import type { Node } from "three/webgpu";
import {
  Fn,
  screenUV,
  screenSize,
  floor,
  uniform,
  convertToTexture,
  vec2,
} from "three/tsl";
import { outlineNode, type OutlineOptions } from "./outlineNode";

/**
 * The game's pixel-art identity on WebGPU (D-04 salvage) — low-res nearest
 * upscale + the one-sided sun-facing rim — reproduced in TSL in BOTH candidate
 * resolution shapes (SPIKE-02), selectable by the `?shape=whole|final` query
 * param (default `final`):
 *
 *   Shape A — pixelate-whole-chain (`?shape=whole`): the composed Water+Sky
 *     image is nearest-downsampled to the low-res cell grid FIRST, then the rim
 *     is computed on that low-res image (its depth reads snap to the cell grid,
 *     so the outline is chunky and pixel-aligned) — mirrors the old renderer
 *     rendering the whole world into a small target and upscaling.
 *
 *   Shape B — final-pixelate (`?shape=final`, default): the rim is computed on
 *     the FULL-RES composite (crisp), then the whole thing is pixelated as the
 *     LAST node — mirrors the built-in pixelationPass (Nearest final downsample).
 *
 * Colour management: this node does NOT re-encode sRGB (RESEARCH Pitfall 5) —
 * PostProcessing + renderer colour management own output encoding, so brightness
 * matches master. The `?tone=` toggle (ACES vs neutral) lives in the bootstrap.
 *
 * Imported by the spike only — the game must NOT import src/game/engine/tsl/
 * this phase (SPIKE-01: zero game code touched).
 */
export type PixelShape = "whole" | "final";

/** Read the resolution shape from the `?shape=whole|final` query param. */
export function pixelShapeFromQuery(): PixelShape {
  if (typeof window === "undefined") return "final";
  return /shape=whole/.test(window.location.search) ? "whole" : "final";
}

export interface PixelFilterOptions extends OutlineOptions {
  /** Edge length of a chunky pixel, in device pixels. Larger = chunkier. */
  pixelSize?: number;
  /** Force a shape; defaults to the `?shape=` query param. */
  shape?: PixelShape;
}

/** Nearest-downsample a node: every fragment in a cell samples the cell centre. */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function pixelate(inputNode: Node, pixelSize: any): Node {
  const source = convertToTexture(inputNode);
  return Fn(() => {
    const cells = screenSize.div(pixelSize);
    const snapped = floor(screenUV.mul(cells)).add(0.5).div(cells);
    return (source as { sample(u: unknown): Node }).sample(snapped);
  })();
}

/**
 * Apply the pixel-art filter (both shapes + sun-facing rim) as the LAST post node.
 * @param inputNode the composed Water+Sky+bloom colour node
 * @param scenePass the `pass(scene, camera)` node — its depth feeds the outline
 */
export function pixelFilterNode(
  inputNode: Node,
  scenePass: { getTextureNode(name: string): Node },
  options: PixelFilterOptions = {},
): Node {
  const shape = options.shape ?? pixelShapeFromQuery();
  const pixelSize = uniform(options.pixelSize ?? 4);
  const depthTex = scenePass.getTextureNode("depth");

  if (shape === "whole") {
    // Downsample the whole composed chain first, then rim the low-res image with
    // depth reads snapped to the cell grid (chunky, pixel-aligned outline).
    const pix = pixelate(inputNode, pixelSize);
    const cells = screenSize.div(pixelSize);
    const snappedUV = floor(screenUV.mul(cells)).add(0.5).div(cells);
    const cellTexel = vec2(1, 1).div(cells); // one cell wide
    return outlineNode(pix, depthTex, snappedUV, cellTexel, options);
  }

  // final (default): rim on the full-res composite, then pixelate LAST.
  const fullTexel = vec2(1, 1).div(screenSize);
  const rimmed = outlineNode(inputNode, depthTex, screenUV, fullTexel, options);
  return pixelate(rimmed, pixelSize);
}
