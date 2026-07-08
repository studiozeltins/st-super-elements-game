/** Visual category of a damage number — drives its color and size. */
export type DamageKind =
  | 'normal'
  | 'skill'
  | 'crit'
  | 'reaction'
  | 'taken'
  | 'takenCrit'
  | 'pvp'
  | 'heal';

export interface DamageKindStyle {
  cssColor: string;
  /** Base font scale relative to a normal hit. */
  fontScale: number;
}

export const DAMAGE_KIND_STYLES: Record<DamageKind, DamageKindStyle> = {
  normal: { cssColor: '#f4f1e8', fontScale: 1 },
  skill: { cssColor: '#7ec8ff', fontScale: 1.2 },
  crit: { cssColor: '#ff2bd6', fontScale: 1.85 },
  reaction: { cssColor: '#ff8bd0', fontScale: 1.4 },
  // Damage the local player receives: red from enemies (bigger on crit),
  // purple from other players. Heals show green with a + prefix.
  taken: { cssColor: '#ff5c3c', fontScale: 1 },
  takenCrit: { cssColor: '#ff5c3c', fontScale: 1.7 },
  pvp: { cssColor: '#c07dff', fontScale: 1.15 },
  heal: { cssColor: '#7ec843', fontScale: 1 },
};
