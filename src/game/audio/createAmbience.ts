// The living-world ambience layer (AMBI-02/03/05/07, D-05/D-06/D-10/D-11): a
// PROCEDURAL wind bed that is near-silent between gusts and swells, brightens,
// and pans as a gust passes — driven by the PLAYER-LOCAL gust (windMath.gustAt)
// so the sound tracks the VISIBLE swirl in 3D rather than a constant hiss — plus
// ONE reusable randomized one-shot scheduler driving three creature layers — day
// birds, night crickets/owl, and a distant goliath grunt scaled by camp
// proximity. All timing/gain/timbre math lives in ambienceMath.ts (pure,
// vitest-twinned); this wrapper only turns those numbers into WebAudio nodes.
//
// Recordings are the default (D-04): each creature layer plays a decoded `.ogg`
// from createSampleCache when one has been dropped in. Until then every layer
// falls back to a cheap procedural SYNTH voice (D-06 for the grunt, extended to
// birds/crickets/owl so the world is audibly alive out of the box) — dropping the
// real recordings later transparently overrides the synth with zero code change.
//
// Per-frame discipline (Client Performance Rules): `update()` allocates NOTHING —
// it only stores the latest phase/combat, builds the bed once, and writes three
// AudioParams (bed swell gain, lowpass cutoff, stereo pan) via setTargetAtTime.
// All node creation happens in
// `fire()`, which runs off self-rescheduling setTimeout timers (NOT the frame
// loop), so a gated-off layer (wrong time of day / in combat) costs nothing but a
// sleeping timer. The gust swell lives on the bed's OWN inner gain, kept separate
// from the ambient BUS duck node (RESEARCH Pitfall 5 — two writers on one param).

import { clampGain, createNoiseSource, jitter, panned } from './audioCore';
import {
  BIRD_MIN_S,
  BIRD_MAX_S,
  NIGHT_MIN_S,
  NIGHT_MAX_S,
  NIGHT_BACKOFF_STEP,
  NIGHT_BACKOFF_CAP,
  GRUNT_MIN_S,
  GRUNT_MAX_S,
  bedCutoff,
  bedGainTarget,
  gruntProximityGain,
  isBirdTime,
  isNightCreatureTime,
  jitterFactor,
  nextBackoffDelay,
  nextOneShotDelay,
} from './ambienceMath';
import type { SampleCache } from './createSampleCache';

export interface Ambience {
  /**
   * Called once per frame after daynight.update(): stores phase/combat and drives the
   * wind bed from the PLAYER-LOCAL gust — gain swells, lowpass brightens, and stereo
   * `pan` (−1..1, wind's on-screen direction) places the swirl in 3D. Zero-alloc.
   */
  update(deltaSeconds: number, gust: number, phase01: number, inCombat: boolean, pan: number): void;
  dispose(): void;
}

// ── Creature recording paths (served from public/audio/creatures/, D-14) ────
const CREATURES = '/audio/creatures/';
const BIRD_URLS = [`${CREATURES}bird-chirp-1.ogg`, `${CREATURES}bird-chirp-2.ogg`, `${CREATURES}bird-chirp-3.ogg`];
const NIGHT_URLS = [`${CREATURES}cricket-1.ogg`, `${CREATURES}cricket-2.ogg`, `${CREATURES}owl-hoot.ogg`];
const GRUNT_URLS = [`${CREATURES}goliath-grunt.ogg`];

// ── Wind bed (procedural, gust-gated + spatial, D-05) ────────────────────────
/** Looping noise buffer length — long enough that the loop seam is inaudible. */
const BED_NOISE_SECONDS = 3;
/** Bed-swell / cutoff smoothing τ (~0.15s) so the gust swell never zippers (Pitfall 4). */
const BED_SMOOTH_TAU = 0.15;
/** Pan smoothing τ — slower so the 3D wind drifts across the field, never snaps. */
const BED_PAN_TAU = 0.4;

