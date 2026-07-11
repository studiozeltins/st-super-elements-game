// Zero-asset, zero-dependency WebAudio attack SFX (D4-15, ANIM-04): one
// procedural recipe per attack tier — swing lightest, swirl medium, slam full.
// Browsers gate audio behind a user gesture, so the factory registers one-time
// pointerdown/keydown listeners that create + resume the shared AudioContext —
// by the time a strike lands the context is already running (the game always
// has input before combat).

export interface AudioSystem {
  /** Procedural slam thump: low sine sweep + short filtered noise burst. `gain` 0..1 scales loudness (distance attenuation); 0 skips playback. */
  playSlam(gain?: number): void;
  /** Light swing whoosh: short bandpass noise sweep — the quietest tier. `gain` 0..1 scales loudness (distance attenuation); 0 skips playback. */
  playSwing(gain?: number): void;
  /** Medium swirl: longer noise swell + a low thump softer than the slam's. `gain` 0..1 scales loudness (distance attenuation); 0 skips playback. */
  playSwirl(gain?: number): void;
  /** Metallic shield clang: high-Q bandpass hit + detuned oscillator ring. `gain` 0..1 scales loudness (distance attenuation); 0 skips playback. */
  playDash(gain?: number): void;
  dispose(): void;
}

// shieldDash clang seeds (06-02) — playtest-tune at the 06-05 checkpoint.
// Playtest lesson (05-05 round 2): a bandpass discards most of the noise
// energy, so clang peaks must sit well ABOVE the slam's broadband 0.5 to be
// audible mid-combat — the high-Q band here keeps even less, hence 0.9.
/** Peak gain of the high-Q bandpass noise hit (the "clang" transient). */
const DASH_CLANG_NOISE_GAIN = 0.9;
/** Combined peak gain of the detuned oscillator pair (the metallic ring). */
const DASH_CLANG_RING_GAIN = 0.5;
/** Total clang duration in seconds (spec window 0.15–0.25s). */
const DASH_CLANG_SECONDS = 0.2;
/** Detuned ring pair: a few Hz apart so the beat between them reads metallic. */
const DASH_CLANG_RING_FREQUENCIES = [620, 626] as const;

/**
 * Clamps a caller-supplied loudness factor to (0..1]; returns 0 (= skip) for
 * silent/invalid input. WebAudio exponential ramps reject a target of exactly
 * 0, so every peak this factor scales must stay strictly positive.
 */
function clampGain(gain: number): number {
  if (!Number.isFinite(gain) || gain <= 0) return 0;
  return Math.min(1, gain);
}

/** A one-shot white-noise buffer source of the given length, ready to start. */
function createNoiseSource(ctx: AudioContext, seconds: number): AudioBufferSourceNode {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
    samples[sampleIndex] = Math.random() * 2 - 1;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  return source;
}

