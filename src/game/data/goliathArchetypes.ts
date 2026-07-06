import { goliathBaseGems } from './gemRewards';

// Goliath raiders are roaming mini-bosses that dwarf both players and camp
// bosses. They come in three sizes; every stat escalates with size except move
// speed, which drops as they get more massive. The smallest already stands ~1.15×
// a player (players render at model scale 1.0); the largest towers at ~1.9×.
// baseGems is sourced from gemRewards.goliathBaseGems so the payout never drifts
// from the server (spacetimedb/src/index.ts), enforced by serverSync.test.ts.

export type GoliathSizeIndex = 0 | 1 | 2;

export interface GoliathArchetype {
  sizeIndex: GoliathSizeIndex;
  displayName: string;
  /** World scale of the humanoid model; players render at 1.0. */
  modelScale: number;
  maxHealth: number;
  contactDamage: number;
  moveSpeed: number;
  collisionRadius: number;
  bodyColor: number;
  /** Size-indexed stipend from gemRewards.goliathBaseGems — never hardcoded. */
  baseGems: number;
  /** Only the largest raider's blows splash to nearby targets. */
  splashesOnAttack: boolean;
}

export const GOLIATH_ARCHETYPES_BY_SIZE: readonly GoliathArchetype[] = [
  {
    sizeIndex: 0,
    displayName: 'Goliāta reideris',
    modelScale: 1.15,
    maxHealth: 15600,
    contactDamage: 90,
    moveSpeed: 3.2,
    collisionRadius: 0.8,
    bodyColor: 0xd06a2c,
    baseGems: goliathBaseGems(0),
    splashesOnAttack: false,
  },
  {
    sizeIndex: 1,
    displayName: 'Goliāta postītājs',
    modelScale: 1.5,
    maxHealth: 25200,
    contactDamage: 130,
    moveSpeed: 2.7,
    collisionRadius: 1.0,
    bodyColor: 0xb02f4a,
    baseGems: goliathBaseGems(1),
    splashesOnAttack: false,
  },
  {
    sizeIndex: 2,
    displayName: 'Goliāta iznīcinātājs',
    modelScale: 1.9,
    maxHealth: 39000,
    contactDamage: 170,
    moveSpeed: 2.2,
    collisionRadius: 1.3,
    bodyColor: 0x6a2fb0,
    baseGems: goliathBaseGems(2),
    splashesOnAttack: true,
  },
];
