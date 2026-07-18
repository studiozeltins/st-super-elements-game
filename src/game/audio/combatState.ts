/**
 * Pure combat-state hysteresis — the single source of truth for the ONE
 * client-side combat signal (D-08) that feeds BOTH the ambience duck (AMBI-06)
 * and the day/night/combat music crossfade (MUSIC-02). ZERO imports (not even
 * three, no WebAudio, no React) so the enter-immediately / exit-after-cooldown
 * behavior is unit-testable without a renderer or an AudioContext — a mirror of
 * the windMath.ts / dayNightMath.ts pure-helper discipline.
 *
 * Deterministic and allocation-free by construction: isInCombat is a single
 * subtraction and comparison, called once per frame in createGame.frame() (10-03)
 * against a `lastCombatAt` stamp the three existing damage callbacks refresh.
 * No table scan, no RNG, no per-frame allocation (Client Performance Rules).
 */

/**
 * Seconds of no combat before the state exits (D-09, playtest-tunable seed).
 * "A few seconds" so brief lulls between hits don't thrash the duck/crossfade;
 * short enough that the world reopens promptly once a fight truly ends.
 */
export const COMBAT_EXIT_COOLDOWN_SECONDS = 5;

/**
 * Is the local player in combat right now? Enter-immediately (a fresh stamp
 * makes `nowS - lastCombatAtS ≈ 0 < cooldown`, so combat is true the instant a
 * hit lands) and exit-after-cooldown (any lull shorter than the window keeps it
 * true, so sub-cooldown gaps between hits never flip it — the hysteresis, D-09).
 * The initial `lastCombatAtS = -Infinity` yields a delta of +Infinity → OUT.
 */
export function isInCombat(nowS: number, lastCombatAtS: number): boolean {
  return nowS - lastCombatAtS < COMBAT_EXIT_COOLDOWN_SECONDS;
}
