// Shared WebAudio primitives for the procedural SFX modules (attack SFX +
// combat feedback). Zero assets, zero dependencies.

/**
 * Clamps a caller-supplied loudness factor to (0..1]; returns 0 (= skip) for
 * silent/invalid input. WebAudio exponential ramps reject a target of exactly
 * 0, so every peak this factor scales must stay strictly positive.
 */
export function clampGain(gain: number): number {
  if (!Number.isFinite(gain) || gain <= 0) return 0;
  return Math.min(1, gain);
}

/** A one-shot white-noise buffer source of the given length, ready to start. */
export function createNoiseSource(ctx: AudioContext, seconds: number): AudioBufferSourceNode {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
    samples[sampleIndex] = Math.random() * 2 - 1;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  return source;
}

/**
 * Random playback-rate/frequency multiplier: 1 ± spread. Repetition is what
 * makes high-DPS audio fatiguing — every per-hit sound must pass its
 * frequencies through this so no two hits are identical.
 */
export function jitter(spread: number): number {
  return 1 + (Math.random() * 2 - 1) * spread;
}

/**
 * Positional output node: `into` unchanged for a centered sound, or wrapped in
 * a StereoPanner so a world sound sits left/right the way it sits on screen.
 */
export function panned(context: AudioContext, pan: number, into: AudioNode): AudioNode {
  if (!pan) return into;
  const panner = context.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, pan));
  panner.connect(into);
  return panner;
}
