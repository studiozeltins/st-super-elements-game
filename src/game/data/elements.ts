export type ElementId =
  | 'anemo'
  | 'geo'
  | 'electro'
  | 'dendro'
  | 'hydro'
  | 'pyro'
  | 'cryo';

export interface ElementDefinition {
  id: ElementId;
  displayName: string;
  color: number;
  cssColor: string;
}

export const ELEMENTS: Record<ElementId, ElementDefinition> = {
  anemo: { id: 'anemo', displayName: 'Vējš', color: 0x4fd8b8, cssColor: '#4fd8b8' },
  geo: { id: 'geo', displayName: 'Zeme', color: 0xf2b03c, cssColor: '#f2b03c' },
  electro: { id: 'electro', displayName: 'Elektrība', color: 0xb06bff, cssColor: '#b06bff' },
  dendro: { id: 'dendro', displayName: 'Daba', color: 0x7ec843, cssColor: '#7ec843' },
  hydro: { id: 'hydro', displayName: 'Ūdens', color: 0x3aa0ff, cssColor: '#3aa0ff' },
  pyro: { id: 'pyro', displayName: 'Uguns', color: 0xff5c3c, cssColor: '#ff5c3c' },
  cryo: { id: 'cryo', displayName: 'Ledus', color: 0xa8e6ff, cssColor: '#a8e6ff' },
};

export interface ReactionDefinition {
  name: string;
  damageMultiplier: number;
  color: number;
  freezes: boolean;
}

interface ReactionRecipe {
  name: string;
  damageMultiplier: number;
  freezes?: boolean;
}

const PAIR_REACTIONS: Record<string, ReactionRecipe> = {
  'hydro+pyro': { name: 'Tvaiks', damageMultiplier: 1.6 },
  'cryo+pyro': { name: 'Kausējums', damageMultiplier: 2.0 },
  'dendro+pyro': { name: 'Degums', damageMultiplier: 1.5 },
  'electro+pyro': { name: 'Pārslodze', damageMultiplier: 1.75 },
  'electro+hydro': { name: 'Elektrouzlāde', damageMultiplier: 1.5 },
  'cryo+hydro': { name: 'Sasalums', damageMultiplier: 1.4, freezes: true },
  'dendro+hydro': { name: 'Ziedēšana', damageMultiplier: 1.6 },
  'cryo+electro': { name: 'Supravade', damageMultiplier: 1.6 },
  'dendro+electro': { name: 'Katalīze', damageMultiplier: 1.5 },
  'cryo+dendro': { name: 'Sarmojums', damageMultiplier: 1.3 },
};

const SWIRL_REACTION: ReactionRecipe = { name: 'Izkliede', damageMultiplier: 1.3 };
const CRYSTALLIZE_REACTION: ReactionRecipe = { name: 'Kristalizācija', damageMultiplier: 1.15 };

/** Blends two element colors into the reaction's "new color". */
export function mixElementColors(colorA: number, colorB: number): number {
  const red = Math.min(255, (((colorA >> 16) & 0xff) + ((colorB >> 16) & 0xff)) * 0.65);
  const green = Math.min(255, (((colorA >> 8) & 0xff) + ((colorB >> 8) & 0xff)) * 0.65);
  const blue = Math.min(255, ((colorA & 0xff) + (colorB & 0xff)) * 0.65);
  return (Math.round(red) << 16) | (Math.round(green) << 8) | Math.round(blue);
}

function findRecipe(auraElement: ElementId, incomingElement: ElementId): ReactionRecipe | null {
  const pairKey = [auraElement, incomingElement].sort().join('+');
  const pairRecipe = PAIR_REACTIONS[pairKey];
  if (pairRecipe) return pairRecipe;
  if (auraElement === 'anemo' || incomingElement === 'anemo') return SWIRL_REACTION;
  if (auraElement === 'geo' || incomingElement === 'geo') return CRYSTALLIZE_REACTION;
  return null;
}

export function resolveReaction(
  auraElement: ElementId,
  incomingElement: ElementId
): ReactionDefinition | null {
  if (auraElement === incomingElement) return null;
  const recipe = findRecipe(auraElement, incomingElement);
  if (!recipe) return null;
  return {
    name: recipe.name,
    damageMultiplier: recipe.damageMultiplier,
    color: mixElementColors(ELEMENTS[auraElement].color, ELEMENTS[incomingElement].color),
    freezes: recipe.freezes ?? false,
  };
}
