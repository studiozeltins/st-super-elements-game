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

// Gem streak: consecutive pickups inside the window climb the SAME glassy
// quarter-tone bell the payout bursts use (playtest 2026-07-12: the old sharp
// pentatonic single-pickup chime clashed with the loved payout voice); a gap
// resets to the base chime. Cap = the voice's 1.5-octave climb (36 × ¼-tone).
export const GEM_STREAK_WINDOW_SECONDS = 1.5;
export const GEM_LADDER_MAX_STEPS = 36;

/** PURE: next streak step — resets to 0 after a gap past the window, else climbs one rung (capped). */
export function nextGemStep(previousStep: number, secondsSinceLast: number): number {
  if (secondsSinceLast > GEM_STREAK_WINDOW_SECONDS) return 0;
  return Math.min(GEM_LADDER_MAX_STEPS, Math.max(0, Math.floor(previousStep)) + 1);
}

// Big-pickup payout, modelled on the gacha ShardCounter the playtests keep
// praising (2026-07-12 ×3): 130ms ticks with TIERED "secret steps" so bigger
// drops keep counting longer — one chime per 100 gems to 1k, per 500 to 11k,
// per 1,000 beyond. A golem-jackpot 21k ≈ 5s; the 77-chime cap ≈ 10s lands
// only past ~58k (deliberately undocumented in-game — a discovery ceiling).
export const GEM_CHIME_TIERS: readonly { upTo: number; perAmount: number }[] = [
  { upTo: 1_000, perAmount: 100 },
  { upTo: 11_000, perAmount: 500 },
  { upTo: Infinity, perAmount: 1_000 },
];
export const GEM_BURST_MAX_CHIMES = 77;
export const GEM_BURST_SPACING_SECONDS = 0.13;

/** PURE: chimes a pickup of `amount` gems earns — min 1, tiered per-100/500/1000, capped. */
export function gemChimeCount(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 1;
  let chimes = 0;
  let tierStart = 0;
  for (const { upTo, perAmount } of GEM_CHIME_TIERS) {
    const inTier = Math.min(amount, upTo) - tierStart;
    if (inTier <= 0) break;
    chimes += Math.floor(inTier / perAmount);
    tierStart = upTo;
  }
  return Math.min(GEM_BURST_MAX_CHIMES, Math.max(1, chimes));
}

/** PURE: seconds a payout burst lasts — the HUD counter roll syncs to this. */
export function gemBurstSeconds(amount: number): number {
  return (gemChimeCount(amount) - 1) * GEM_BURST_SPACING_SECONDS;
}

