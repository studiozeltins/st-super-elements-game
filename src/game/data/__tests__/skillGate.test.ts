import { describe, expect, it } from 'vitest';

// Import the real helpers across the package boundary (server module → client vitest
// runner), same mechanism as crit.test.ts — not a local re-implementation.
import { skillGrantActive, nextSkillReadyAt } from '../../../../spacetimedb/src/skillGate';

describe('skillGrantActive', () => {
  it('grants when isSkill and now is inside the window', () => {
    expect(skillGrantActive(true, 100n, 200n)).toBe(true);
  });

  it('boundary: now exactly equal to the window end STILL grants (inclusive <=)', () => {
    expect(skillGrantActive(true, 200n, 200n)).toBe(true);
  });

  it('boundary: one micro past the window end does NOT grant', () => {
    expect(skillGrantActive(true, 201n, 200n)).toBe(false);
  });

  it('never grants when isSkill is false, even inside the window', () => {
    expect(skillGrantActive(false, 100n, 200n)).toBe(false);
  });
});

describe('nextSkillReadyAt', () => {
  it('returns now + cooldownSeconds*1_000_000 as a bigint', () => {
    expect(nextSkillReadyAt(1_000_000n, 6)).toBe(7_000_000n);
  });

  it('rounds the seconds*1e6 product (fractional cooldown)', () => {
    expect(nextSkillReadyAt(0n, 0.45)).toBe(450_000n);
  });
});
