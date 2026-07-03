import { describe, expect, it } from 'vitest';
import { DAMAGE_KIND_STYLES, type DamageKind } from '../damageKind';

const ALL_KINDS: readonly DamageKind[] = ['normal', 'skill', 'crit', 'reaction'];
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

describe('DAMAGE_KIND_STYLES', () => {
  it('has an entry for every damage kind', () => {
    for (const kind of ALL_KINDS) {
      expect(DAMAGE_KIND_STYLES[kind]).toBeDefined();
    }
  });

  it('uses a valid #rrggbb cssColor for every kind', () => {
    for (const kind of ALL_KINDS) {
      expect(DAMAGE_KIND_STYLES[kind].cssColor).toMatch(HEX_COLOR);
    }
  });

  it('gives crit the largest fontScale', () => {
    const critScale = DAMAGE_KIND_STYLES.crit.fontScale;
    for (const kind of ALL_KINDS) {
      if (kind === 'crit') continue;
      expect(critScale).toBeGreaterThan(DAMAGE_KIND_STYLES[kind].fontScale);
    }
  });

  it('anchors the normal fontScale at 1', () => {
    expect(DAMAGE_KIND_STYLES.normal.fontScale).toBe(1);
  });
});
