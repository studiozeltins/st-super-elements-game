// Enemies are simulated on each client, not on the server, but their spawns are
// fully deterministic: getCampSites() returns the same ordered camps on every
// client, and each camp spawns a fixed-size pack. That lets us mint a stable
// enemy id — camp index + member index — that is identical across clients, so
// the server-side enemy_carry hoard lines up with the same enemy everywhere.

/** Members spawned per camp: PACK_SIZE_PER_CAMP guards + one boss (member 0). */
export const PACK_SIZE_PER_CAMP = 4;
export const MEMBERS_PER_CAMP = PACK_SIZE_PER_CAMP + 1;

// Stride between camps in the id space. Must exceed MEMBERS_PER_CAMP so member
// ids never bleed into the next camp; 100 leaves generous headroom.
const CAMP_ID_STRIDE = 100;

/** Stable, cross-client id for the given camp/member. */
export function enemyIdFor(campIndex: number, memberIndex: number): number {
  return campIndex * CAMP_ID_STRIDE + memberIndex;
}

/** Member 0 of every camp is the boss. */
export function isBossMember(memberIndex: number): boolean {
  return memberIndex === 0;
}
