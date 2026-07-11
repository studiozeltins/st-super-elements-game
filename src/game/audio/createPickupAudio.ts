// Procedural pickup + death SFX: the gem-streak chime ladder, the rare-shard
// gain/loss stingers, and the player death knell. Pickups are REWARD audio —
// bright, short, quiet (the combat layer owns the loudness budget); the death
// knell is the one heavy sound here, deliberately worse than playerHurt.

import { createNoiseSource, jitter } from './audioCore';

export interface PickupAudio {
  /** Gem collect chime, amount-aware. Small pickups play ONE chime on the streak ladder; every full 100 gems adds a staggered chime (capped), each stepping the ladder up — a slot-machine payout for big drops. */
  playGemPickup(amount?: number): void;
  /** Rare shard collected: distinctly richer than a gem (small ascending arpeggio / bloom). */
  playShardGain(): void;
  /** Shard LOST (pvp theft/death): descending minor fall — unmistakably bad. */
  playShardLoss(): void;
  /** Player death: somber low sound (deep descending tone + soft dark swell, ~1s). */
  playDeath(): void;
  dispose(): void;
}

// Gem streak ladder: consecutive pickups inside the window climb a pentatonic
// ratio table (octave-extended); a gap resets to the base chime.
const GEM_BASE_HZ = 740;
export const GEM_STREAK_WINDOW_SECONDS = 1.5;
// High enough that a full payout burst climbs the whole way (playtest
// 2026-07-12: 8 capped mid-burst — big drops flatlined). Step 12 ≈ 3.7kHz.
export const GEM_LADDER_MAX_STEPS = 12;
/** Major-pentatonic ratios across one octave; the ladder re-enters them ×2 above. */
const GEM_LADDER_RATIOS = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3] as const;

/** PURE: pitch multiplier for streak step n — monotonically rising, capped at GEM_LADDER_MAX_STEPS. */
export function gemLadderRatio(step: number): number {
  const clamped = Math.min(GEM_LADDER_MAX_STEPS, Math.max(0, Math.floor(step)));
  const octave = Math.floor(clamped / GEM_LADDER_RATIOS.length);
  return GEM_LADDER_RATIOS[clamped % GEM_LADDER_RATIOS.length] * 2 ** octave;
}

/** PURE: next streak step — resets to 0 after a gap past the window, else climbs one rung (capped). */
export function nextGemStep(previousStep: number, secondsSinceLast: number): number {
  if (secondsSinceLast > GEM_STREAK_WINDOW_SECONDS) return 0;
  return Math.min(GEM_LADDER_MAX_STEPS, Math.max(0, Math.floor(previousStep)) + 1);
}

// Big-pickup payout, modelled on the gacha ShardCounter the playtests keep
// praising (2026-07-12 ×3): 130ms ticks, one chime per full 100 gems, cap 24
// — a 6,000-gem drop counts up for ~3s instead of blinking past.
export const GEM_CHIME_PER_AMOUNT = 100;
export const GEM_BURST_MAX_CHIMES = 24;
export const GEM_BURST_SPACING_SECONDS = 0.13;

/** PURE: chimes a pickup of `amount` gems earns — min 1, one per full 100, capped. */
export function gemChimeCount(amount: number): number {
  if (!Number.isFinite(amount)) return 1;
  return Math.min(GEM_BURST_MAX_CHIMES, Math.max(1, Math.floor(amount / GEM_CHIME_PER_AMOUNT)));
}

/** PURE: seconds a payout burst lasts — the HUD counter roll syncs to this. */
export function gemBurstSeconds(amount: number): number {
  return (gemChimeCount(amount) - 1) * GEM_BURST_SPACING_SECONDS;
}

// Gem chime voicing. The jitter is TINY on purpose (±2%) — the ladder's rungs
// are the reward read and must never drown in randomness.
const GEM_MERGE_SECONDS = 0.05;
const GEM_MERGE_BOOST = 0.15;
const GEM_MERGE_BOOST_CAP = 3;
const GEM_SECONDS = 0.15;
const GEM_PEAK = 0.25;
const GEM_JITTER = 0.02;

// Payout-burst voicing = the ShardCounter bell verbatim (ui/pullSounds
// playChime): warm 660Hz triangle + octave shimmer, 0.4s decay, rising a
// QUARTER-TONE per tick capped one octave up — the smooth climb is the loved
// part, so bursts skip the pentatonic ladder entirely.
const PAYOUT_BASE_HZ = 660;
const PAYOUT_PEAK = 0.3;
const PAYOUT_DECAY_SECONDS = 0.4;

