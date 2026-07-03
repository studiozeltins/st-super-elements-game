import type { ElementId } from './elements';
import type { WeaponId } from './weapons';

export type SkillKind = 'projectile' | 'nova' | 'dash' | 'ring' | 'volley';

export interface SkillDefinition {
  id: string;
  displayName: string;
  kind: SkillKind;
  damage: number;
  cooldownSeconds: number;
  radius: number;
  projectileSpeed: number;
  projectileCount: number;
  durationSeconds: number;
}

export interface CharacterDefinition {
  id: string;
  displayName: string;
  title: string;
  stars: 4 | 5;
  element: ElementId;
  weapon: WeaponId;
  moveSpeed: number;
  /** Per-character health pool. */
  maxHealth: number;
  /** Passive health regenerated per second (0 = no regen). */
  healthRegen: number;
  hairColor: number;
  skill: SkillDefinition;
}

function skill(
  id: string,
  displayName: string,
  kind: SkillKind,
  damage: number,
  cooldownSeconds: number,
  options: Partial<Pick<SkillDefinition, 'radius' | 'projectileSpeed' | 'projectileCount' | 'durationSeconds'>> = {}
): SkillDefinition {
  return {
    id,
    displayName,
    kind,
    damage,
    cooldownSeconds,
    radius: options.radius ?? 2.5,
    projectileSpeed: options.projectileSpeed ?? 18,
    projectileCount: options.projectileCount ?? 1,
    durationSeconds: options.durationSeconds ?? 0,
  };
}

