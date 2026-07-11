// Zero-asset, zero-dependency WebAudio attack SFX (D4-15, ANIM-04): one
// procedural recipe per attack tier — swing lightest, swirl medium, slam full.
// Browsers gate audio behind a user gesture, so the factory registers one-time
// pointerdown/keydown listeners that create + resume the shared AudioContext —
// by the time a strike lands the context is already running (the game always
// has input before combat).

import { clampGain, createNoiseSource, panned } from './audioCore';

// Every play function: `gain` 0..1 scales loudness (distance attenuation, 0
// skips playback); `pan` -1..1 places the strike left/right of the listener.
export interface AudioSystem {
  /** Procedural slam thump: low sine sweep + short filtered noise burst. */
  playSlam(gain?: number, pan?: number): void;
  /** Light swing whoosh: pure high-band air sweep, no low content — the quietest tier. */
  playSwing(gain?: number, pan?: number): void;
  /** Medium swirl: tremolo'd (rotating) noise swell + a soft low thump under the slam's. */
  playSwirl(gain?: number, pan?: number): void;
  /** Shield dash landing: skid-in scrape, then the high-Q metallic clang + detuned ring. */
  playDash(gain?: number, pan?: number): void;
  /** Deep airy whoosh riding a goliath leap's travel: broadband noise falling ~900→250Hz across durationSeconds. Noise-based on purpose — real displaced air, not another tonal cue. */
  playLeapWhoosh(durationSeconds: number, gain?: number, pan?: number): void;
  /** Shared gesture-unlocked context — sibling SFX modules (combat feedback) play through it. */
  getContext(): AudioContext | null;
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
// Pre-impact skid (playtest 2026-07-12: the four strikes read too alike): a
// short low-band scrape leads the clang so the dash reads "skidding into you".
const DASH_SCRAPE_SECONDS = 0.06;
const DASH_SCRAPE_GAIN = 0.35;
/** The clang lands this late so the skid audibly comes FIRST (visually imperceptible). */
const DASH_IMPACT_DELAY_SECONDS = 0.05;
// Swirl rotation cue (same playtest): a tremolo LFO on the swell spins the
// circle-cut so the swirl reads as rotation, not another slam.
const SWIRL_TREMOLO_HZ = 7;
const SWIRL_TREMOLO_DEPTH = 0.45;
// Leap-travel whoosh (playtest 2026-07-12: the leap read too "piano"/tonal —
// the mass in the air needs actual AIR): a wide bandpass noise falling from
// bright to deep across the travel, slow attack so it swells in rather than
// clicking on.
const WHOOSH_BAND_START_HZ = 900;
const WHOOSH_BAND_END_HZ = 250;
const WHOOSH_PEAK = 0.4;
const WHOOSH_Q = 0.6; // wide band = airy, never whistly

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

  function playSlam(gainFactor = 1, pan = 0) {
    // Never throw mid-frame: silently skip until the gesture unlock has run.
    if (!context || context.state !== 'running') return;
    const level = clampGain(gainFactor);
    if (level === 0) return;
    const now = context.currentTime;
    const out = panned(context, pan, context.destination);

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
    thump.connect(thumpGain).connect(out);
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
    noise.connect(filter).connect(noiseGain).connect(out);
    noise.start(now);
    noise.stop(now + noiseSeconds);
  }

  function playSwing(gainFactor = 1, pan = 0) {
    // Never throw mid-frame: silently skip until the gesture unlock has run.
    if (!context || context.state !== 'running') return;
    const level = clampGain(gainFactor);
    if (level === 0) return;
    const now = context.currentTime;
    const out = panned(context, pan, context.destination);

    // Pure air (playtest 2026-07-12: the swing's low thock made it read like
    // the slam's little sibling — ALL low content removed, band raised to a
    // bright 900→3000Hz cut, shorter): the lightest tier is now nothing but
    // the blade slicing air. Peak stays 0.6 — a bandpass discards most of the
    // noise energy (05-05 round 2 lesson), so it must sit above the slam's
    // broadband 0.5 to compete.
    const seconds = 0.15;
    const noise = createNoiseSource(context, seconds);
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.8;
    filter.frequency.setValueAtTime(900, now);
    filter.frequency.exponentialRampToValueAtTime(3000, now + seconds);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.6 * level, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    noise.connect(filter).connect(gain).connect(out);
    noise.start(now);
    noise.stop(now + seconds);
  }

  function playSwirl(gainFactor = 1, pan = 0) {
    // Never throw mid-frame: silently skip until the gesture unlock has run.
    if (!context || context.state !== 'running') return;
    const level = clampGain(gainFactor);
    if (level === 0) return;
    const now = context.currentTime;
    const out = panned(context, pan, context.destination);

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
    // ~7Hz tremolo (≈2-3 cycles across the swell) in series after the envelope:
    // the pulsing is what reads "spinning" instead of a second slam boom.
    const tremolo = context.createGain();
    tremolo.gain.setValueAtTime(1, now);
    const lfo = context.createOscillator();
    lfo.frequency.value = SWIRL_TREMOLO_HZ;
    const lfoDepth = context.createGain();
    lfoDepth.gain.value = SWIRL_TREMOLO_DEPTH;
    lfo.connect(lfoDepth).connect(tremolo.gain);
    lfo.start(now);
    lfo.stop(now + seconds);
    noise.connect(filter).connect(gain).connect(tremolo).connect(out);
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
    impact.connect(impactFilter).connect(impactGain).connect(out);
    impact.start(now);
    impact.stop(now + impactSeconds);

    // A low thump under the swell — higher and softer than the slam's 70→40Hz
    // 0.8-gain hit. Halved 0.55 → 0.28 (playtest 2026-07-12): at 0.55 the
    // thump WAS the sound and the swirl read as a slam.
    const thump = context.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(85, now);
    thump.frequency.exponentialRampToValueAtTime(50, now + 0.2);
    const thumpGain = context.createGain();
    thumpGain.gain.setValueAtTime(0.0001, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.28 * level, now + 0.02);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    thump.connect(thumpGain).connect(out);
    thump.start(now);
    thump.stop(now + 0.35);
  }

