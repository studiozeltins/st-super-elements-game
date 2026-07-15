/**
 * The town plan — DATA, not code. The town is a grid of districts, each a square
 * tile with a ground surface and a kind that decides what gets built on it. To
 * add a new region later, append a District here (and, if it is a new kind, add a
 * populate branch in buildTown) — nothing else in the world needs to change.
 *
 * Tiles are laid edge-to-edge (2*HALF spacing) so the paved surfaces meet with no
 * grass gaps between districts. Coordinates stay inside the island's flat center
 * (terrain FLAT_CENTER_RADIUS = 24) so the flat ground meshes never clip hills.
 */

export type GroundMaterial = 'cobble' | 'flagstone' | 'gravel';
export type DistrictKind = 'plaza' | 'housing' | 'market' | 'garden' | 'cafe' | 'civic';

export interface District {
  id: string;
  kind: DistrictKind;
  /** District center in world XZ. */
  cx: number;
  cz: number;
  /** Half-extent (square). */
  half: number;
  ground: GroundMaterial;
}

/** Half-extent shared by every tile in the current 3×3 layout. */
export const DISTRICT_HALF = 7.5;

const STEP = DISTRICT_HALF * 2;

/**
 * A 3×3 town: central plaza, a civic tile (church) to the north, two housing
 * tiles west, two market tiles east/north-east (by the road out), garden to the
 * south-west, cafe to the south-east.
 */
// NOTE: ground is 'cobble' everywhere for now — larger flagstone/gravel tiles read
// badly under the nearest-neighbour pixel filter. The flagstone/gravel materials
// stay wired in createTownGround so a future district can opt back in.
export const TOWN_DISTRICTS: District[] = [
  { id: 'plaza', kind: 'plaza', cx: 0, cz: 0, half: DISTRICT_HALF, ground: 'cobble' },
  { id: 'civic-n', kind: 'civic', cx: 0, cz: -STEP, half: DISTRICT_HALF, ground: 'cobble' },
  { id: 'housing-w', kind: 'housing', cx: -STEP, cz: 0, half: DISTRICT_HALF, ground: 'cobble' },
  { id: 'housing-nw', kind: 'housing', cx: -STEP, cz: -STEP, half: DISTRICT_HALF, ground: 'cobble' },
  { id: 'market-e', kind: 'market', cx: STEP, cz: 0, half: DISTRICT_HALF, ground: 'cobble' },
  { id: 'market-ne', kind: 'market', cx: STEP, cz: -STEP, half: DISTRICT_HALF, ground: 'cobble' },
  { id: 'garden-sw', kind: 'garden', cx: -STEP, cz: STEP, half: DISTRICT_HALF, ground: 'cobble' },
  { id: 'cafe-s', kind: 'cafe', cx: 0, cz: STEP, half: DISTRICT_HALF, ground: 'cobble' },
  { id: 'cafe-se', kind: 'cafe', cx: STEP, cz: STEP, half: DISTRICT_HALF, ground: 'cobble' },
];