// Keep ids/stars/maxHealth/healthRegen in sync with CHARACTER_STATS in spacetimedb/src/index.ts.
export const CHARACTERS: Record<string, CharacterDefinition> = {
  aeris: {
    id: 'aeris',
    displayName: 'Aeris',
    title: 'Vēja dejotāja',
    stars: 5,
    element: 'anemo',
    weapon: 'sword',
    moveSpeed: 7.5,
    maxHealth: 950,
    healthRegen: 0,
    hairColor: 0xd8f5e8,
    skill: skill('wind-spiral', 'Vēja spirāle', 'dash', 140, 6, { radius: 2.5 }),
  },
  terron: {
    id: 'terron',
    displayName: 'Terrons',
    title: 'Klints sargs',
    stars: 5,
    element: 'geo',
    weapon: 'greatsword',
    moveSpeed: 6,
    maxHealth: 1400,
    healthRegen: 0,
    hairColor: 0x6b4a2f,
    skill: skill('earthquake', 'Zemestrīce', 'nova', 220, 10, { radius: 5 }),
  },
  volta: {
    id: 'volta',
    displayName: 'Volta',
    title: 'Negaisa grāmatniece',
    stars: 5,
    element: 'electro',
    weapon: 'book',
    moveSpeed: 6.8,
    maxHealth: 1000,
    healthRegen: 0,
    hairColor: 0x7a4fd8,
    skill: skill('lightning-lances', 'Zibens šķēpi', 'volley', 90, 8, {
      projectileCount: 5,
      projectileSpeed: 20,
      radius: 1.6,
    }),
  },
  silva: {
    id: 'silva',
    displayName: 'Silva',
    title: 'Meža acs',
    stars: 5,
    element: 'dendro',
    weapon: 'bow',
    moveSpeed: 7,
    maxHealth: 1050,
    healthRegen: 8,
    hairColor: 0x3f7d2c,
    skill: skill('life-arrow', 'Dzīvības bulta', 'projectile', 180, 7, {
      projectileSpeed: 26,
      radius: 3,
    }),
  },
  marina: {
    id: 'marina',
    displayName: 'Marina',
    title: 'Plūdu valdniece',
    stars: 5,
    element: 'hydro',
    weapon: 'spear',
    moveSpeed: 6.8,
    maxHealth: 1150,
    healthRegen: 12,
    hairColor: 0x2c5f9e,
    skill: skill('water-ring', 'Ūdens aplis', 'ring', 45, 12, { radius: 4, durationSeconds: 4 }),
  },
  ignis: {
    id: 'ignis',
    displayName: 'Ignis',
    title: 'Liesmu ģenerālis',
    stars: 5,
    element: 'pyro',
    weapon: 'greatsword',
    moveSpeed: 6.2,
    maxHealth: 1300,
    healthRegen: 0,
    hairColor: 0xb32a10,
    skill: skill('firestorm', 'Uguns vētra', 'nova', 200, 9, { radius: 4.5 }),
  },
  sarma: {
    id: 'sarma',
    displayName: 'Sarma',
    title: 'Ziemas elpa',
    stars: 5,
    element: 'cryo',
    weapon: 'sword',
    moveSpeed: 7.2,
    maxHealth: 1000,
    healthRegen: 0,
    hairColor: 0xe8f6ff,
    skill: skill('ice-needles', 'Ledus adatas', 'volley', 70, 6, {
      projectileCount: 3,
      projectileSpeed: 22,
      radius: 1.4,
    }),
  },
  zefs: {
    id: 'zefs',
    displayName: 'Zefs',
    title: 'Brīvais klejotājs',
    stars: 4,
    element: 'anemo',
    weapon: 'book',
    moveSpeed: 7.2,
    maxHealth: 900,
    healthRegen: 0,
    hairColor: 0x8fd8c0,
    skill: skill('vortex-orb', 'Virpuļsfēra', 'projectile', 110, 5, {
      projectileSpeed: 14,
      radius: 2.5,
    }),
  },
  petra: {
    id: 'petra',
    displayName: 'Petra',
    title: 'Akmens dūre',
    stars: 4,
    element: 'geo',
    weapon: 'spear',
    moveSpeed: 6.4,
    maxHealth: 1200,
    healthRegen: 0,
    hairColor: 0x9c7b52,
    skill: skill('stone-strike', 'Akmens trieciens', 'dash', 130, 7, { radius: 2.2 }),
  },
  zibo: {
    id: 'zibo',
    displayName: 'Zibo',
    title: 'Dzirksteļu zēns',
    stars: 4,
    element: 'electro',
    weapon: 'sword',
    moveSpeed: 7,
    maxHealth: 1000,
    healthRegen: 0,
    hairColor: 0x4a3a6e,
    skill: skill('static-field', 'Statiskais lauks', 'nova', 120, 6, { radius: 3.5 }),
  },
  lapa: {
    id: 'lapa',
    displayName: 'Lapa',
    title: 'Zāļu zinātāja',
    stars: 4,
    element: 'dendro',
    weapon: 'book',
    moveSpeed: 6.6,
    maxHealth: 950,
    healthRegen: 15,
    hairColor: 0x86b04a,
    skill: skill('spore-cloud', 'Sporu mākonis', 'ring', 35, 10, {
      radius: 3.5,
      durationSeconds: 3,
    }),
  },
  rasa: {
    id: 'rasa',
    displayName: 'Rasa',
    title: 'Rīta migla',
    stars: 4,
    element: 'hydro',
    weapon: 'bow',
    moveSpeed: 7,
    maxHealth: 1000,
    healthRegen: 10,
    hairColor: 0x74b6e8,
    skill: skill('water-drop', 'Ūdens lāse', 'projectile', 140, 5, {
      projectileSpeed: 22,
      radius: 2,
    }),
  },
  dzirkste: {
    id: 'dzirkste',
    displayName: 'Dzirkste',
    title: 'Ugunskura meita',
    stars: 4,
    element: 'pyro',
    weapon: 'spear',
    moveSpeed: 7,
    maxHealth: 1000,
    healthRegen: 0,
    hairColor: 0xe07a30,
    skill: skill('flame-lunge', 'Liesmu izklupiens', 'dash', 150, 6, { radius: 2.4 }),
  },
  stindzis: {
    id: 'stindzis',
    displayName: 'Stindzis',
    title: 'Sala mednieks',
    stars: 4,
    element: 'cryo',
    weapon: 'bow',
    moveSpeed: 7,
    maxHealth: 950,
    healthRegen: 0,
    hairColor: 0xcfe8f0,
    skill: skill('frost-shot', 'Sala šāviens', 'projectile', 150, 6, {
      projectileSpeed: 24,
      radius: 2,
    }),
  },
};

export const CHARACTER_LIST = Object.values(CHARACTERS);
export const STARTER_CHARACTER_ID = 'zibo';
