import type { WeaponId } from './weapons';

// Banner + weapon catalog + pity math for the wish system.
// The server holds its own copy of the ids/rates in spacetimedb/src/index.ts —
// keep the two in sync (a test guards the weapon ids and banner featured chars).

export type WeaponRarity = 3 | 4 | 5;

export interface GachaWeapon {
  id: string;
  displayName: string;
  rarity: WeaponRarity;
  /** Reuses the character weapon shapes for icons/3D. */
  type: WeaponId;
}

// Pulled weapons currently do nothing in combat — they only fill the inventory.
export const GACHA_WEAPONS: GachaWeapon[] = [
  { id: 'debesu-zobens', displayName: 'Debesu zobens', rarity: 5, type: 'sword' },
  { id: 'vilku-kaps', displayName: 'Vilku kaps', rarity: 5, type: 'greatsword' },
  { id: 'amosa-loks', displayName: 'Amosa loks', rarity: 5, type: 'bow' },
  { id: 'homas-skeptrs', displayName: 'Homas skeptrs', rarity: 5, type: 'spear' },
  { id: 'zudusi-lugsna', displayName: 'Zudusī lūgšana', rarity: 5, type: 'book' },
  { id: 'saules-zobens', displayName: 'Saules zobens', rarity: 4, type: 'sword' },
  { id: 'kalna-cirvis', displayName: 'Kalna cirvis', rarity: 4, type: 'greatsword' },
  { id: 'kara-loks', displayName: 'Kara loks', rarity: 4, type: 'bow' },
  { id: 'lietus-skeps', displayName: 'Lietus šķēps', rarity: 4, type: 'spear' },
  { id: 'veja-gramata', displayName: 'Vēja grāmata', rarity: 4, type: 'book' },
  { id: 'koka-zobens', displayName: 'Koka zobens', rarity: 3, type: 'sword' },
  { id: 'mednieka-loks', displayName: 'Mednieka loks', rarity: 3, type: 'bow' },
  { id: 'dzelzs-skeps', displayName: 'Dzelzs šķēps', rarity: 3, type: 'spear' },
];

export const WEAPONS_BY_ID: Record<string, GachaWeapon> = Object.fromEntries(
  GACHA_WEAPONS.map(weapon => [weapon.id, weapon])
);

export interface BannerDef {
  id: string;
  displayName: string;
  subtitle: string;
  featuredCharacterId: string;
  lore: string;
}

export const BANNERS: BannerDef[] = [
  {
    id: 'wind',
    displayName: 'Vēja Solījums',
    subtitle: 'Pastiprināta parādīšanās',
    featuredCharacterId: 'aeris',
    lore:
      'Kur vējš griežas, tur Aeris dejo. Katrs viņas solis ir vētras čuksts, ' +
      'katra kustība — brīvības zvērests. Debesis pieder tiem, kas nebaidās krist.',
  },
  {
    id: 'flame',
    displayName: 'Liesmu Ceļš',
    subtitle: 'Pastiprināta parādīšanās',
    featuredCharacterId: 'ignis',
    lore:
      'Ignis nesa liesmu cauri tūkstoš kaujām un nekad nepazuda tumsā. ' +
      'Viņa uguns nav iznīcība — tā ir apņēmība, kas izkausē pat dzelzi.',
  },
  {
    id: 'flood',
    displayName: 'Plūdu Dziesma',
    subtitle: 'Pastiprināta parādīšanās',
    featuredCharacterId: 'marina',
    lore:
      'Marina valda pār plūdiem, kas apraka veselas pilsētas. Mierīga kā spogulis, ' +
      'nežēlīga kā vilnis — okeāns klausa tikai viņas balsij.',
  },
];

/** Rarity → accent colors, shared by CSS classes and the 3D/canvas reveal. */
export const RARITY_CSS: Record<number, string> = { 3: '#7aa7d8', 4: '#b98cff', 5: '#f2c14e' };
export const RARITY_HEX: Record<number, number> = { 3: 0x7aa7d8, 4: 0xb98cff, 5: 0xf2c14e };

export const BANNERS_BY_ID: Record<string, BannerDef> = Object.fromEntries(
  BANNERS.map(banner => [banner.id, banner])
);

// ---- Pity math (mirror of the server roll in spacetimedb/src/index.ts) ----
export const FIVE_STAR_BASE_RATE = 0.006;
export const SOFT_PITY_START = 74; // this pull number onward, odds ramp up
export const HARD_PITY = 90; // guaranteed 5★ on this pull
export const SOFT_PITY_STEP = 0.06;
export const FOUR_STAR_PITY = 10;

/** 5★ probability of the NEXT pull, given pulls already done since the last 5★. */
export function fiveStarChanceForNextPull(pullsSinceFiveStar: number): number {
  const pullNumber = pullsSinceFiveStar + 1;
  if (pullNumber >= HARD_PITY) return 1;
  if (pullNumber < SOFT_PITY_START) return FIVE_STAR_BASE_RATE;
  return Math.min(1, FIVE_STAR_BASE_RATE + (pullNumber - (SOFT_PITY_START - 1)) * SOFT_PITY_STEP);
}
