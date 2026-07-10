// Zero-asset, zero-dependency WebAudio attack SFX (D4-15, ANIM-04): one
// procedural recipe per attack tier — swing lightest, swirl medium, slam full.
// Browsers gate audio behind a user gesture, so the factory registers one-time
// pointerdown/keydown listeners that create + resume the shared AudioContext —
// by the time a strike lands the context is already running (the game always
// has input before combat).

export interface AudioSystem {
  /** Procedural slam thump: low sine sweep + short filtered noise burst. */
  playSlam(): void;
  /** Light swing whoosh: short bandpass noise sweep — the quietest tier. */
  playSwing(): void;
  /** Medium swirl: longer noise swell + a low thump softer than the slam's. */
  playSwirl(): void;
  dispose(): void;
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

  function playSlam() {
    // Never throw mid-frame: silently skip until the gesture unlock has run.
    if (!context || context.state !== 'running') return;
    const now = context.currentTime;

    // Low thump: sine sweeping ~70Hz → ~40Hz over 0.25s through a fast-attack,
    // exponential-decay gain envelope that reaches silence by ~0.35s.
    const thump = context.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(70, now);
    thump.frequency.exponentialRampToValueAtTime(40, now + 0.25);
    const thumpGain = context.createGain();
    thumpGain.gain.setValueAtTime(0.0001, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.8, now + 0.01);
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
    noiseGain.gain.setValueAtTime(0.5, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + noiseSeconds);
    noise.connect(filter).connect(noiseGain).connect(context.destination);
    noise.start(now);
    noise.stop(now + noiseSeconds);
  }

  function playSwing() {
    // Never throw mid-frame: silently skip until the gesture unlock has run.
    if (!context || context.state !== 'running') return;
    const now = context.currentTime;

    // Light whoosh (lightest tier): a short bandpass sweep rising through a
    // noise burst — clearly quieter and shorter than the slam.
    const seconds = 0.2;
    const noise = createNoiseSource(context, seconds);
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(500, now);
    filter.frequency.exponentialRampToValueAtTime(2200, now + seconds);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    noise.connect(filter).connect(gain).connect(context.destination);
    noise.start(now);
    noise.stop(now + seconds);
  }

  function playSwirl() {
    // Never throw mid-frame: silently skip until the gesture unlock has run.
    if (!context || context.state !== 'running') return;
    const now = context.currentTime;

    // Whirling swell (medium tier): a longer bandpass noise that rises then
    // falls — the blade cutting a full circle of air.
    const seconds = 0.4;
    const noise = createNoiseSource(context, seconds);
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.9;
    filter.frequency.setValueAtTime(300, now);
    filter.frequency.exponentialRampToValueAtTime(1200, now + seconds * 0.6);
    filter.frequency.exponentialRampToValueAtTime(500, now + seconds);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.4, now + seconds * 0.5);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    noise.connect(filter).connect(gain).connect(context.destination);
    noise.start(now);
    noise.stop(now + seconds);

    // A low thump under the swell — higher and softer than the slam's
    // 70→40Hz 0.8-gain hit, so the slam stays the loudest tier.
    const thump = context.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(90, now);
    thump.frequency.exponentialRampToValueAtTime(55, now + 0.2);
    const thumpGain = context.createGain();
    thumpGain.gain.setValueAtTime(0.0001, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.35, now + 0.02);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    thump.connect(thumpGain).connect(context.destination);
    thump.start(now);
    thump.stop(now + 0.35);
  }

  return {
    playSlam,
    playSwing,
    playSwirl,
    dispose() {
      removeGestureListeners();
      void context?.close();
      context = null;
    },
  };
}