export function createAudioSystem(): AudioSystem {
  let context: AudioContext | null = null;

  function removeGestureListeners() {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  }

  function unlock() {
    if (!context) context = new AudioContext();
    void context.resume().then(() => {
      if (context?.state === 'running') removeGestureListeners();
    });
  }

  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  function playSlam(gainFactor = 1) {
    // Never throw mid-frame: silently skip until the gesture unlock has run.
    if (!context || context.state !== 'running') return;
    const level = clampGain(gainFactor);
    if (level === 0) return;
    const now = context.currentTime;

    // Low thump: sine sweeping ~70Hz → ~40Hz over 0.25s through a fast-attack,
    // exponential-decay gain envelope that reaches silence by ~0.35s.
    const thump = context.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(70, now);
    thump.frequency.exponentialRampToValueAtTime(40, now + 0.25);
    const thumpGain = context.createGain();
    thumpGain.gain.setValueAtTime(0.0001, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.8 * level, now + 0.01);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    thump.connect(thumpGain).connect(context.destination);
    thump.start(now);
    thump.stop(now + 0.4);

    // Impact texture: a short lowpass-filtered white-noise burst.
    const noiseSeconds = 0.12;
    const noise = createNoiseSource(context, noiseSeconds);
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    const noiseGain = context.createGain();
    noiseGain.gain.setValueAtTime(0.5 * level, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + noiseSeconds);
    noise.connect(filter).connect(noiseGain).connect(context.destination);
    noise.start(now);
    noise.stop(now + noiseSeconds);
  }

  function playSwing(gainFactor = 1) {
    // Never throw mid-frame: silently skip until the gesture unlock has run.
    if (!context || context.state !== 'running') return;
    const level = clampGain(gainFactor);
    if (level === 0) return;
    const now = context.currentTime;

    // Light whoosh (lightest tier): a short bandpass sweep rising through a
    // noise burst — shorter and lighter than the slam, but clearly audible.
    // Playtest fix (05-05 round 2): the original 0.25-gain Q1.2 recipe was
    // inaudible under gameplay — a bandpass discards most of the noise energy,
    // so the peak gain must sit far above the slam's broadband 0.5 to compete.
    const seconds = 0.2;
    const noise = createNoiseSource(context, seconds);
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.8;
    filter.frequency.setValueAtTime(500, now);
    filter.frequency.exponentialRampToValueAtTime(2200, now + seconds);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.6 * level, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    noise.connect(filter).connect(gain).connect(context.destination);
    noise.start(now);
    noise.stop(now + seconds);

    // Light percussive "thock" under the whoosh so the hit registers on small
    // speakers that reproduce little of the filtered hiss — well above the
    // slam's 70Hz so the tiers stay distinct.
    const thock = context.createOscillator();
    thock.type = 'sine';
    thock.frequency.setValueAtTime(160, now);
    thock.frequency.exponentialRampToValueAtTime(95, now + 0.1);
    const thockGain = context.createGain();
    thockGain.gain.setValueAtTime(0.0001, now);
    thockGain.gain.exponentialRampToValueAtTime(0.4 * level, now + 0.01);
    thockGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    thock.connect(thockGain).connect(context.destination);
    thock.start(now);
    thock.stop(now + 0.16);
  }

  function playSwirl(gainFactor = 1) {
    // Never throw mid-frame: silently skip until the gesture unlock has run.
    if (!context || context.state !== 'running') return;
    const level = clampGain(gainFactor);
    if (level === 0) return;
    const now = context.currentTime;

    // Whirling swell (medium tier): a longer bandpass noise that rises then
    // falls — the blade cutting a full circle of air. Playtest fix (05-05
    // round 2): swell gain raised 0.4 → 0.75 (bandpass eats most of the noise
    // energy) so the circle-cut is actually audible mid-combat.
    const seconds = 0.4;
    const noise = createNoiseSource(context, seconds);
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.7;
    filter.frequency.setValueAtTime(300, now);
    filter.frequency.exponentialRampToValueAtTime(1200, now + seconds * 0.6);
    filter.frequency.exponentialRampToValueAtTime(500, now + seconds);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.75 * level, now + seconds * 0.5);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    noise.connect(filter).connect(gain).connect(context.destination);
    noise.start(now);
    noise.stop(now + seconds);

    // Broadband impact texture (like the slam's, softer): this is what carries
    // the "hit" on small speakers that reproduce almost no sub-100Hz thump.
    const impactSeconds = 0.1;
    const impact = createNoiseSource(context, impactSeconds);
    const impactFilter = context.createBiquadFilter();
    impactFilter.type = 'lowpass';
    impactFilter.frequency.value = 500;
    const impactGain = context.createGain();
    impactGain.gain.setValueAtTime(0.35 * level, now);
    impactGain.gain.exponentialRampToValueAtTime(0.0001, now + impactSeconds);
    impact.connect(impactFilter).connect(impactGain).connect(context.destination);
    impact.start(now);
    impact.stop(now + impactSeconds);

    // A low thump under the swell — higher and softer than the slam's
    // 70→40Hz 0.8-gain hit, so the slam stays the loudest tier.
    const thump = context.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(85, now);
    thump.frequency.exponentialRampToValueAtTime(50, now + 0.2);
    const thumpGain = context.createGain();
    thumpGain.gain.setValueAtTime(0.0001, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.55 * level, now + 0.02);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    thump.connect(thumpGain).connect(context.destination);
    thump.start(now);
    thump.stop(now + 0.35);
  }

  function playDash(gainFactor = 1) {
    // Never throw mid-frame: silently skip until the gesture unlock has run.
    if (!context || context.state !== 'running') return;
    const level = clampGain(gainFactor);
    if (level === 0) return;
    const now = context.currentTime;

    // Shield-clang transient: a short HIGH-Q bandpass noise hit — the narrow
    // band reads as struck metal, not the swing's cut air. The band falls
    // 1800 → 900Hz so the hit "rings down" instead of hissing.
    const noise = createNoiseSource(context, DASH_CLANG_SECONDS);
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 8;
    filter.frequency.setValueAtTime(1800, now);
    filter.frequency.exponentialRampToValueAtTime(900, now + DASH_CLANG_SECONDS);
    const noiseGain = context.createGain();
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.exponentialRampToValueAtTime(DASH_CLANG_NOISE_GAIN * level, now + 0.008);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + DASH_CLANG_SECONDS);
    noise.connect(filter).connect(noiseGain).connect(context.destination);
    noise.start(now);
    noise.stop(now + DASH_CLANG_SECONDS);

    // Metallic ring: a brief detuned oscillator pair — the few-Hz beat between
    // them is the shield face still vibrating after the hit. Split the ring
    // gain across the pair so their sum stays at the seed level.
    for (const frequency of DASH_CLANG_RING_FREQUENCIES) {
      const ring = context.createOscillator();
      ring.type = 'triangle';
      ring.frequency.setValueAtTime(frequency, now);
      const ringGain = context.createGain();
      ringGain.gain.setValueAtTime(0.0001, now);
      ringGain.gain.exponentialRampToValueAtTime(
        (DASH_CLANG_RING_GAIN / DASH_CLANG_RING_FREQUENCIES.length) * level,
        now + 0.01
      );
      ringGain.gain.exponentialRampToValueAtTime(0.0001, now + DASH_CLANG_SECONDS);
      ring.connect(ringGain).connect(context.destination);
      ring.start(now);
      ring.stop(now + DASH_CLANG_SECONDS + 0.02);
    }
  }

  return {
    playSlam,
    playSwing,
    playSwirl,
    playDash,
    dispose() {
      removeGestureListeners();
      void context?.close();
      context = null;
    },
  };
}