// Shard gain: quick ascending arpeggio + a soft high shimmer = "rare loot".
const SHARD_GAIN_NOTES_HZ = [520, 660, 880] as const;
const SHARD_GAIN_SPACING_SECONDS = 0.06;
const SHARD_GAIN_PEAK = 0.28;
const SHARD_GAIN_DECAY_SECONDS = 0.24;

// Shard loss: slow detuned minor fall — longer decay than the gain arpeggio,
// and the beat of the detuned pair per note is what reads "wrong/sad".
const SHARD_LOSS_NOTES_HZ = [660, 520, 392] as const;
const SHARD_LOSS_SPACING_SECONDS = 0.12;
const SHARD_LOSS_PEAK = 0.24;
const SHARD_LOSS_DECAY_SECONDS = 0.5;
const SHARD_LOSS_DETUNE = 1.012;

// Death knell: deep descending tone + a dark lowpassed swell, ~1s total —
// heavier and far longer than playerHurt's 0.24s thud.
const DEATH_TONE_START_HZ = 180;
const DEATH_TONE_END_HZ = 55;
const DEATH_TONE_SECONDS = 0.9;
const DEATH_TONE_PEAK = 0.65;
const DEATH_SWELL_SECONDS = 1.1;
const DEATH_SWELL_LOWPASS_HZ = 220;
const DEATH_SWELL_PEAK = 0.4;

