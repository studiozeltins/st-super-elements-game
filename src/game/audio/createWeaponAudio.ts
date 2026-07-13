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
  /** Projectile smacking the world (slope/rock/tent): wet splat + dirt thock + bright fizz. gain/pan place the impact. */
  playProjectileImpact(gain?: number, pan?: number): void;
  /** Rising tension swell across an attack windup (telegraph charge). Auto-ends at durationSeconds; returns a cancel fn that fades it out fast (call when the windup is interrupted). Multiple concurrent risers allowed (they're per-unit). */
  playWindupRiser(durationSeconds: number, gain?: number, pan?: number): () => void;
  /** Slime hop launch: wet two-phase squish — compress down, then spring up. gain/pan place the hopping slime. */
  playSlimeLeap(gain?: number, pan?: number): void;
  /** Slime slam landing that HIT someone: fat wet splat (lowpassed burst + down-chirp). gain/pan place the landing. */
  playSlimeSquash(gain?: number, pan?: number): void;
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

// Projectile world impact: three layers make the "satisfying splash" —
// a wet mid splat (bandpass noise falling 900→350Hz), a low dirt thock
// (sine 190→75Hz) for weight, and a tiny bright fizz on top so the element
// energy reads as bursting, not just dirt. Gated like swings: arrow rain on a
// cliff face merges instead of crackling.
const IMPACT_GATE_SECONDS = 0.08;
const IMPACT_SPLAT_START_HZ = 900;
const IMPACT_SPLAT_END_HZ = 350;
const IMPACT_SPLAT_SECONDS = 0.14;
const IMPACT_SPLAT_PEAK = 0.42;
const IMPACT_THOCK_START_HZ = 190;
const IMPACT_THOCK_END_HZ = 75;
const IMPACT_THOCK_SECONDS = 0.12;
const IMPACT_THOCK_PEAK = 0.3;
const IMPACT_FIZZ_HIGHPASS_HZ = 2800;
const IMPACT_FIZZ_SECONDS = 0.05;
const IMPACT_FIZZ_PEAK = 0.12;

// Slime leap: a two-phase bandpass squish — the body compressing (250→120Hz)
// then springing off the ground (150→400Hz). Quiet: it fires per hop across a
// whole camp, so it must read as ambience, not a combat cue.
const SLIME_LEAP_SQUISH_SECONDS = 0.1;
const SLIME_LEAP_SPRING_SECONDS = 0.15;
const SLIME_LEAP_PEAK = 0.18;
// Slime squash (landing HIT): a fat low-mid splat — lowpassed noise burst plus
// a quick down-chirp body, ~0.18s. Wet and blunt, nothing like the goliath slam.
const SLIME_SQUASH_SECONDS = 0.18;
const SLIME_SQUASH_NOISE_HZ = 300;
const SLIME_SQUASH_NOISE_PEAK = 0.5;
const SLIME_SQUASH_CHIRP_START_HZ = 220;
const SLIME_SQUASH_CHIRP_END_HZ = 90;
const SLIME_SQUASH_CHIRP_PEAK = 0.35;