// ── Per-shot jitter seeds (AMBI-03: pitch ±10-20%, plus gain + pan variation) ─
const PITCH_SPREAD = 0.15;
const GAIN_SPREAD = 0.15;
/** Base per-shot loudness for the day/night creature layers (pre-jitter). */
const CREATURE_GAIN = 0.5;
/** Night crickets/owl are quieter than the day birds — a still night, not a chorus. */
const NIGHT_GAIN = 0.26;
/** Stereo spread for creature one-shots — they sit around the player, not dead-center. */
const CREATURE_PAN = 0.6;
const GRUNT_PAN = 0.4;

/** One randomized creature layer: an active() gate, a gain source, recordings + a synth fallback. */
interface OneShotLayer {
  /** Plays only when true (time-of-day / combat / proximity gate). */
  active(): boolean;
  /** Per-shot base gain (before jitter) — constant for birds/crickets, proximity-scaled for the grunt. */
  gainFor(): number;
  /** Recording candidates (a random one is chosen per shot); empty falls straight to synth. */
  urls: string[];
  minS: number;
  maxS: number;
  panRange: number;
  /** Procedural voice used when no recording is decoded yet (D-04/D-06 fallback). */
  synth(ctx: AudioContext, out: AudioNode, gain: number): void;
  timer: ReturnType<typeof setTimeout> | null;
  /** Progressive-backoff layer: each fire stretches the next delay, reset when quiet. */
  backoff: boolean;
  /** Fires so far this active spell — grows the backoff, reset while inactive. */
  streak: number;
}

