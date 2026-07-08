import type { ElementId } from './elements';
import type { WeaponId } from './weapons';

export type SkillKind = 'projectile' | 'nova' | 'dash' | 'ring' | 'volley';

// Intrinsic combat role (mirrored in server CHARACTER_STATS; enforced in Phase 6).
export type Role = 'tank' | 'dps' | 'healer' | 'support';

// Single source of role → display metadata (label/color-token/aria/desc) for both
// HUD surfaces (CharacterScreen + CharacterSheet). Do NOT hard-code per character.
// `desc` = practical, plain-language explanation of what the role does in play.
// Where the mechanical payoff lands in a later phase (raid role bonuses = Phase 6/7),
// the text says so honestly ("vēl top" = work in progress) rather than overpromising.
export const ROLE_META: Record<Role, { label: string; token: string; aria: string; desc: string }> = {
  tank: {
    label: 'SARGS', token: '--role-tank', aria: 'Sargs',
    desc: 'Priekšlīnija — iztur vairāk bojājumu, pateicoties izturībai, un notur pretiniekus, lai komanda izdzīvo. Reidu lomu bonusi vēl top.',
  },
  dps: {
    label: 'UZBRUCĒJS', token: '--role-dps', aria: 'Uzbrucējs',
    desc: 'Galvenais bojājumu avots — ātri nogāž pretiniekus, bet ir trausls un paļaujas uz komandu aizsardzībai. Reidu lomu bonusi vēl top.',
  },
  healer: {
    label: 'DZIEDNIEKS', token: '--role-healer', aria: 'Dziednieks',
    desc: 'Uztur komandu kaujā, atjaunojot dzīvību. Komandas dziedēšana ieslēgsies ar daudzspēlētāju reidiem — pagaidām darbojas pašatjaunošanās.',
  },
  support: {
    label: 'ATBALSTS', token: '--role-support', aria: 'Atbalsts',
    desc: 'Pastiprina komandu ar bonusiem un notur pretiniekus grožos. Efekti ieslēgsies ar reidu lomām — vēl top.',
  },
};

// Incoming-damage channels a character can resist. Mirrors DamageType in
// spacetimedb/src/resistances.ts. A multiplier < 1 means damage is reduced
// (0.7 = takes 70%, i.e. 30% resisted); an omitted channel is normal (1.0).
export type DamageChannel = 'melee' | 'ranged' | 'skill' | 'contact';
export type ResistanceProfile = Partial<Record<DamageChannel, number>>;

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
  /** Intrinsic combat role (mirrored in server CHARACTER_STATS). */
  role: Role;
  /** Base critical-hit chance [0,1] (server-rolled in Phase 2). */
  critRate: number;
  /** Critical-hit damage as a FULL multiplier (e.g. 1.9). */
  critDmg: number;
  hairColor: number;
  /** Incoming-damage resistances (multipliers). Absent = no resistances. */
  resistances?: ResistanceProfile;
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

