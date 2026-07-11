// Procedural weapon/attack SFX: the player's swing flavors (sword/spear/bow/
// book) and the telegraph windup riser. Swings replace the old generic combat
// "whoosh" — each weapon class gets its own air signature. Swings stay QUIET
// (the HIT carries the impact); the riser stays quiet too but rises, which is
// what reads as danger.

import { clampGain, createNoiseSource, jitter, panned } from './audioCore';

export interface WeaponAudio {
  /** Sharp air swish for a sword/claymore swing. */
  playSwordSwing(): void;
  /** Narrow focused thrust whoosh for a spear/polearm. */
  playSpearThrust(): void;
  /** Bow release: string twang pluck + arrow whoosh tail. gain/pan place a remote shooter. */
  playBowShot(gain?: number, pan?: number): void;
  /** Soft magical "fwoom" for a book/arcane bolt. gain/pan place a remote caster. */
  playArcaneBolt(gain?: number, pan?: number): void;
  /** Rising tension swell across an attack windup (telegraph charge). Auto-ends at durationSeconds; returns a cancel fn that fades it out fast (call when the windup is interrupted). Multiple concurrent risers allowed (they're per-unit). */
  playWindupRiser(durationSeconds: number, gain?: number, pan?: number): () => void;
  dispose(): void;
}

// Swing gates (seconds): a swing spammed faster than this plays once — swings
// are flavor, not a damage meter, so dropped extras merge into nothing.
const SWING_GATE_SECONDS = 0.12;

// Swing voicings: sword is a wide fast cut, spear a narrower focused thrust.
const SWORD_SWEEP_START_HZ = 700;
const SWORD_SWEEP_END_HZ = 2400;
const SWORD_SECONDS = 0.12;
const SWORD_PEAK = 0.12;
const SPEAR_SWEEP_START_HZ = 400;
const SPEAR_SWEEP_END_HZ = 1600;
const SPEAR_SECONDS = 0.16;
const SPEAR_PEAK = 0.12;

const BOW_PLUCK_HZ = 400;
const BOW_PEAK = 0.2;

// Arcane bolt: a low falling swell under a faint high shimmer — soft, not sharp.
const ARCANE_SWEEP_START_HZ = 300;
const ARCANE_SWEEP_END_HZ = 150;
const ARCANE_SECONDS = 0.2;
const ARCANE_PEAK = 0.15;
const ARCANE_SHIMMER_HZ = 1600;
const ARCANE_SHIMMER_PEAK = 0.05;

// Riser: peaks just before the windup lands, capped so a mob pull can't
// stack a siren out of per-unit risers.
const RISER_PEAK = 0.18;
const RISER_TONE_START_HZ = 200;
const RISER_TONE_END_HZ = 650;
const RISER_CANCEL_FADE_SECONDS = 0.08;
const MAX_CONCURRENT_RISERS = 6;

