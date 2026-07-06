// Damage resistances — a small, data-driven layer so any combatant (players AND
// enemies/goliaths) can shrug off, or be weak to, a given kind of damage without
// touching the reducers that apply it. To add a resistance later you only write a
// profile here and pass it at the damage site via resistedDamage(); the combat
// code stays the same.
//
// A multiplier is applied to INCOMING damage:
//   1.0  = normal (no resistance)  ← the default when a type is unlisted
//   0.35 = takes 35% (65% resisted)
//   0.0  = immune
//   >1.0 = extra vulnerable (a weakness)

// The damage channels the server can currently tell apart. 'melee' and 'skill'
// both arrive through attackEnemies today (indistinguishable server-side), so
// they resolve to the same number for now; 'ranged' is the bow/hitscan path
// (attackRay); 'contact' is an enemy/goliath touching a player in the world tick.
// Element-specific channels can be added as more string keys once attacks carry
// their element to the server.
export type DamageType = 'melee' | 'ranged' | 'skill' | 'contact';

// Per-type incoming-damage multipliers. Any omitted type defaults to 1 (normal).
export type ResistanceProfile = Partial<Record<DamageType, number>>;

/** Applies a target's resistance to one hit, returning the rounded damage dealt. */
export function resistedDamage(
  rawDamage: number,
  profile: ResistanceProfile | undefined,
  type: DamageType
): number {
  const multiplier = profile?.[type] ?? 1;
  return Math.round(rawDamage * multiplier);
}

// ── Profiles ────────────────────────────────────────────────────────────────
// Only goliath ranged resistance is live right now. Add camp-enemy or per-player
// profiles here and pass them through resistedDamage() to enable more.

/** Raiders shrug off ranged fire: a projectile lands only 10% of its damage. */
export const GOLIATH_RESISTANCES: ResistanceProfile = { ranged: 0.10 };

// Per-character player resistances, keyed by active character id. Applied to
// INCOMING damage the player takes (enemy/goliath melee is the 'contact' channel).
// Mirror the multipliers in src/game/data/characters.ts (the `resistances` field).
export const PLAYER_RESISTANCES: Record<string, ResistanceProfile> = {
  nereida: { contact: 0.7 },
  vesper: { ranged: 0.5, contact: 0.85 },
  glacia: { contact: 0.55 },
};