// Riser: peaks just before the windup lands, capped so a mob pull can't
// stack a siren out of per-unit risers. NOISE-based (playtest 2026-07-12: the
// old rising sine read as a piano/siren) — a high-Q bandpass on noise gives
// "pitched breath", the rising danger cue without a tonal note.
const RISER_PEAK = 0.22;
const RISER_BAND_START_HZ = 260;
const RISER_BAND_END_HZ = 1300;
const RISER_BAND_Q = 6;
const RISER_RUMBLE_HZ = 150;
const RISER_RUMBLE_PEAK_FRACTION = 0.6;
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

  function playProjectileImpact(gainFactor = 1, pan = 0) {
    const context = ready();
    if (!context) return;
    const level = clampGain(gainFactor);
    if (level === 0) return;
    const now = context.currentTime;
    if (!gateOpen('projectileImpact', IMPACT_GATE_SECONDS, now)) return;
    const out = panned(context, pan, context.destination);
    const rate = jitter(0.12);

    // Wet mid splat: the body of the impact.
    const splat = createNoiseSource(context, IMPACT_SPLAT_SECONDS);
    const splatBand = context.createBiquadFilter();
    splatBand.type = 'bandpass';
    splatBand.Q.value = 1.1;
    splatBand.frequency.setValueAtTime(IMPACT_SPLAT_START_HZ * rate, now);
    splatBand.frequency.exponentialRampToValueAtTime(
      IMPACT_SPLAT_END_HZ * rate,
      now + IMPACT_SPLAT_SECONDS
    );
    const splatGain = context.createGain();
    splatGain.gain.setValueAtTime(IMPACT_SPLAT_PEAK * level, now);
    splatGain.gain.exponentialRampToValueAtTime(0.0001, now + IMPACT_SPLAT_SECONDS);
    splat.connect(splatBand).connect(splatGain).connect(out);
    splat.start(now);
    splat.stop(now + IMPACT_SPLAT_SECONDS);

    // Low dirt thock: weight under the splat.
    const thock = context.createOscillator();
    thock.type = 'sine';
    thock.frequency.setValueAtTime(IMPACT_THOCK_START_HZ * rate, now);
    thock.frequency.exponentialRampToValueAtTime(
      IMPACT_THOCK_END_HZ * rate,
      now + IMPACT_THOCK_SECONDS
    );
    const thockGain = context.createGain();
    thockGain.gain.setValueAtTime(0.0001, now);
    thockGain.gain.exponentialRampToValueAtTime(IMPACT_THOCK_PEAK * level, now + 0.008);
    thockGain.gain.exponentialRampToValueAtTime(0.0001, now + IMPACT_THOCK_SECONDS + 0.04);
    thock.connect(thockGain).connect(out);
    thock.start(now);
    thock.stop(now + IMPACT_THOCK_SECONDS + 0.06);

    // Bright fizz cap: the element energy bursting on the surface.
    const fizz = createNoiseSource(context, IMPACT_FIZZ_SECONDS);
    const fizzHigh = context.createBiquadFilter();
    fizzHigh.type = 'highpass';
    fizzHigh.frequency.value = IMPACT_FIZZ_HIGHPASS_HZ;
    const fizzGain = context.createGain();
    fizzGain.gain.setValueAtTime(IMPACT_FIZZ_PEAK * level, now);
    fizzGain.gain.exponentialRampToValueAtTime(0.0001, now + IMPACT_FIZZ_SECONDS);
    fizz.connect(fizzHigh).connect(fizzGain).connect(out);
    fizz.start(now);
    fizz.stop(now + IMPACT_FIZZ_SECONDS);
  }

  function playSlimeLeap(gainFactor = 1, pan = 0) {
    const context = ready();
    if (!context) return;
    const level = clampGain(gainFactor);
    if (level === 0) return;
    const now = context.currentTime;
    const out = panned(context, pan, context.destination);
    const rate = jitter(0.15); // heavy jitter: a camp of hoppers must not phase

    // Phase 1 — compress: a falling wet squish as the blob loads up.
    const squish = createNoiseSource(context, SLIME_LEAP_SQUISH_SECONDS);
    const squishBand = context.createBiquadFilter();
    squishBand.type = 'bandpass';
    squishBand.Q.value = 2;
    squishBand.frequency.setValueAtTime(250 * rate, now);
    squishBand.frequency.exponentialRampToValueAtTime(
      120 * rate,
      now + SLIME_LEAP_SQUISH_SECONDS
    );
    const squishGain = context.createGain();
    squishGain.gain.setValueAtTime(SLIME_LEAP_PEAK * level, now);
    squishGain.gain.exponentialRampToValueAtTime(0.0001, now + SLIME_LEAP_SQUISH_SECONDS + 0.02);
    squish.connect(squishBand).connect(squishGain).connect(out);
    squish.start(now);
    squish.stop(now + SLIME_LEAP_SQUISH_SECONDS + 0.02);

    // Phase 2 — spring: a rising band as the body launches off the ground.
    const springAt = now + SLIME_LEAP_SQUISH_SECONDS;
    const spring = createNoiseSource(context, SLIME_LEAP_SPRING_SECONDS);
    const springBand = context.createBiquadFilter();
    springBand.type = 'bandpass';
    springBand.Q.value = 2;
    springBand.frequency.setValueAtTime(150 * rate, springAt);
    springBand.frequency.exponentialRampToValueAtTime(
      400 * rate,
      springAt + SLIME_LEAP_SPRING_SECONDS
    );
    const springGain = context.createGain();
    springGain.gain.setValueAtTime(0.0001, springAt);
    springGain.gain.exponentialRampToValueAtTime(SLIME_LEAP_PEAK * level, springAt + 0.02);
    springGain.gain.exponentialRampToValueAtTime(
      0.0001,
      springAt + SLIME_LEAP_SPRING_SECONDS
    );
    spring.connect(springBand).connect(springGain).connect(out);
    spring.start(springAt);
    spring.stop(springAt + SLIME_LEAP_SPRING_SECONDS);
  }

  function playSlimeSquash(gainFactor = 1, pan = 0) {
    const context = ready();
    if (!context) return;
    const level = clampGain(gainFactor);
    if (level === 0) return;
    const now = context.currentTime;
    const out = panned(context, pan, context.destination);
    const rate = jitter(0.12);

    // Fat splat body: a lowpassed noise burst — all low-mid, no crack.
    const splat = createNoiseSource(context, SLIME_SQUASH_SECONDS);
    const splatLow = context.createBiquadFilter();
    splatLow.type = 'lowpass';
    splatLow.frequency.value = SLIME_SQUASH_NOISE_HZ * rate;
    const splatGain = context.createGain();
    splatGain.gain.setValueAtTime(SLIME_SQUASH_NOISE_PEAK * level, now);
    splatGain.gain.exponentialRampToValueAtTime(0.0001, now + SLIME_SQUASH_SECONDS);
    splat.connect(splatLow).connect(splatGain).connect(out);
    splat.start(now);
    splat.stop(now + SLIME_SQUASH_SECONDS);

    // Quick down-chirp under the splat — the blob deflating on impact.
    const chirp = context.createOscillator();
    chirp.type = 'sine';
    chirp.frequency.setValueAtTime(SLIME_SQUASH_CHIRP_START_HZ * rate, now);
    chirp.frequency.exponentialRampToValueAtTime(
      SLIME_SQUASH_CHIRP_END_HZ * rate,
      now + SLIME_SQUASH_SECONDS * 0.8
    );
    const chirpGain = context.createGain();
    chirpGain.gain.setValueAtTime(0.0001, now);
    chirpGain.gain.exponentialRampToValueAtTime(SLIME_SQUASH_CHIRP_PEAK * level, now + 0.012);
    chirpGain.gain.exponentialRampToValueAtTime(0.0001, now + SLIME_SQUASH_SECONDS);
    chirp.connect(chirpGain).connect(out);
    chirp.start(now);
    chirp.stop(now + SLIME_SQUASH_SECONDS + 0.02);
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

    // Main layer: high-Q bandpass noise climbing — rising WIND, not a note.
    const breath = createNoiseSource(context, durationSeconds);
    const breathBand = context.createBiquadFilter();
    breathBand.type = 'bandpass';
    breathBand.Q.value = RISER_BAND_Q;
    breathBand.frequency.setValueAtTime(RISER_BAND_START_HZ * jitter(0.05), now);
    breathBand.frequency.exponentialRampToValueAtTime(RISER_BAND_END_HZ * jitter(0.05), end);
    breath.connect(breathBand).connect(master);
    breath.start(now);
    breath.stop(end);

    // Low rumble building underneath — the ground-shaking weight of the windup.
    const rumble = createNoiseSource(context, durationSeconds);
    const rumbleLow = context.createBiquadFilter();
    rumbleLow.type = 'lowpass';
    rumbleLow.frequency.value = RISER_RUMBLE_HZ;
    const rumbleGain = context.createGain();
    rumbleGain.gain.value = RISER_RUMBLE_PEAK_FRACTION;
    rumble.connect(rumbleLow).connect(rumbleGain).connect(master);
    rumble.start(now);
    rumble.stop(end);

    // Cancel = windup interrupted: fast fade + stop. Safe to call twice and
    // after the natural end (stop() on a dead source just throws — swallow it).
    const cancel = () => {
      if (!activeRiserCancels.delete(cancel)) return;
      const at = context.currentTime;
      master.gain.cancelScheduledValues(at);
      master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), at);
      master.gain.exponentialRampToValueAtTime(0.0001, at + RISER_CANCEL_FADE_SECONDS);
      for (const source of [breath, rumble]) {
        try {
          source.stop(at + RISER_CANCEL_FADE_SECONDS + 0.01);
        } catch {
          // Already stopped — fine.
        }
      }
    };
    activeRiserCancels.add(cancel);
    // Natural end frees the concurrency slot without re-fading anything.
    breath.onended = () => activeRiserCancels.delete(cancel);
    return cancel;
  }

  return {
    playSwordSwing,
    playSpearThrust,
    playBowShot,
    playArcaneBolt,
    playProjectileImpact,
    playWindupRiser,
    playSlimeLeap,
    playSlimeSquash,
    dispose() {
      for (const cancel of [...activeRiserCancels]) cancel();
      activeRiserCancels.clear();
      gateNextAt.clear();
    },
  };
}
