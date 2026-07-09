// Zero-asset, zero-dependency WebAudio slam SFX (D4-15). Browsers gate audio
// behind a user gesture, so the factory registers one-time pointerdown/keydown
// listeners that create + resume the shared AudioContext — by the time a slam
// lands the context is already running (the game always has input before combat).

export interface AudioSystem {
  /** Procedural slam thump: low sine sweep + short filtered noise burst. */
  playSlam(): void;
  dispose(): void;
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
    const buffer = context.createBuffer(
      1,
      Math.ceil(context.sampleRate * noiseSeconds),
      context.sampleRate
    );
    const samples = buffer.getChannelData(0);
    for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
      samples[sampleIndex] = Math.random() * 2 - 1;
    }
    const noise = context.createBufferSource();
    noise.buffer = buffer;
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

  return {
    playSlam,
    dispose() {
      removeGestureListeners();
      void context?.close();
      context = null;
    },
  };
}
