// Procedural combat-feedback SFX: hit/crit ticks, player-hurt thuds, the stun
// pop + wind-down, heals, and swing whooshes. Built on the anti-fatigue rules
// that keep high-DPS audio rewarding instead of grating:
//  - every instance is pitch/gain-jittered (no two hits identical),
//  - per-sound throttles MERGE bursts into one slightly fatter play,
//  - generic hits live on a duckable bus; hurt/crit briefly duck it so danger
//    and reward always cut through the spam,
//  - consecutive crits climb a small pitch ladder (Hades-style escalation).
// Frequency slots: hits mid (~2kHz), crits high (3–5kHz), hurt low (50–130Hz),
// stun a detuned midrange wobble — nothing masks anything.

import { clampGain, createNoiseSource, jitter, panned } from './audioCore';

export interface CombatAudio {
  /** Mid tick for a landed hit on an enemy/player. `gain` 0..1 = distance attenuation; `pan` -1..1 = screen-space stereo position of the hit. */
  playEnemyHit(gain?: number, pan?: number): void;
  /** Bright crack + descending ping for a crit; ducks the hit bus, climbs the streak ladder. `pan` as playEnemyHit. */
  playEnemyCrit(gain?: number, pan?: number): void;
  /** Low body thud when the local player takes damage; crit adds a sharp snap layer. */
  playPlayerHurt(isCrit: boolean): void;
  /** Stun pop, then a detuned wobble that winds down across the stun duration. */
  playStun(durationSeconds: number, intensity: number): void;
  /** Soft two-note chime for an incoming heal. */
  playHeal(): void;
  /** Very light air whoosh for the player's own swing (miss or hit). */
  playWhoosh(): void;
  dispose(): void;
}

// Throttle windows (seconds): plays inside the window are merged, not stacked.
const HIT_INTERVAL = 0.07;
const CRIT_INTERVAL = 0.09;
const HURT_INTERVAL = 0.15;
const HEAL_INTERVAL = 0.25;
const WHOOSH_INTERVAL = 0.12;
/** Each merged (suppressed) play fattens the next allowed one by this much. */
const MERGE_BOOST = 0.15;
const MERGE_BOOST_CAP = 4;

// Crit escalation ladder: consecutive crits within the window step the pitch
// up; a gap resets. Small on purpose — a reward melody, not a slide whistle.
const CRIT_STREAK_WINDOW_SECONDS = 1.2;
const CRIT_STREAK_SEMITONES = 1.5;
const CRIT_STREAK_MAX_STEPS = 4;

