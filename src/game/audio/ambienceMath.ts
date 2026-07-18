/**
 * Pure ambience math — the single source of truth for every playtest-tunable
 * constant and every branch worth a regression test in the Phase-10 ambience
 * layer (D-05/D-10/D-11, AMBI-02/03/05/07). ZERO imports (not even three, no
 * WebAudio, no React) so the bed-gain map, the one-shot scheduler timing/jitter,
 * the goliath-grunt proximity falloff, and the day/night creature gates are all
 * unit-testable in ~5s of vitest without an AudioContext — a mirror of the
 * windMath.ts / dayNightMath.ts pure-helper discipline.
 *
 * The imperative wrapper (createAmbience, 10-03) only turns these numbers into
 * AudioParam writes / AudioBufferSourceNodes; the math can never drift from its
 * tests. Every constant here is a SEED — expect playtest revision (the
 * seed-then-tune idiom heavy in createAudioSystem.ts). Deterministic and
 * allocation-free: callers supply Math.random() so the functions stay pure.
 */

// ── One-shot scheduler timing (AMBI-03/05, D-10) ────────────────────────────

/** Bird chirp window, seconds — AMBI-03's 5-15s randomized cadence (day layer). */
export const BIRD_MIN_S = 5;
export const BIRD_MAX_S = 15;

/**
 * Goliath grunt window, seconds — long, occasional intervals so distant camps
 * feel like a rare threat rumble, not a loop (AMBI-05). Seeded well above the
 * bird window; playtest-tunable.
 */
export const GRUNT_MIN_S = 25;
export const GRUNT_MAX_S = 60;

/**
 * Delay until the NEXT one-shot: a uniform pick in [minS, maxS). NEVER a fixed
 * interval (the metronome anti-pattern explicitly out of scope) — the caller
 * supplies `rand = Math.random()` so successive delays vary. rand=0 → minS,
 * rand→1 → approaches maxS. Kept pure (rand injected) for the vitest twin.
 */
export function nextOneShotDelay(minS: number, maxS: number, rand: number): number {
  return minS + (maxS - minS) * rand;
}

// ── Per-shot jitter (AMBI-03) ───────────────────────────────────────────────

/**
 * Pure twin of audioCore.jitter: a 1 ± spread multiplier for per-shot pitch /
 * pan / volume so no two chirps are identical (±10-20% per AMBI-03). rand=0.5 is
 * exactly 1 (centered), rand=0 the low edge (1-spread), rand=1 the high edge
 * (1+spread). audioCore.jitter is this with rand = Math.random() baked in.
 */
export function jitterFactor(spread: number, rand: number): number {
  return 1 + (rand * 2 - 1) * spread;
}

// ── Continuous wind bed gain (AMBI-02, D-05) ────────────────────────────────

/**
 * Base bed loudness with NO gust passing. Audible on its own — the gust envelope
 * rests near 0 between events (gusts are ~30-60s apart per windMath), so the bed
 * must sustain a continuous presence and the swell is a bonus on top (D-05).
 */
export const BED_BASE_GAIN = 0.25;

/** Extra loudness added at a full gust — the swell that sidechains getGustEnvelope(). */
export const BED_SWELL_GAIN = 0.35;

/**
 * Target bed gain for a given gust envelope value (0..1): base + swell·gust.
 * Monotonic non-decreasing, strictly > 0 at gust=0 (continuous bed), and
 * base+swell at a full gust (AMBI-02 sidechain map). The wrapper smooths this
 * onto the bed's inner GainNode via setTargetAtTime so it never zippers.
 */
export function bedGainTarget(gust: number): number {
  return BED_BASE_GAIN + BED_SWELL_GAIN * gust;
}

// ── Goliath grunt proximity falloff (AMBI-05) ───────────────────────────────

/** Within this distance to the nearest camp the grunt plays at full gain. */
export const GRUNT_NEAR_RADIUS = 12;

/** At or beyond this distance the grunt is inaudible (gain 0). */
export const GRUNT_FAR_RADIUS = 60;

/**
 * Grunt gain from nearest-camp distance: 1 at/inside the near radius, 0
 * at/beyond the far radius, linearly interpolated (and clamped to [0,1])
 * between — a distant threat that swells as you approach a goliath camp
 * (AMBI-05). Degenerate near==far collapses to a hard step at that radius.
 */
export function gruntProximityGain(distance: number): number {
  if (distance <= GRUNT_NEAR_RADIUS) return 1;
  if (distance >= GRUNT_FAR_RADIUS) return 0;
  return (GRUNT_FAR_RADIUS - distance) / (GRUNT_FAR_RADIUS - GRUNT_NEAR_RADIUS);
}

// ── Day/night creature gates (AMBI-07, D-11) ────────────────────────────────

/**
 * Phase01 thresholds that partition the day/night cycle into a bird (day) window
 * and a cricket/owl (night) window. Aligned to the dayNightMath keyframes: the
 * dawn key (0.12) opens the day band, the night key (0.82) closes it — birds
 * sing across [DAY_START, NIGHT_START), night creatures across the complement so
 * there is NO overlap and NO silent gap (every phase is day OR night, D-11).
 */
export const DAY_START_PHASE = 0.12;
export const NIGHT_START_PHASE = 0.82;

/** True across the daytime band — the birds' scheduler `active()` gate (AMBI-07). */
export function isBirdTime(phase01: number): boolean {
  return phase01 >= DAY_START_PHASE && phase01 < NIGHT_START_PHASE;
}

/**
 * True across the night band — the crickets/owl `active()` gate. The exact
 * complement of isBirdTime so the two partition [0,1): mutually exclusive AND
 * exhaustive, never both silent, never both playing (AMBI-07/D-11).
 */
export function isNightCreatureTime(phase01: number): boolean {
  return !isBirdTime(phase01);
}
