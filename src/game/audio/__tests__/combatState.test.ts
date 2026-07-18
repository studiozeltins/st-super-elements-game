import { describe, expect, it } from 'vitest';
import { COMBAT_EXIT_COOLDOWN_SECONDS, isInCombat } from '../combatState';

// The combat-state signal is a pure enter-immediately / exit-after-cooldown
// hysteresis (D-08/D-09) — ONE signal that later feeds BOTH the ambience duck
// (AMBI-06) and the music crossfade (MUSIC-02). We pin BEHAVIOR (the hysteresis
// contract), not the magic cooldown value, except the one boundary test that
// documents the cooldown as a contract. Mirror of the windMath/dayNightMath twins.

describe('isInCombat enter-immediately (D-09, AMBI-06/MUSIC-02)', () => {
  it('is IN combat the instant a stamp lands (delta 0 < cooldown)', () => {
    for (const nowS of [0, 12.5, 3599.9]) {
      // A fresh stamp makes nowS - lastCombatAt ≈ 0 — combat enters at once.
      expect(isInCombat(nowS, nowS)).toBe(true);
    }
  });
});

describe('isInCombat exit-after-cooldown (D-09)', () => {
  it('stays IN combat while the lull is shorter than the cooldown', () => {
    const lastCombatAtS = 100;
    // Just under the window — still in combat (the duck/crossfade must hold).
    expect(isInCombat(lastCombatAtS + COMBAT_EXIT_COOLDOWN_SECONDS - 0.001, lastCombatAtS)).toBe(
      true
    );
  });

  it('exits combat once the lull reaches or exceeds the cooldown', () => {
    const lastCombatAtS = 100;
    // At the boundary the delta is no longer strictly less than the window.
    expect(isInCombat(lastCombatAtS + COMBAT_EXIT_COOLDOWN_SECONDS, lastCombatAtS)).toBe(false);
    // Well past the window — firmly out of combat.
    expect(isInCombat(lastCombatAtS + COMBAT_EXIT_COOLDOWN_SECONDS + 30, lastCombatAtS)).toBe(false);
  });
});

describe('isInCombat initial state', () => {
  it('is OUT of combat before any stamp (lastCombatAt = -Infinity) at any finite time', () => {
    for (const nowS of [0, 5, 250.75, 100000]) {
      expect(isInCombat(nowS, -Infinity)).toBe(false);
    }
  });
});

describe('isInCombat hysteresis absorbs brief lulls', () => {
  it('a lull shorter than the cooldown between two stamps never flips to OUT', () => {
    // Two combat stamps separated by a sub-cooldown gap: sample the whole gap and
    // assert it never drops out — brief lulls must not thrash the duck/crossfade.
    const firstStamp = 40;
    const gap = COMBAT_EXIT_COOLDOWN_SECONDS - 1; // strictly shorter than the window
    const secondStamp = firstStamp + gap;
    for (let nowS = firstStamp; nowS <= secondStamp; nowS += 0.25) {
      // Before the second stamp lands, the state is still driven by the first.
      expect(isInCombat(nowS, firstStamp)).toBe(true);
    }
    // The second stamp refreshes the window — combat continues seamlessly.
    expect(isInCombat(secondStamp, secondStamp)).toBe(true);
  });
});

describe('COMBAT_EXIT_COOLDOWN_SECONDS contract', () => {
  it('is a positive, finite, few-seconds playtest seed', () => {
    expect(Number.isFinite(COMBAT_EXIT_COOLDOWN_SECONDS)).toBe(true);
    expect(COMBAT_EXIT_COOLDOWN_SECONDS).toBeGreaterThan(0);
    // A "few seconds of no combat" per D-09 — not sub-second, not a full minute.
    expect(COMBAT_EXIT_COOLDOWN_SECONDS).toBeGreaterThanOrEqual(2);
    expect(COMBAT_EXIT_COOLDOWN_SECONDS).toBeLessThanOrEqual(15);
  });
});