export function createCombatAudio(getContext: () => AudioContext | null): CombatAudio {
  // Duckable bus for the spammy layer (hit ticks, whooshes). Hurt/crit go
  // straight to the destination and momentarily duck this bus.
  let hitBus: GainNode | null = null;
  let busContext: AudioContext | null = null;
  const throttles = new Map<string, { nextAt: number; merged: number }>();
  let critStreak = 0;
  let lastCritAt = -Infinity;
  let stopActiveStun: (() => void) | null = null;

  function ready(): AudioContext | null {
    const context = getContext();
    return context && context.state === 'running' ? context : null;
  }

  function bus(context: AudioContext): GainNode {
    if (!hitBus || busContext !== context) {
      hitBus = context.createGain();
      hitBus.connect(context.destination);
      busContext = context;
    }
    return hitBus;
  }

  /**
   * Returns a gain multiplier for this play, or null when it falls inside the
   * sound's throttle window. Suppressed plays accumulate into the multiplier
   * so a 20-hits/sec burst reads as a dense crunch, not white noise.
   */
  function throttle(key: string, intervalSeconds: number, now: number): number | null {
    const state = throttles.get(key);
    if (!state) {
      throttles.set(key, { nextAt: now + intervalSeconds, merged: 0 });
      return 1;
    }
    if (now < state.nextAt) {
      state.merged = Math.min(MERGE_BOOST_CAP, state.merged + 1);
      return null;
    }
    const boost = 1 + state.merged * MERGE_BOOST;
    state.nextAt = now + intervalSeconds;
    state.merged = 0;
    return boost;
  }

  /** Briefly pulls the hit bus down so an important sound owns the mix. */
  function duckHits(context: AudioContext, depth: number, seconds: number) {
    const gain = bus(context).gain;
    const now = context.currentTime;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(Math.min(gain.value, 1), now);
    gain.linearRampToValueAtTime(depth, now + 0.015);
    gain.exponentialRampToValueAtTime(1, now + seconds);
  }

  function playEnemyHit(gainFactor = 1, pan = 0) {
    const context = ready();
    if (!context) return;
    const level = clampGain(gainFactor);
    if (level === 0) return;
    const boost = throttle('hit', HIT_INTERVAL, context.currentTime);
    if (boost === null) return;
    const now = context.currentTime;
    const rate = jitter(0.14);
    const out = panned(context, pan, bus(context));

    // Mid "tick": short bandpass noise — the connect layer, quiet by design.
    const tick = createNoiseSource(context, 0.05);
    const tickBand = context.createBiquadFilter();
    tickBand.type = 'bandpass';
    tickBand.Q.value = 1.8;
    tickBand.frequency.value = 2200 * rate;
    const tickGain = context.createGain();
    tickGain.gain.setValueAtTime(0.22 * level * boost, now);
    tickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    tick.connect(tickBand).connect(tickGain).connect(out);
    tick.start(now);
    tick.stop(now + 0.05);

    // Body "thock": tiny descending sine gives the tick weight.
    const thock = context.createOscillator();
    thock.type = 'sine';
    thock.frequency.setValueAtTime(340 * rate, now);
    thock.frequency.exponentialRampToValueAtTime(190 * rate, now + 0.06);
    const thockGain = context.createGain();
    thockGain.gain.setValueAtTime(0.0001, now);
    thockGain.gain.exponentialRampToValueAtTime(0.18 * level * boost, now + 0.005);
    thockGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
    thock.connect(thockGain).connect(out);
    thock.start(now);
    thock.stop(now + 0.08);
  }

  function playEnemyCrit(gainFactor = 1, pan = 0) {
    const context = ready();
    if (!context) return;
    const level = clampGain(gainFactor);
    if (level === 0) return;
    const boost = throttle('crit', CRIT_INTERVAL, context.currentTime);
    if (boost === null) return;
    const now = context.currentTime;
    const out = panned(context, pan, context.destination);

    // Escalation ladder: crits inside the streak window pitch up step by step.
    critStreak = now - lastCritAt < CRIT_STREAK_WINDOW_SECONDS ? critStreak + 1 : 0;
    lastCritAt = now;
    const steps = Math.min(critStreak, CRIT_STREAK_MAX_STEPS);
    const ladder = 2 ** ((steps * CRIT_STREAK_SEMITONES) / 12) * jitter(0.04);

    // Crack transient: highpassed noise — sits above the hit ticks' band.
    const crack = createNoiseSource(context, 0.07);
    const crackHigh = context.createBiquadFilter();
    crackHigh.type = 'highpass';
    crackHigh.frequency.value = 3000;
    const crackGain = context.createGain();
    crackGain.gain.setValueAtTime(0.5 * level * boost, now);
    crackGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
    crack.connect(crackHigh).connect(crackGain).connect(out);
    crack.start(now);
    crack.stop(now + 0.07);

    // Reward ping: descending triangle — the melodic part the ladder climbs.
    const ping = context.createOscillator();
    ping.type = 'triangle';
    ping.frequency.setValueAtTime(1400 * ladder, now);
    ping.frequency.exponentialRampToValueAtTime(700 * ladder, now + 0.16);
    const pingGain = context.createGain();
    pingGain.gain.setValueAtTime(0.0001, now);
    pingGain.gain.exponentialRampToValueAtTime(0.4 * level, now + 0.008);
    pingGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    ping.connect(pingGain).connect(out);
    ping.start(now);
    ping.stop(now + 0.2);

    // Sparkle tail: faint high sine sheen.
    const sparkle = context.createOscillator();
    sparkle.type = 'sine';
    sparkle.frequency.value = 2600 * ladder;
    const sparkleGain = context.createGain();
    sparkleGain.gain.setValueAtTime(0.15 * level, now);
    sparkleGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    sparkle.connect(sparkleGain).connect(out);
    sparkle.start(now);
    sparkle.stop(now + 0.1);

    duckHits(context, 0.35, 0.18);
  }

  function playPlayerHurt(isCrit: boolean) {
    const context = ready();
    if (!context) return;
    const boost = throttle('hurt', HURT_INTERVAL, context.currentTime);
    if (boost === null) return;
    const now = context.currentTime;
    const rate = jitter(0.08);

    // Body-blow thud: the low band belongs to "I got hit" and nothing else.
    const thudSeconds = isCrit ? 0.32 : 0.24;
    const thud = context.createOscillator();
    thud.type = 'sine';
    thud.frequency.setValueAtTime((isCrit ? 140 : 120) * rate, now);
    thud.frequency.exponentialRampToValueAtTime((isCrit ? 48 : 52) * rate, now + thudSeconds);
    const thudGain = context.createGain();
    thudGain.gain.setValueAtTime(0.0001, now);
    thudGain.gain.exponentialRampToValueAtTime((isCrit ? 0.85 : 0.7) * boost, now + 0.012);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, now + thudSeconds + 0.08);
    thud.connect(thudGain).connect(context.destination);
    thud.start(now);
    thud.stop(now + thudSeconds + 0.12);

    // Muffled impact texture under the thud.
    const body = createNoiseSource(context, 0.12);
    const bodyLow = context.createBiquadFilter();
    bodyLow.type = 'lowpass';
    bodyLow.frequency.value = 320;
    const bodyGain = context.createGain();
    bodyGain.gain.setValueAtTime(0.35 * boost, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    body.connect(bodyLow).connect(bodyGain).connect(context.destination);
    body.start(now);
    body.stop(now + 0.12);

    // Crit-on-me alarm layer: a sharp high snap so a big hit is unmistakable
    // even through full DPS spam.
    if (isCrit) {
      const snap = createNoiseSource(context, 0.06);
      const snapBand = context.createBiquadFilter();
      snapBand.type = 'bandpass';
      snapBand.Q.value = 3;
      snapBand.frequency.value = 3400 * rate;
      const snapGain = context.createGain();
      snapGain.gain.setValueAtTime(0.5, now);
      snapGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
      snap.connect(snapBand).connect(snapGain).connect(context.destination);
      snap.start(now);
      snap.stop(now + 0.06);
    }

    duckHits(context, isCrit ? 0.25 : 0.4, isCrit ? 0.35 : 0.2);
  }

  function playStun(durationSeconds: number, intensity: number) {
    const context = ready();
    if (!context) return;
    const level = clampGain(Math.max(0.25, intensity));
    if (level === 0 || durationSeconds <= 0) return;
    stopActiveStun?.();
    const now = context.currentTime;

    // Pop: burst + fast up-chirp — the "you're dizzy now" transient.
    const pop = createNoiseSource(context, 0.06);
    const popBand = context.createBiquadFilter();
    popBand.type = 'bandpass';
    popBand.Q.value = 1.5;
    popBand.frequency.value = 900;
    const popGain = context.createGain();
    popGain.gain.setValueAtTime(0.5 * level, now);
    popGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    pop.connect(popBand).connect(popGain).connect(context.destination);
    pop.start(now);
    pop.stop(now + 0.06);

    const chirp = context.createOscillator();
    chirp.type = 'square';
    chirp.frequency.setValueAtTime(180, now);
    chirp.frequency.exponentialRampToValueAtTime(640, now + 0.09);
    const chirpGain = context.createGain();
    chirpGain.gain.setValueAtTime(0.22 * level, now);
    chirpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    chirp.connect(chirpGain).connect(context.destination);
    chirp.start(now);
    chirp.stop(now + 0.1);

    // Wind-down wobble: a detuned triangle pair (beating = dizzy) with a
    // vibrato LFO that slows as the pitch and volume sink across the stun.
    const end = now + durationSeconds;
    const wobbleGain = context.createGain();
    wobbleGain.gain.setValueAtTime(0.28 * level, now + 0.05);
    wobbleGain.gain.exponentialRampToValueAtTime(0.0001, end);
    wobbleGain.connect(context.destination);
    const lfo = context.createOscillator();
    lfo.frequency.setValueAtTime(6, now);
    lfo.frequency.linearRampToValueAtTime(2.5, end);
    const lfoDepth = context.createGain();
    lfoDepth.gain.setValueAtTime(24, now);
    lfoDepth.gain.linearRampToValueAtTime(8, end);
    lfo.connect(lfoDepth);
    const voices: OscillatorNode[] = [lfo];
    for (const baseFrequency of [320, 326]) {
      const voice = context.createOscillator();
      voice.type = 'triangle';
      voice.frequency.setValueAtTime(baseFrequency, now);
      voice.frequency.exponentialRampToValueAtTime(baseFrequency * 0.68, end);
      lfoDepth.connect(voice.frequency);
      voice.connect(wobbleGain);
      voice.start(now);
      voice.stop(end + 0.02);
      voices.push(voice);
    }
    lfo.start(now);
    lfo.stop(end + 0.02);

    // Recovery blip right as control returns — the "go" cue.
    const blip = context.createOscillator();
    blip.type = 'sine';
    blip.frequency.setValueAtTime(520, end - 0.06);
    blip.frequency.exponentialRampToValueAtTime(940, end);
    const blipGain = context.createGain();
    blipGain.gain.setValueAtTime(0.0001, end - 0.06);
    blipGain.gain.exponentialRampToValueAtTime(0.16 * level, end - 0.03);
    blipGain.gain.exponentialRampToValueAtTime(0.0001, end + 0.05);
    blip.connect(blipGain).connect(context.destination);
    blip.start(end - 0.06);
    blip.stop(end + 0.06);
    voices.push(blip);

    // A newer stun (or dispose) replaces this one: fade fast, stop everything.
    stopActiveStun = () => {
      stopActiveStun = null;
      const at = context.currentTime;
      wobbleGain.gain.cancelScheduledValues(at);
      wobbleGain.gain.setValueAtTime(wobbleGain.gain.value || 0.0001, at);
      wobbleGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
      for (const voice of voices) {
        try {
          voice.stop(at + 0.06);
        } catch {
          // Already stopped — fine.
        }
      }
    };
  }

  function playHeal() {
    const context = ready();
    if (!context) return;
    const boost = throttle('heal', HEAL_INTERVAL, context.currentTime);
    if (boost === null) return;
    const now = context.currentTime;
    // Gentle rising two-note chime — clearly "good", far from every combat band.
    [660, 880].forEach((frequency, noteIndex) => {
      const start = now + noteIndex * 0.09;
      const note = context.createOscillator();
      note.type = 'sine';
      note.frequency.value = frequency * jitter(0.01);
      const noteGain = context.createGain();
      noteGain.gain.setValueAtTime(0.0001, start);
      noteGain.gain.exponentialRampToValueAtTime(0.15, start + 0.02);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
      note.connect(noteGain).connect(context.destination);
      note.start(start);
      note.stop(start + 0.3);
    });
  }

  function playWhoosh() {
    const context = ready();
    if (!context) return;
    const boost = throttle('whoosh', WHOOSH_INTERVAL, context.currentTime);
    if (boost === null) return;
    const now = context.currentTime;
    // Feather-light air cut on the swing itself; the HIT carries the impact.
    const air = createNoiseSource(context, 0.12);
    const airBand = context.createBiquadFilter();
    airBand.type = 'bandpass';
    airBand.Q.value = 1.2;
    airBand.frequency.setValueAtTime(500 * jitter(0.1), now);
    airBand.frequency.exponentialRampToValueAtTime(1400 * jitter(0.1), now + 0.11);
    const airGain = context.createGain();
    airGain.gain.setValueAtTime(0.0001, now);
    airGain.gain.exponentialRampToValueAtTime(0.1 * Math.min(boost, 1.3), now + 0.03);
    airGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    air.connect(airBand).connect(airGain).connect(bus(context));
    air.start(now);
    air.stop(now + 0.12);
  }

  return {
    playEnemyHit,
    playEnemyCrit,
    playPlayerHurt,
    playStun,
    playHeal,
    playWhoosh,
    dispose() {
      stopActiveStun?.();
      hitBus?.disconnect();
      hitBus = null;
      busContext = null;
    },
  };
}
