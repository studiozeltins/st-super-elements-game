/** Visual category of a damage number — drives its color and size. */
export type DamageKind = 'normal' | 'skill' | 'crit' | 'reaction';

export interface DamageKindStyle {
  cssColor: string;
  /** Base font scale relative to a normal hit. */
  fontScale: number;
}

export const DAMAGE_KIND_STYLES: Record<DamageKind, DamageKindStyle> = {
  normal: { cssColor: '#f4f1e8', fontScale: 1 },
  skill: { cssColor: '#7ec8ff', fontScale: 1.2 },
  crit: { cssColor: '#ffcc33', fontScale: 1.85 },
  reaction: { cssColor: '#ff8bd0', fontScale: 1.4 },
};