export function createPickupAudio(getContext: () => AudioContext | null): PickupAudio {
  let gemStep = 0;
  let lastGemAt = -Infinity;
  let gemMergeNextAt = -Infinity;
  let gemMerged = 0;

  function ready(): AudioContext | null {
    const context = getContext();
    return context && context.state === 'running' ? context : null;
  }

  /** One melodic note: fast attack, exponential decay, straight to the destination. */
  function playNote(
    context: AudioContext,
    type: OscillatorType,
    frequency: number,
    peak: number,
    startAt: number,
    decaySeconds: number
  ) {
    const note = context.createOscillator();
    note.type = type;
    note.frequency.value = frequency;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + decaySeconds);
    note.connect(gain).connect(context.destination);
    note.start(startAt);
    note.stop(startAt + decaySeconds + 0.02);
  }

  /** One gem chime (triangle body + faint octave sheen) at the given ladder step. */
  function playGemChime(context: AudioContext, startAt: number, step: number, boost: number) {
    const frequency = GEM_BASE_HZ * gemLadderRatio(step) * jitter(GEM_JITTER);
    playNote(context, 'triangle', frequency, GEM_PEAK * boost, startAt, GEM_SECONDS);
    // Faint octave sheen keeps the chime glassy without raising the peak much.
    playNote(context, 'sine', frequency * 2, 0.07 * boost, startAt, GEM_SECONDS * 0.6);
  }

  /** One payout tick: the warm ShardCounter bell at burst step n (quarter-tone rise, octave cap). */
  function playPayoutChime(context: AudioContext, startAt: number, step: number) {
    const frequency = PAYOUT_BASE_HZ * Math.min(2, 2 ** (step / 24)) * jitter(GEM_JITTER);
    playNote(context, 'triangle', frequency, PAYOUT_PEAK, startAt, PAYOUT_DECAY_SECONDS);
    playNote(context, 'sine', frequency * 2, PAYOUT_PEAK * 0.35, startAt, 0.25);
  }

  function playGemPickup(amount = 0) {
    const context = ready();
    if (!context) return;
    const now = context.currentTime;
    const chimes = gemChimeCount(amount);
    if (chimes > 1) {
      // ShardCounter-style payout: warm bells ticking up a quarter-tone per
      // step. Never merge-throttled — a big drop always counts itself out.
      for (let chime = 0; chime < chimes; chime++) {
        playPayoutChime(context, now + chime * GEM_BURST_SPACING_SECONDS, chime);
      }
      // The streak ladder + merge gate continue from the burst's LAST chime.
      gemStep = GEM_LADDER_MAX_STEPS;
      lastGemAt = now + (chimes - 1) * GEM_BURST_SPACING_SECONDS;
      gemMerged = 0;
      gemMergeNextAt = lastGemAt + GEM_MERGE_SECONDS;
      return;
    }
    // The ladder advances on EVERY pickup — merged (throttled) plays included —
    // so a vacuumed burst still lands its next audible chime higher up.
    gemStep = nextGemStep(gemStep, now - lastGemAt);
    lastGemAt = now;
    if (now < gemMergeNextAt) {
      gemMerged = Math.min(GEM_MERGE_BOOST_CAP, gemMerged + 1);
      return;
    }
    const boost = 1 + gemMerged * GEM_MERGE_BOOST;
    gemMerged = 0;
    gemMergeNextAt = now + GEM_MERGE_SECONDS;
    playGemChime(context, now, gemStep, boost);
  }

  function playShardGain() {
    const context = ready();
    if (!context) return;
    const now = context.currentTime;
    SHARD_GAIN_NOTES_HZ.forEach((frequency, index) => {
      playNote(
        context,
        'triangle',
        frequency * jitter(0.01),
        SHARD_GAIN_PEAK,
        now + index * SHARD_GAIN_SPACING_SECONDS,
        SHARD_GAIN_DECAY_SECONDS
      );
    });
    // Soft sparkle blooming over the arpeggio's tail — the "rare" sheen.
    const sparkle = createNoiseSource(context, 0.3);
    const high = context.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 3200;
    const sparkleGain = context.createGain();
    sparkleGain.gain.setValueAtTime(0.0001, now + 0.08);
    sparkleGain.gain.exponentialRampToValueAtTime(0.06, now + 0.14);
    sparkleGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
    sparkle.connect(high).connect(sparkleGain).connect(context.destination);
    sparkle.start(now + 0.08);
    sparkle.stop(now + 0.38);
  }

  function playShardLoss() {
    const context = ready();
    if (!context) return;
    const now = context.currentTime;
    SHARD_LOSS_NOTES_HZ.forEach((frequency, index) => {
      const startAt = now + index * SHARD_LOSS_SPACING_SECONDS;
      playNote(context, 'triangle', frequency, SHARD_LOSS_PEAK / 2, startAt, SHARD_LOSS_DECAY_SECONDS);
      playNote(
        context,
        'triangle',
        frequency * SHARD_LOSS_DETUNE,
        SHARD_LOSS_PEAK / 2,
        startAt,
        SHARD_LOSS_DECAY_SECONDS
      );
    });
  }

  function playDeath() {
    const context = ready();
    if (!context) return;
    const now = context.currentTime;
    // Deep falling tone — the "everything drains out" read.
    const fall = context.createOscillator();
    fall.type = 'sine';
    fall.frequency.setValueAtTime(DEATH_TONE_START_HZ, now);
    fall.frequency.exponentialRampToValueAtTime(DEATH_TONE_END_HZ, now + DEATH_TONE_SECONDS);
    const fallGain = context.createGain();
    fallGain.gain.setValueAtTime(0.0001, now);
    fallGain.gain.exponentialRampToValueAtTime(DEATH_TONE_PEAK, now + 0.04);
    fallGain.gain.exponentialRampToValueAtTime(0.0001, now + DEATH_TONE_SECONDS + 0.15);
    fall.connect(fallGain).connect(context.destination);
    fall.start(now);
    fall.stop(now + DEATH_TONE_SECONDS + 0.2);

    // Dark lowpassed swell that blooms mid-fall then dies with the tone — the
    // closing filter darkens it further as it fades.
    const swell = createNoiseSource(context, DEATH_SWELL_SECONDS);
    const low = context.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.setValueAtTime(DEATH_SWELL_LOWPASS_HZ * 2, now);
    low.frequency.exponentialRampToValueAtTime(DEATH_SWELL_LOWPASS_HZ, now + DEATH_SWELL_SECONDS);
    const swellGain = context.createGain();
    swellGain.gain.setValueAtTime(0.0001, now);
    swellGain.gain.exponentialRampToValueAtTime(DEATH_SWELL_PEAK, now + 0.35);
    swellGain.gain.exponentialRampToValueAtTime(0.0001, now + DEATH_SWELL_SECONDS);
    swell.connect(low).connect(swellGain).connect(context.destination);
    swell.start(now);
    swell.stop(now + DEATH_SWELL_SECONDS);
  }

  return {
    playGemPickup,
    playShardGain,
    playShardLoss,
    playDeath,
    dispose() {
      gemStep = 0;
      lastGemAt = -Infinity;
      gemMergeNextAt = -Infinity;
      gemMerged = 0;
    },
  };
}