// Gem voice — every gem sound, single or burst: the ShardCounter's loved
// TIMING (130ms quarter-tone climb) but a GLASSY bell so gems never read as
// shards — sine body a fourth above the shard bell + a twelfth (3×) sparkle
// instead of the octave, shorter decay. Climb cap 1.5 octaves (vs the shard's
// 1) so long jackpot runs keep rising for ~4.7s before holding the top. The
// jitter is TINY on purpose (±2%) — the climb is the reward read.
const GEM_MERGE_SECONDS = 0.05;
const GEM_MERGE_BOOST = 0.15;
const GEM_MERGE_BOOST_CAP = 3;
const GEM_JITTER = 0.02;
const PAYOUT_BASE_HZ = 880;
// 0.28 was too loud once bursts chained (playtest 2026-07-12) — bells are
// reward garnish, not a combat cue.
const PAYOUT_PEAK = 0.14;
const PAYOUT_DECAY_SECONDS = 0.3;
const PAYOUT_CLIMB_CAP = 2 ** 1.5;
// Jackpot cherry: a sweep past this total earns ONE extra bell after the
// chain finishes — a beat of silence, then the next pitch step up.
const JACKPOT_PING_THRESHOLD = 10_000;
const JACKPOT_PING_DELAY_SECONDS = 0.5;
// Multi-drop pickups (a golem's pile = many 500-max drop rows collected in
// one sweep) CHAIN into one continuous count-up — overlapped per-drop bursts
// summed to a loud pitched blur that read far shorter than the total
// (playtest 2026-07-12, worst on magenta 500s). The 10s ceiling falls out of
// GEM_BURST_MAX_CHIMES: the chain never rings more than 77 bells total.

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
  // Payout chain state (context.currentTime domain). A kill's hoard arrives
  // as MANY drop rows (500-gem max denomination), so the tier curve must run
  // on the sweep's CUMULATIVE total: each pickup raises chainTotal, and only
  // the chimes the new total EARNS beyond those already scheduled are added.
  let payoutUntil = 0;
  let payoutEndStep = 0;
  let chainTotal = 0;
  let chainChimes = 0;
  let jackpotTimer = 0;

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

  /** One glassy gem bell at step n (quarter-tone rise, 1.5-octave cap). */
  function playGemBell(context: AudioContext, startAt: number, step: number, boost: number) {
    const frequency =
      PAYOUT_BASE_HZ * Math.min(PAYOUT_CLIMB_CAP, 2 ** (step / 24)) * jitter(GEM_JITTER);
    playNote(context, 'sine', frequency, PAYOUT_PEAK * boost, startAt, PAYOUT_DECAY_SECONDS);
    // Twelfth (3×) sparkle = glass; the shard bell's octave shimmer stays its own.
    playNote(context, 'sine', frequency * 3, PAYOUT_PEAK * 0.2 * boost, startAt, 0.16);
  }

  function playGemPickup(amount = 0) {
    const context = ready();
    if (!context) return;
    const now = context.currentTime;
    // Sweep chain: reset when the previous payout finished ringing.
    if (now >= payoutUntil) {
      chainTotal = 0;
      chainChimes = 0;
      payoutEndStep = 0;
      payoutUntil = now;
    }
    chainTotal += amount;
    const earnedChimes = chainTotal >= GEM_CHIME_TIERS[0].perAmount ? gemChimeCount(chainTotal) : 0;
    const newChimes = earnedChimes - chainChimes;
    if (newChimes > 0) {
      // ShardCounter-style payout: bells ticking up a quarter-tone per step,
      // appended to the chain's tail — a multi-drop sweep reads as ONE long
      // count-up whose length tracks the swept TOTAL (tier curve, ~10s cap).
      for (let chime = 0; chime < newChimes; chime++) {
        playGemBell(context, payoutUntil + chime * GEM_BURST_SPACING_SECONDS, payoutEndStep + chime, 1);
      }
      payoutUntil += newChimes * GEM_BURST_SPACING_SECONDS;
      payoutEndStep += newChimes;
      chainChimes = earnedChimes;
      // The streak + merge gate continue from the chain's LAST chime.
      gemStep = GEM_LADDER_MAX_STEPS;
      lastGemAt = payoutUntil;
      gemMerged = 0;
      gemMergeNextAt = payoutUntil + GEM_MERGE_SECONDS;
      // Jackpot cherry: one delayed bell at the NEXT pitch step after the
      // chain's last chime. Re-armed on every extension so it always lands
      // after the true end; a JS timer (not pre-scheduled WebAudio) because
      // the chain's final length isn't known until pickups stop.
      if (chainTotal >= JACKPOT_PING_THRESHOLD) {
        window.clearTimeout(jackpotTimer);
        const fireInMs =
          (payoutUntil - context.currentTime + JACKPOT_PING_DELAY_SECONDS) * 1000;
        const pingStep = payoutEndStep + 1;
        jackpotTimer = window.setTimeout(() => {
          const pingContext = ready();
          if (pingContext) playGemBell(pingContext, pingContext.currentTime, pingStep, 1);
        }, fireInMs);
      }
      return;
    }
    // No new tier crossed. During an active count-up stay silent (the chain
    // owns the soundscape); otherwise fall through to the single streak bell.
    if (chainChimes > 0) return;
    // The streak advances on EVERY pickup — merged (throttled) plays included —
    // so a vacuumed trail still lands its next audible bell higher up.
    gemStep = nextGemStep(gemStep, now - lastGemAt);
    lastGemAt = now;
    if (now < gemMergeNextAt) {
      gemMerged = Math.min(GEM_MERGE_BOOST_CAP, gemMerged + 1);
      return;
    }
    const boost = 1 + gemMerged * GEM_MERGE_BOOST;
    gemMerged = 0;
    gemMergeNextAt = now + GEM_MERGE_SECONDS;
    playGemBell(context, now, gemStep, boost);
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
      payoutUntil = 0;
      payoutEndStep = 0;
      chainTotal = 0;
      chainChimes = 0;
      window.clearTimeout(jackpotTimer);
    },
  };
}