export function createAmbience(
  getContext: () => AudioContext | null,
  getAmbientBus: () => GainNode | null,
  sampleCache: SampleCache,
  getCampDistance: () => number
): Ambience {
  // Latest state from update() — read by the timer-driven active() gates so a
  // shot that fires between frames sees current time-of-day / combat.
  let lastPhase = 0;
  let lastInCombat = false;
  let disposed = false;

  // Procedural bed nodes, (re)built once per context (async unlock).
  let bedContext: AudioContext | null = null;
  let bedSource: AudioBufferSourceNode | null = null;
  let bedInnerGain: GainNode | null = null;
  let bedFilter: BiquadFilterNode | null = null; // cutoff brightens with the gust (airy whoosh, not static hiss)
  let bedPanner: StereoPannerNode | null = null; // 3D: places the swirl on the wind's on-screen side

  function ready(): AudioContext | null {
    const context = getContext();
    return context && context.state === 'running' ? context : null;
  }

  // Warm the recordings immediately (network is context-free — Pitfall 1); they
  // decode lazily once the context unlocks. Absent files simply never decode.
  for (const url of [...BIRD_URLS, ...NIGHT_URLS, ...GRUNT_URLS]) sampleCache.preload(url);

  // ── Synth fallback voices (cheap, procedural; overridden by any recording) ──
  function birdChirp(ctx: AudioContext, out: AudioNode, gain: number): void {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const base = 2600 + Math.random() * 1600;
    osc.frequency.setValueAtTime(base * 0.8, now);
    osc.frequency.linearRampToValueAtTime(base * 1.25, now + 0.04);
    osc.frequency.linearRampToValueAtTime(base * 0.9, now + 0.11);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(gain, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
    osc.connect(g).connect(out);
    osc.start(now);
    osc.stop(now + 0.14);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  function cricketChirr(ctx: AudioContext, out: AudioNode, gain: number): void {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 4200 + Math.random() * 700;
    const trill = ctx.createOscillator(); // fast tremolo → the cricket "chirr"
    trill.type = 'square';
    trill.frequency.value = 40 + Math.random() * 12;
    const trillDepth = ctx.createGain();
    trillDepth.gain.value = gain * 0.45;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(gain * 0.45, now + 0.02);
    g.gain.setValueAtTime(gain * 0.45, now + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
    trill.connect(trillDepth).connect(g.gain); // AudioParam sums envelope + tremolo
    osc.connect(g).connect(out);
    osc.start(now);
    trill.start(now);
    osc.stop(now + 0.27);
    trill.stop(now + 0.27);
    osc.onended = () => {
      osc.disconnect();
      trill.disconnect();
      trillDepth.disconnect();
      g.disconnect();
    };
  }

  function owlHoot(ctx: AudioContext, out: AudioNode, gain: number): void {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(360, now);
    osc.frequency.linearRampToValueAtTime(300, now + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(gain * 0.7, now + 0.05);
    g.gain.linearRampToValueAtTime(0.0001, now + 0.4);
    osc.connect(g).connect(out);
    osc.start(now);
    osc.stop(now + 0.42);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  /** Night synth: mostly crickets, an occasional owl (~1 in 5). */
  function nightVoice(ctx: AudioContext, out: AudioNode, gain: number): void {
    if (Math.random() < 0.2) owlHoot(ctx, out, gain);
    else cricketChirr(ctx, out, gain);
  }

  function gruntGrowl(ctx: AudioContext, out: AudioNode, gain: number): void {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const base = 70 + Math.random() * 50;
    osc.frequency.setValueAtTime(base * 1.1, now);
    osc.frequency.linearRampToValueAtTime(base * 0.85, now + 0.5);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(gain, now + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    osc.connect(filter).connect(g).connect(out);
    osc.start(now);
    osc.stop(now + 0.56);
    osc.onended = () => {
      osc.disconnect();
      filter.disconnect();
      g.disconnect();
    };
  }

  // ── Decoded-recording playback (preferred path when a sample exists) ────────
  function playBuffer(ctx: AudioContext, out: AudioNode, buffer: AudioBuffer, gain: number): void {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = jitter(PITCH_SPREAD); // per-shot pitch, never fixed
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(out);
    src.start();
    src.onended = () => {
      src.disconnect();
      g.disconnect();
    };
  }

  // ── One-shot fire path (shared by all three layers, SRP: timing vs sound) ───
  function fire(layer: OneShotLayer): void {
    const ctx = ready();
    const bus = getAmbientBus();
    if (!ctx || !bus || !layer.active()) {
      if (layer.backoff) layer.streak = 0; // a quiet spell (e.g. daytime) resets the backoff
      return;
    }
    const gain = clampGain(layer.gainFor() * jitterFactor(GAIN_SPREAD, Math.random()));
    if (gain <= 0) return;
    const pan = (Math.random() * 2 - 1) * layer.panRange;
    const out = panned(ctx, pan, bus);
    const url = layer.urls.length ? layer.urls[Math.floor(Math.random() * layer.urls.length)] : '';
    const buffer = url ? sampleCache.get(url) : null;
    if (buffer) playBuffer(ctx, out, buffer, gain);
    else layer.synth(ctx, out, gain);
    // Backoff layers thin out the longer they run (crickets slowing into the night).
    if (layer.backoff) layer.streak = Math.min(layer.streak + 1, 8);
  }

  /** Self-rescheduling timer — non-metronomic delay, gated only at fire time. */
  function scheduleNext(layer: OneShotLayer): void {
    if (disposed) return;
    const delayMs =
      (layer.backoff
        ? nextBackoffDelay(
            layer.minS,
            layer.maxS,
            layer.streak,
            NIGHT_BACKOFF_STEP,
            NIGHT_BACKOFF_CAP,
            Math.random()
          )
        : nextOneShotDelay(layer.minS, layer.maxS, Math.random())) * 1000;
    layer.timer = setTimeout(() => {
      fire(layer);
      scheduleNext(layer);
    }, delayMs);
  }

  const layers: OneShotLayer[] = [
    {
      // Day birds — stop entirely in combat (AMBI-06 birds-stop half, D-08).
      active: () => isBirdTime(lastPhase) && !lastInCombat,
      gainFor: () => CREATURE_GAIN,
      urls: BIRD_URLS,
      minS: BIRD_MIN_S,
      maxS: BIRD_MAX_S,
      panRange: CREATURE_PAN,
      synth: birdChirp,
      timer: null,
      backoff: false,
      streak: 0,
    },
    {
      // Night crickets + occasional owl (AMBI-07 night band). Quieter than the day
      // birds, sparser window, and PROGRESSIVE BACKOFF so it thins into the night.
      active: () => isNightCreatureTime(lastPhase),
      gainFor: () => NIGHT_GAIN,
      urls: NIGHT_URLS,
      minS: NIGHT_MIN_S,
      maxS: NIGHT_MAX_S,
      panRange: CREATURE_PAN,
      synth: nightVoice,
      timer: null,
      backoff: true,
      streak: 0,
    },
    {
      // Distant goliath grunt — gain scales with nearest-camp proximity (AMBI-05).
      active: () => gruntProximityGain(getCampDistance()) > 0,
      gainFor: () => gruntProximityGain(getCampDistance()),
      urls: GRUNT_URLS,
      minS: GRUNT_MIN_S,
      maxS: GRUNT_MAX_S,
      panRange: GRUNT_PAN,
      synth: gruntGrowl,
      timer: null,
      backoff: false,
      streak: 0,
    },
  ];
  for (const layer of layers) scheduleNext(layer);

  /** Build the looping procedural wind bed once per context (Pitfall 1). */
  function buildBed(ctx: AudioContext, bus: GainNode): void {
    if (bedSource) {
      try {
        bedSource.stop();
      } catch {
        /* already stopped */
      }
      bedSource.disconnect();
    }
    bedFilter?.disconnect();
    bedPanner?.disconnect();
    bedInnerGain?.disconnect();

    const noise = createNoiseSource(ctx, BED_NOISE_SECONDS);
    noise.loop = true;
    const filter = ctx.createBiquadFilter(); // cutoff opens with the gust (dynamic timbre, not static hiss)
    filter.type = 'lowpass';
    filter.frequency.value = bedCutoff(0);
    const panner = ctx.createStereoPanner(); // 3D: swirl sits on the wind's on-screen side
    panner.pan.value = 0;
    const innerGain = ctx.createGain(); // the SWELL node — separate from the bus duck (Pitfall 5)
    innerGain.gain.value = bedGainTarget(0);
    noise.connect(filter).connect(panner).connect(innerGain).connect(bus);
    noise.start();

    bedSource = noise;
    bedFilter = filter;
    bedPanner = panner;
    bedInnerGain = innerGain;
    bedContext = ctx;
  }

  return {
    update(deltaSeconds, gust, phase01, inCombat, pan) {
      void deltaSeconds; // scheduler is timer-driven; delta unused (kept for API symmetry)
      lastPhase = phase01;
      lastInCombat = inCombat;
      const ctx = ready();
      if (!ctx) return;
      const bus = getAmbientBus();
      if (!bus) return;
      if (bedContext !== ctx) buildBed(ctx, bus);
      // Three AudioParam writes per frame, zero-alloc: swell the bed toward the
      // PLAYER-LOCAL gust (loud only while the visible swirl is on you), open the
      // lowpass with it (airy whoosh, not static hiss), and pan to the wind's
      // on-screen direction (3D). Pan smooths slower so the wind drifts, not snaps.
      const now = ctx.currentTime;
      bedInnerGain?.gain.setTargetAtTime(bedGainTarget(gust), now, BED_SMOOTH_TAU);
      bedFilter?.frequency.setTargetAtTime(bedCutoff(gust), now, BED_SMOOTH_TAU);
      bedPanner?.pan.setTargetAtTime(pan, now, BED_PAN_TAU);
    },

    dispose() {
      disposed = true;
      for (const layer of layers) {
        if (layer.timer) clearTimeout(layer.timer);
        layer.timer = null;
      }
      if (bedSource) {
        try {
          bedSource.stop();
        } catch {
          /* already stopped */
        }
        bedSource.disconnect();
      }
      bedFilter?.disconnect();
      bedPanner?.disconnect();
      bedInnerGain?.disconnect();
      bedSource = null;
      bedFilter = null;
      bedPanner = null;
      bedInnerGain = null;
      bedContext = null;
    },
  };
}