  function playDash(gainFactor = 1, pan = 0) {
    // Never throw mid-frame: silently skip until the gesture unlock has run.
    if (!context || context.state !== 'running') return;
    const level = clampGain(gainFactor);
    if (level === 0) return;
    const now = context.currentTime;
    const out = panned(context, pan, context.destination);

    // Skid-in scrape: a very short low-band noise rising 400→900Hz right
    // before the clang — the shield grinding the ground on the way in.
    const scrape = createNoiseSource(context, DASH_SCRAPE_SECONDS);
    const scrapeBand = context.createBiquadFilter();
    scrapeBand.type = 'bandpass';
    scrapeBand.Q.value = 2;
    scrapeBand.frequency.setValueAtTime(400, now);
    scrapeBand.frequency.exponentialRampToValueAtTime(900, now + DASH_SCRAPE_SECONDS);
    const scrapeGain = context.createGain();
    scrapeGain.gain.setValueAtTime(DASH_SCRAPE_GAIN * level, now);
    scrapeGain.gain.exponentialRampToValueAtTime(0.0001, now + DASH_SCRAPE_SECONDS + 0.02);
    scrape.connect(scrapeBand).connect(scrapeGain).connect(out);
    scrape.start(now);
    scrape.stop(now + DASH_SCRAPE_SECONDS + 0.02);

    // Shield-clang transient: a short HIGH-Q bandpass noise hit — the narrow
    // band reads as struck metal, not the swing's cut air. The band falls
    // 1800 → 900Hz so the hit "rings down" instead of hissing.
    const impactAt = now + DASH_IMPACT_DELAY_SECONDS;
    const noise = createNoiseSource(context, DASH_CLANG_SECONDS);
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 8;
    filter.frequency.setValueAtTime(1800, impactAt);
    filter.frequency.exponentialRampToValueAtTime(900, impactAt + DASH_CLANG_SECONDS);
    const noiseGain = context.createGain();
    noiseGain.gain.setValueAtTime(0.0001, impactAt);
    noiseGain.gain.exponentialRampToValueAtTime(DASH_CLANG_NOISE_GAIN * level, impactAt + 0.008);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, impactAt + DASH_CLANG_SECONDS);
    noise.connect(filter).connect(noiseGain).connect(out);
    noise.start(impactAt);
    noise.stop(impactAt + DASH_CLANG_SECONDS);

    // Metallic ring: a brief detuned oscillator pair — the few-Hz beat between
    // them is the shield face still vibrating after the hit. Split the ring
    // gain across the pair so their sum stays at the seed level.
    for (const frequency of DASH_CLANG_RING_FREQUENCIES) {
      const ring = context.createOscillator();
      ring.type = 'triangle';
      ring.frequency.setValueAtTime(frequency, impactAt);
      const ringGain = context.createGain();
      ringGain.gain.setValueAtTime(0.0001, impactAt);
      ringGain.gain.exponentialRampToValueAtTime(
        (DASH_CLANG_RING_GAIN / DASH_CLANG_RING_FREQUENCIES.length) * level,
        impactAt + 0.01
      );
      ringGain.gain.exponentialRampToValueAtTime(0.0001, impactAt + DASH_CLANG_SECONDS);
      ring.connect(ringGain).connect(out);
      ring.start(impactAt);
      ring.stop(impactAt + DASH_CLANG_SECONDS + 0.02);
    }
  }

  function playLeapWhoosh(durationSeconds: number, gainFactor = 1, pan = 0) {
    // Never throw mid-frame: silently skip until the gesture unlock has run.
    if (!context || context.state !== 'running') return;
    const level = clampGain(gainFactor);
    if (level === 0 || durationSeconds <= 0) return;
    const now = context.currentTime;
    const end = now + durationSeconds;
    const out = panned(context, pan, context.destination);

    const air = createNoiseSource(context, durationSeconds);
    const band = context.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = WHOOSH_Q;
    band.frequency.setValueAtTime(WHOOSH_BAND_START_HZ, now);
    band.frequency.exponentialRampToValueAtTime(WHOOSH_BAND_END_HZ, end);
    const gain = context.createGain();
    // Slow attack across ~40% of the travel, peaking as the mass bears down,
    // then dying into the landing (the slam SFX owns the impact itself).
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(WHOOSH_PEAK * level, now + durationSeconds * 0.4);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    air.connect(band).connect(gain).connect(out);
    air.start(now);
    air.stop(end);
  }

  return {
    playSlam,
    playSwing,
    playSwirl,
    playDash,
    playLeapWhoosh,
    getContext: () => context,
    dispose() {
      removeGestureListeners();
      void context?.close();
      context = null;
    },
  };
}
