export type WeaponId = 'sword' | 'greatsword' | 'bow' | 'spear' | 'book';

export interface WeaponDefinition {
  id: WeaponId;
  displayName: string;
  damage: number;
  cooldownSeconds: number;
  range: number;
  isRanged: boolean;
  projectileSpeed: number;
}

export const WEAPONS: Record<WeaponId, WeaponDefinition> = {
  sword: {
    id: 'sword',
    displayName: 'Zobens',
    damage: 60,
    cooldownSeconds: 0.45,
    range: 2.4,
    isRanged: false,
    projectileSpeed: 0,
  },
  greatsword: {
    id: 'greatsword',
    displayName: 'Lielais zobens',
    damage: 110,
    cooldownSeconds: 0.9,
    range: 3.0,
    isRanged: false,
    projectileSpeed: 0,
  },
  spear: {
    id: 'spear',
    displayName: 'Šķēps',
    damage: 70,
    cooldownSeconds: 0.55,
    range: 3.4,
    isRanged: false,
    projectileSpeed: 0,
  },
  bow: {
    id: 'bow',
    displayName: 'Loks',
    damage: 55,
    cooldownSeconds: 0.6,
    range: 16,
    isRanged: true,
    projectileSpeed: 24,
  },
  book: {
    id: 'book',
    displayName: 'Grāmata',
    damage: 65,
    cooldownSeconds: 0.7,
    range: 14,
    isRanged: true,
    projectileSpeed: 16,
  },
};