// Keep ids/stars/maxHealth/healthRegen/role in sync with CHARACTER_STATS in spacetimedb/src/index.ts.
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
    role: 'support',
    critRate: 0.20,
    critDmg: 1.60,
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
    role: 'tank',
    critRate: 0.12,
    critDmg: 1.50,
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
    role: 'dps',
    critRate: 0.34,
    critDmg: 1.90,
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
    role: 'dps',
    critRate: 0.33,
    critDmg: 2.00,
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
    role: 'healer',
    critRate: 0.18,
    critDmg: 1.60,
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
    role: 'tank',
    critRate: 0.13,
    critDmg: 1.55,
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
    role: 'dps',
    critRate: 0.32,
    critDmg: 1.95,
    hairColor: 0xe8f6ff,
    skill: skill('ice-needles', 'Ledus adatas', 'volley', 70, 6, {
      projectileCount: 3,
      projectileSpeed: 22,
      radius: 1.4,
    }),
  },
  nereida: {
    id: 'nereida',
    displayName: 'Nereīda',
    title: 'Plūdmaiņu glābēja',
    stars: 5,
    element: 'hydro',
    weapon: 'bow',
    moveSpeed: 7.2,
    maxHealth: 1120,
    healthRegen: 14,
    role: 'healer',
    critRate: 0.19,
    critDmg: 1.65,
    hairColor: 0x2fb6d8,
    // Water cushions her: enemy blows land at 70% (30% resisted).
    resistances: { contact: 0.7 },
    skill: skill('tide-arrow', 'Plūdmaiņu bulta', 'projectile', 165, 7, {
      projectileSpeed: 26,
      radius: 3,
    }),
  },
  vesper: {
    id: 'vesper',
    displayName: 'Vespers',
    title: 'Zibens dueliste',
    stars: 5,
    element: 'electro',
    weapon: 'spear',
    moveSpeed: 7.6,
    maxHealth: 1080,
    healthRegen: 0,
    role: 'dps',
    critRate: 0.36,
    critDmg: 2.10,
    hairColor: 0x9d5cff,
    // Blink-fast: hard to pin (ranged 50%) and slips most blows (contact 85%).
    resistances: { ranged: 0.5, contact: 0.85 },
    skill: skill('storm-lunge', 'Vētras izklupiens', 'dash', 210, 7, { radius: 2.6 }),
  },
  glacia: {
    id: 'glacia',
    displayName: 'Glācija',
    title: 'Ledāja sirds',
    stars: 5,
    element: 'cryo',
    weapon: 'greatsword',
    moveSpeed: 5.8,
    maxHealth: 1550,
    healthRegen: 0,
    role: 'tank',
    critRate: 0.10,
    critDmg: 1.45,
    hairColor: 0xbfeaff,
    // A walking glacier: heavy ice armor cuts melee blows to 55% (45% resisted).
    resistances: { contact: 0.55 },
    skill: skill('glacier-fall', 'Ledāja krišana', 'nova', 240, 10, { radius: 5 }),
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
    role: 'support',
    critRate: 0.22,
    critDmg: 1.70,
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
    role: 'tank',
    critRate: 0.14,
    critDmg: 1.50,
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
    role: 'dps',
    critRate: 0.30,
    critDmg: 1.85,
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
    role: 'healer',
    critRate: 0.17,
    critDmg: 1.55,
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
    role: 'healer',
    critRate: 0.16,
    critDmg: 1.50,
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
    role: 'dps',
    critRate: 0.31,
    critDmg: 1.90,
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
    role: 'dps',
    critRate: 0.35,
    critDmg: 2.05,
    hairColor: 0xcfe8f0,
    skill: skill('frost-shot', 'Sala šāviens', 'projectile', 150, 6, {
      projectileSpeed: 24,
      radius: 2,
    }),
  },
};

export const CHARACTER_LIST = Object.values(CHARACTERS);
export const STARTER_CHARACTER_ID = 'zibo';

export type HealType = 'none' | 'active' | 'passive';
export type HealMode = 'percent' | 'combo' | 'flat';

export interface HealSpec {
  /** 'active' fires on skill cast, 'passive' is an on-field aura (~1/s). */
  type: HealType;
  /** How power is read: 'percent' of max HP, 'combo' HP per combo point, 'flat' HP. */
  mode: HealMode;
  power: number;
}

// Which characters heal the party, and how. Server is the source of truth for
// the actual amount — keep in sync with CHARACTER_STATS in spacetimedb/src/index.ts.
// Hydro characters are healers (with active/passive sub-types); Lapa (dendro) too.
const HEALERS: Record<string, HealSpec> = {
  marina: { type: 'active', mode: 'percent', power: 0.2 },
  nereida: { type: 'active', mode: 'percent', power: 0.2 },
  lapa: { type: 'active', mode: 'combo', power: 6 },
  rasa: { type: 'passive', mode: 'flat', power: 10 },
};

export function healSpecFor(characterId: string): HealSpec {
  return HEALERS[characterId] ?? { type: 'none', mode: 'flat', power: 0 };
}
