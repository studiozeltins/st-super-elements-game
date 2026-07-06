// Gameplay constants. Values marked "server" must match spacetimedb/src/index.ts.
export const SAFE_ZONE_RADIUS = 18; // server
export const WORLD_BOUND = 130; // server — archipelago extent, islands + bridges fit inside
export const MAX_HEALTH = 1000; // server
export const GACHA_PULL_COST = 160; // server — ×10 pull costs 1600

export const GRAVITY = 30;
/** Jump apex ≈ v²/2g = 2.4 — clears a 1.8 terrace and medium boulders. */
export const JUMP_VELOCITY = 12;
export const POSITION_SYNC_INTERVAL_SECONDS = 0.1;
export const SAFE_ZONE_HEAL_PER_SECOND = 60;
/**
 * Pixel filter scales with screen size: internal render width aims at this
 * value, so phones keep readable pixels instead of a fixed /4 downscale.
 */
export const PIXEL_TARGET_INTERNAL_WIDTH = 440;
export const MAX_PIXELATION_FACTOR = 4;
/**
 * Three.js render layer for crisp UI billboards (health bars, damage numbers,
 * name tags). The world renders to a low-res target and is upscaled with
 * nearest-neighbour for the pixel look; layer-1 objects render in a second pass
 * at native resolution on top, so they stay sharp. See createPixelRenderer.
 */
export const OVERLAY_LAYER = 1;
