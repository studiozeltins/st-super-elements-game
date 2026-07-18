import { roadFactor, footpathFactor } from '../world/roads';
import { isInTown } from '../world/town/townPlan';

/**
 * The four ground surfaces the world distinguishes underfoot. Kept in sync with
 * `createMovementAudio.FootstepSurface` (same tag set) so dust spawning and
 * footstep audio agree on "what am I standing on".
 */
export type Surface = 'grass' | 'dirt' | 'path' | 'town';

/**
 * The single authoritative answer to "what surface is at this world point". Pure
 * composition of the three existing pure masks, in precedence order:
 *   town (solid pavement) > dirt (road) > path (worn footpath) > grass.
 *
 * The `roadFactor > 0.5` threshold MUST match `grassPlacement.ts:74` (the grass
 * road-rejection cutoff) so dust never spawns where grass still grows — one source
 * of truth for the road/grass boundary. `footpathFactor` is a partial mask capped
 * at FOOTPATH_MAX (0.6); `> 0.25` picks out the worn spine while leaving the faint
 * edges as grass.
 *
 * Zero allocation, no GPU read — returns a string literal only (D-12,
 * client-perf rule). THREE-free, purity mirrors `windMath.ts`.
 */
export function surfaceAt(x: number, z: number): Surface {
  if (isInTown(x, z)) return 'town';
  if (roadFactor(x, z) > 0.5) return 'dirt';
  if (footpathFactor(x, z) > 0.25) return 'path';
  return 'grass';
}
