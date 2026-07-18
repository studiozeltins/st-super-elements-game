// Wildlife one-shots (WILD-02): a PROCEDURAL wing-flap beat for the startle-flush
// birds, played on demand when a flush bursts (wired at the 12-05 call site). It is
// a sibling of createCombatAudio / createWeaponAudio / createMovementAudio — same
// module shape, same (gain, pan) convention, same sfx-bus routing — and mirrors the
// createAmbience.birdChirp synth recipe (create nodes, schedule an envelope off
// ctx.currentTime, connect to the bus, disconnect on .onended).
//
// A wing beat is broadband air, not a tone: each flap is a burst of short
// bandpass-filtered noise transients (~300–800Hz), staggered by a few tens of ms
// so the ear hears distinct wingbeats rather than one smear. Synth-first ships now;
// a real CC0 wing .ogg can drop in later via the createAmbience sampleCache pattern
// (preload + decode + a bufferSource in place of the synth) with ZERO changes to the
// call site or this interface.
//
// Gesture guard (Client Performance / WebAudio rule): browsers gate audio behind a
// user gesture, so playWingFlap NEVER throws mid-frame before the context unlocks —
// it returns silently until getContext() reports a running context (the exact
// createAmbience.ts ready() pattern).

import { clampGain, createNoiseSource, panned } from './audioCore';

// gain 0..1 scales loudness (0 skips playback); pan -1..1 places the flush left/right.
export interface WildlifeSfx {
  /** Procedural wing-flap: 2–3 staggered bandpass-noise transients — broadband air, not tonal. */
  playWingFlap(gain?: number, pan?: number): void;
  dispose(): void;
}

/** Number of wingbeats per flush burst — a small flock lifting off, not a single bird. */
const FLAP_COUNT = 3;
/** Each flap transient's length (~40ms) — a short air puff, not a sustained whoosh. */
const FLAP_SECONDS = 0.04;
/** Stagger between wingbeats (seconds) — a few tens of ms so beats read as distinct. */
const FLAP_STAGGER = 0.055;
/** Wing-air band (Hz): low-mid broadband, never tonal/whistly. */
const FLAP_BAND_HZ = 550;
const FLAP_Q = 0.7; // wide band = airy air-movement, not a pitched note
/** Peak per-flap loudness (pre user-gain) — a bandpass discards most noise energy. */
const FLAP_PEAK = 0.5;

export function createWildlifeSfx(
  getContext: () => AudioContext | null,
  getSfxBus: () => AudioNode | null
): WildlifeSfx {
  /** Running-context guard — never throw in the frame path before the gesture unlock. */
  function ready(): AudioContext | null {
    const context = getContext();
    return context && context.state === 'running' ? context : null;
  }

  return {
    playWingFlap(gainFactor = 1, pan = 0) {
      const ctx = ready();
      if (!ctx) return; // silently skip until the gesture unlock has run
      const level = clampGain(gainFactor);
      if (level === 0) return;
      const bus = getSfxBus();
      if (!bus) return;
      const out = panned(ctx, pan, bus);

      const now = ctx.currentTime;
      // A short burst of staggered wingbeats — each a filtered-noise air puff that
      // swells and dies within ~40ms, the next kicking in a few tens of ms later.
      for (let beat = 0; beat < FLAP_COUNT; beat += 1) {
        const start = now + beat * FLAP_STAGGER;
        const end = start + FLAP_SECONDS;
        const noise = createNoiseSource(ctx, FLAP_SECONDS);
        const band = ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.Q.value = FLAP_Q;
        // Each beat centered a touch differently so the flock is not a metronome.
        band.frequency.value = FLAP_BAND_HZ * (0.85 + Math.random() * 0.3);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(FLAP_PEAK * level, start + FLAP_SECONDS * 0.35);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);
        noise.connect(band).connect(gain).connect(out);
        noise.start(start);
        noise.stop(end);
        // Mandatory cleanup — release the per-beat nodes once they finish.
        noise.onended = () => {
          noise.disconnect();
          band.disconnect();
          gain.disconnect();
        };
      }
    },
    // No retained nodes — every beat self-cleans on .onended; the shared context is
    // owned/closed by createAudioSystem, not here.
    dispose() {},
  };
}
