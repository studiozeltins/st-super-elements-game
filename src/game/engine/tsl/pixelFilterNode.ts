import type { Node } from 'three/webgpu';
import { Fn, screenUV, screenSize, floor, uniform, convertToTexture } from 'three/tsl';

/**
 * Minimal nearest-downsample "final-pixelate" TSL post node — the salvage seed
 * of the game's pixel-art identity on WebGPU (D-04). This is the TRACER stub:
 * it only proves the pixel step can sit LAST in the Water + Sky post chain and
 * pixelate the whole composed image. Plan 02 expands this into both resolution
 * shapes (whole-chain + final) and adds the one-sided sun-facing rim outline
 * (ported from createPixelRenderer.ts). It is imported by the spike only —
 * never by the game this phase (SPIKE-01: zero game code touched).
 *
 * How it pixelates: every fragment in a `pixelSize`-wide cell snaps its screen
 * UV to the SAME cell-center, so they all sample one identical point of the
 * composed image → a flat block of colour per cell (nearest-downsample), with
 * no dependence on the source texture's filter mode.
 */
export interface PixelFilterOptions {
  /** Edge length of a chunky pixel, in device pixels. Larger = chunkier. */
  pixelSize?: number;
}

export function pixelFilterNode(inputNode: Node, options: PixelFilterOptions = {}): Node {
  // uniform() so plan 02 / a debug control can retune the block size live.
  const pixelSize = uniform(options.pixelSize ?? 4);
  // Render the composed Water+Sky+bloom node into a texture we can resample at
  // snapped UVs (the built-in pixelationPass uses the same convertToTexture idiom).
  const source = convertToTexture(inputNode);

  return Fn(() => {
    // Low-res grid: how many chunky cells span the screen on each axis.
    const cells = screenSize.div(pixelSize);
    // Snap the screen UV to the nearest cell CENTER (floor + 0.5) so the whole
    // cell reads one colour.
    const snapped = floor(screenUV.mul(cells)).add(0.5).div(cells);
    return source.sample(snapped);
  })();
}