export function createWeaponAudio(getContext: () => AudioContext | null): WeaponAudio {
  const gateNextAt = new Map<string, number>();
  const activeRiserCancels = new Set<() => void>();

  function ready(): AudioContext | null {
    const context = getContext();
    return context && context.state === 'running' ? context : null;
  }

  /** Simple min-interval gate: false while inside the sound's window. */
  function gateOpen(key: string, intervalSeconds: number, now: number): boolean {
    const nextAt = gateNextAt.get(key) ?? -Infinity;
    if (now < nextAt) return false;
    gateNextAt.set(key, now + intervalSeconds);
    return true;
  }

  /** Shared swing body: a bandpass noise sweep — the blade cutting air. */
  function playSweep(
    key: string,
    startHz: number,
    endHz: number,
    seconds: number,
    peak: number,
    q: number
  ) {
    const context = ready();
    if (!context) return;
    const now = context.currentTime;
    if (!gateOpen(key, SWING_GATE_SECONDS, now)) return;
    const rate = jitter(0.1);
    const air = createNoiseSource(context, seconds);
    const band = context.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = q;
    band.frequency.setValueAtTime(startHz * rate, now);
    band.frequency.exponentialRampToValueAtTime(endHz * rate, now + seconds * 0.9);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak * jitter(0.1), now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    air.connect(band).connect(gain).connect(context.destination);
    air.start(now);
    air.stop(now + seconds);
  }

  function playSwordSwing() {
    playSweep('sword', SWORD_SWEEP_START_HZ, SWORD_SWEEP_END_HZ, SWORD_SECONDS, SWORD_PEAK, 1.5);
  }

  function playSpearThrust() {
    playSweep('spear', SPEAR_SWEEP_START_HZ, SPEAR_SWEEP_END_HZ, SPEAR_SECONDS, SPEAR_PEAK, 3);
  }

  function playBowShot(gainFactor = 1, pan = 0) {
    const context = ready();
    if (!context) return;
    const level = clampGain(gainFactor);
    if (level === 0) return;
    const now = context.currentTime;
    const out = panned(context, pan, context.destination);
    const rate = jitter(0.08);

    // String twang: a fast-decay triangle pluck.
    const pluck = context.createOscillator();
    pluck.type = 'triangle';
    pluck.frequency.setValueAtTime(BOW_PLUCK_HZ * rate, now);
    pluck.frequency.exponentialRampToValueAtTime(BOW_PLUCK_HZ * 0.8 * rate, now + 0.08);
    const pluckGain = context.createGain();
    pluckGain.gain.setValueAtTime(BOW_PEAK * level, now);
    pluckGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    pluck.connect(pluckGain).connect(out);
    pluck.start(now);
    pluck.stop(now + 0.1);

    // Release snap: a tiny broadband click as the string lets go.
    const snap = createNoiseSource(context, 0.02);
    const snapGain = context.createGain();
    snapGain.gain.setValueAtTime(0.1 * level, now);
    snapGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.02);
    snap.connect(snapGain).connect(out);
    snap.start(now);
    snap.stop(now + 0.02);

    // Arrow tail: a short rising airy whoosh chasing the arrow out.
    const tail = createNoiseSource(context, 0.18);
    const tailBand = context.createBiquadFilter();
    tailBand.type = 'bandpass';
    tailBand.Q.value = 1.2;
    tailBand.frequency.setValueAtTime(900 * rate, now + 0.04);
    tailBand.frequency.exponentialRampToValueAtTime(2600 * rate, now + 0.22);
    const tailGain = context.createGain();
    tailGain.gain.setValueAtTime(0.0001, now + 0.04);
    tailGain.gain.exponentialRampToValueAtTime(0.08 * level, now + 0.08);
    tailGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    tail.connect(tailBand).connect(tailGain).connect(out);
    tail.start(now + 0.04);
    tail.stop(now + 0.25);
  }

  function playArcaneBolt(gainFactor = 1, pan = 0) {
    const context = ready();
    if (!context) return;
    const level = clampGain(gainFactor);
    if (level === 0) return;
    const now = context.currentTime;
    if (!gateOpen('arcane', SWING_GATE_SECONDS, now)) return;
    const out = panned(context, pan, context.destination);
    const rate = jitter(0.1);

    // Body: a falling sine swell — the "fwoom" of the bolt leaving the page.
    const fwoom = context.createOscillator();
    fwoom.type = 'sine';
    fwoom.frequency.setValueAtTime(ARCANE_SWEEP_START_HZ * rate, now);
    fwoom.frequency.exponentialRampToValueAtTime(ARCANE_SWEEP_END_HZ * rate, now + ARCANE_SECONDS);
    const fwoomGain = context.createGain();
    fwoomGain.gain.setValueAtTime(0.0001, now);
    fwoomGain.gain.exponentialRampToValueAtTime(ARCANE_PEAK * level, now + 0.05);
    fwoomGain.gain.exponentialRampToValueAtTime(0.0001, now + ARCANE_SECONDS);
    fwoom.connect(fwoomGain).connect(out);
    fwoom.start(now);
    fwoom.stop(now + ARCANE_SECONDS + 0.02);

    // Faint high shimmer riding the swell — the "magic" tell over the low body.
    const shimmer = context.createOscillator();
    shimmer.type = 'sine';
    shimmer.frequency.value = ARCANE_SHIMMER_HZ * jitter(0.08);
    const shimmerGain = context.createGain();
    shimmerGain.gain.setValueAtTime(0.0001, now);
    shimmerGain.gain.exponentialRampToValueAtTime(ARCANE_SHIMMER_PEAK * level, now + 0.06);
    shimmerGain.gain.exponentialRampToValueAtTime(0.0001, now + ARCANE_SECONDS);
    shimmer.connect(shimmerGain).connect(out);
    shimmer.start(now);
    shimmer.stop(now + ARCANE_SECONDS + 0.02);
  }

  function playWindupRiser(durationSeconds: number, gainFactor = 1, pan = 0): () => void {
    const context = ready();
    const level = clampGain(gainFactor);
    if (!context || level === 0 || durationSeconds <= 0) return () => {};
    if (activeRiserCancels.size >= MAX_CONCURRENT_RISERS) return () => {};
    const now = context.currentTime;
    const end = now + durationSeconds;
    const out = panned(context, pan, context.destination);

    // Master envelope: swells to its peak just before the windup lands, then
    // snaps shut — the silence right before the hit is part of the telegraph.
    const master = context.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(
      RISER_PEAK * level,
      end - Math.min(0.05, durationSeconds * 0.1)
    );
    master.gain.exponentialRampToValueAtTime(0.0001, end);
    master.connect(out);

    // Rising sine = the "danger charging" pitch cue.
    const tone = context.createOscillator();
    tone.type = 'sine';
    tone.frequency.setValueAtTime(RISER_TONE_START_HZ * jitter(0.05), now);
    tone.frequency.exponentialRampToValueAtTime(RISER_TONE_END_HZ * jitter(0.05), end);
    tone.connect(master);
    tone.start(now);
    tone.stop(end + 0.02);

    // Airy tension layer: a bandpass hiss climbing with the tone.
    const hiss = createNoiseSource(context, durationSeconds);
    const hissBand = context.createBiquadFilter();
    hissBand.type = 'bandpass';
    hissBand.Q.value = 1;
    hissBand.frequency.setValueAtTime(RISER_TONE_START_HZ * 2, now);
    hissBand.frequency.exponentialRampToValueAtTime(RISER_TONE_END_HZ * 2, end);
    hiss.connect(hissBand).connect(master);
    hiss.start(now);
    hiss.stop(end);

    // Cancel = windup interrupted: fast fade + stop. Safe to call twice and
    // after the natural end (stop() on a dead source just throws — swallow it).
    const cancel = () => {
      if (!activeRiserCancels.delete(cancel)) return;
      const at = context.currentTime;
      master.gain.cancelScheduledValues(at);
      master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), at);
      master.gain.exponentialRampToValueAtTime(0.0001, at + RISER_CANCEL_FADE_SECONDS);
      for (const source of [tone, hiss]) {
        try {
          source.stop(at + RISER_CANCEL_FADE_SECONDS + 0.01);
        } catch {
          // Already stopped — fine.
        }
      }
    };
    activeRiserCancels.add(cancel);
    // Natural end frees the concurrency slot without re-fading anything.
    tone.onended = () => activeRiserCancels.delete(cancel);
    return cancel;
  }

  return {
    playSwordSwing,
    playSpearThrust,
    playBowShot,
    playArcaneBolt,
    playWindupRiser,
    dispose() {
      for (const cancel of [...activeRiserCancels]) cancel();
      activeRiserCancels.clear();
      gateNextAt.clear();
    },
  };
}
