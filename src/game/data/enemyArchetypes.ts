export type EnemyArchetypeId = 'slime' | 'spikySlime' | 'windWisp' | 'stoneGolem';

export interface EnemyArchetype {
  id: EnemyArchetypeId;
  displayName: string;
  maxHealth: number;
  contactDamage: number;
  /** Heavier = slower but shoves lighter bodies aside in collisions. */
  mass: number;
  moveSpeed: number;
  collisionRadius: number;
  /** 1..3 — multiplies the server kill reward. */
  rewardTier: number;
  bodyColor: number;
  /** 'hop' bounces on the ground, 'float' hovers, 'stomp' barely moves vertically. */
  locomotion: 'hop' | 'float' | 'stomp';
}

export const ENEMY_ARCHETYPES: Record<EnemyArchetypeId, EnemyArchetype> = {
  slime: {
    id: 'slime',
    displayName: 'Slaims',
    maxHealth: 320,
    contactDamage: 45,
    mass: 0.8,
    moveSpeed: 3.4,
    collisionRadius: 0.65,
    rewardTier: 1,
    bodyColor: 0x8aa87a,
    locomotion: 'hop',
  },
  spikySlime: {
    id: 'spikySlime',
    displayName: 'Ērkšķu slaims',
    maxHealth: 450,
    contactDamage: 70,
    mass: 1.1,
    moveSpeed: 4.0,
    collisionRadius: 0.7,
    rewardTier: 2,
    bodyColor: 0x6e8a4a,
    locomotion: 'hop',
  },
  windWisp: {
    id: 'windWisp',
    displayName: 'Vēja gars',
    maxHealth: 280,
    contactDamage: 60,
    mass: 0.45,
    moveSpeed: 5.4,
    collisionRadius: 0.55,
    rewardTier: 2,
    bodyColor: 0x4fd8b8,
    locomotion: 'float',
  },
  stoneGolem: {
    id: 'stoneGolem',
    displayName: 'Akmens golems',
    maxHealth: 900,
    contactDamage: 110,
    mass: 3.2,
    moveSpeed: 2.0,
    collisionRadius: 0.85,
    rewardTier: 3,
    bodyColor: 0x7a828e,
    locomotion: 'stomp',
  },
};

/**
 * Which archetype guards each camp, in getCampSites() order:
 * outer islands first (matching ISLANDS.slice(1)), then the city outskirts.
 */
export const CAMP_ARCHETYPES: EnemyArchetypeId[] = [
  'spikySlime', // island at baseHeight 1.8
  'windWisp', // island at baseHeight 3.6
  'stoneGolem', // island at baseHeight 5.4 — hardest
  'spikySlime', // island at baseHeight 1.8
  'slime', // city outskirts
  'slime', // city outskirts
];

export const BOSS_HEALTH_MULTIPLIER = 2.5;
export const BOSS_DAMAGE_MULTIPLIER = 1.5;
export const BOSS_SCALE = 1.55;
export const BOSS_MASS_MULTIPLIER = 2.5;
