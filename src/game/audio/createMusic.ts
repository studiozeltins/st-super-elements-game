// Combat-aware music (MUSIC-01/02, D-12): two seamless looping recordings — a
// calm region-exploration loop and a tension combat loop — on the music bus, with
// an equal-power crossfade driven by the ONE combat signal (the same `inCombat`
// the ambience duck reads, D-08). No hard cut ever: combat swells IN over ~1s and
// region crosses back over ~2-3s, aligned with the bed/music duck (10-02).
//
// Two PERSISTENT AudioBufferSourceNodes (loop=true, explicit loopStart/loopEnd),
// each feeding its OWN GainNode into the music bus. Both start once (lazily, on
// the first live-context frame after their buffer decodes) and NEVER stop/restart
// — only the two gains move, so there is no start/stop churn and no re-sync drift.
// The crossfade is equal-power (cos/sin) so perceived loudness stays constant
// through the transition (a linear crossfade dips ~-3dB at the midpoint).
//
// Music has NO synth fallback (unlike the creatures, D-04): until the two `.ogg`
// loops are dropped at the paths below, `setCombat` is a silent no-op — no throw,
// no NaN into an AudioParam, no source built. The instant both files decode the
// full crossfade is live with zero code change (RESEARCH Pattern 4, Pitfall 3).
//
// Zero-alloc steady state: `setCombat` runs every frame but only re-ramps on an
// actual combat-state FLIP (or when a source is first built); an unchanged state
// returns after the cheap ensure()/build checks.

import type { SampleCache } from './createSampleCache';

export interface Music {
  /** Drive the equal-power region↔combat crossfade from the shared combat signal (D-08). Called per frame; no-op until both loops decode. */
  setCombat(inCombat: boolean): void;
  dispose(): void;
}

// ── Loop recording paths (served from public/audio/music/, D-14) ─────────────
const MUSIC = '/audio/music/';
const REGION_URL = `${MUSIC}region-loop.ogg`;
const COMBAT_URL = `${MUSIC}combat-loop.ogg`;

// Crossfade time constants — mirror the duck (10-02): enter fast so combat grabs
// the mix (~1s settle), restore slow so region returns gently (~2.4s settle).
// τ ≈ settle/3, matching DUCK_ENTER_TAU / DUCK_EXIT_TAU in createAudioBuses.
const CROSS_ENTER_TAU = 0.33;
const CROSS_EXIT_TAU = 0.8;

// Equal-power (constant-loudness) crossfade curves. `x` is the target: 0 = full
// region (exploration), 1 = full combat. Region rides cos(x·½π) (1→0), combat
// rides cos((1-x)·½π) (0→1); their powers sum to 1 so loudness never dips.
function regionGainFor(x: number): number {
  return Math.cos(x * 0.5 * Math.PI);
}
function combatGainFor(x: number): number {
  return Math.cos((1 - x) * 0.5 * Math.PI);
}

/** One looping music track: its source, its own gain, and the url it decodes from. */
interface Track {
  url: string;
  source: AudioBufferSourceNode | null;
  gain: GainNode | null;
  /** The equal-power gain this track should sit at for a given crossfade target. */
  gainFor(x: number): number;
}

export function createMusic(
  getContext: () => AudioContext | null,
  getMusicBus: () => GainNode | null,
  sampleCache: SampleCache
): Music {
  // Current crossfade target (0 = region, 1 = combat). Survives a context rebuild
  // so freshly-built sources start at the correct steady gain.
  let currentTarget = 0;
  let musicContext: AudioContext | null = null;
  let disposed = false;

  const region: Track = { url: REGION_URL, source: null, gain: null, gainFor: regionGainFor };
  const combat: Track = { url: COMBAT_URL, source: null, gain: null, gainFor: combatGainFor };
  const tracks = [region, combat];

  // Warm both loops immediately (network is context-free — Pitfall 1); they decode
  // lazily once the context unlocks. Absent files simply never decode → no-op.
  sampleCache.preload(REGION_URL);
  sampleCache.preload(COMBAT_URL);

  function ready(): AudioContext | null {
    const context = getContext();
    return context && context.state === 'running' ? context : null;
  }

  /** Tear a track's nodes down (context swap / dispose). */
  function teardown(track: Track): void {
    if (track.source) {
      try {
        track.source.stop();
      } catch {
        /* already stopped */
      }
      track.source.disconnect();
    }
    track.gain?.disconnect();
    track.source = null;
    track.gain = null;
  }

  /** (Re)bind to the live context, tearing down stale sources if it changed. */
  function ensure(): AudioContext | null {
    const context = ready();
    if (!context) return null;
    if (musicContext !== context) {
      for (const track of tracks) teardown(track);
      musicContext = context;
    }
    return context;
  }

  /**
   * Lazily build + start a track's loop once its buffer has decoded. Both tracks
   * build the moment their buffer is ready (typically the same frame — both were
   * preloaded together), so they start phase-locked. Only gains move afterward.
   */
  function build(context: AudioContext, bus: GainNode, track: Track): void {
    if (track.source) return;
    const buffer = sampleCache.get(track.url);
    if (!buffer) return; // not decoded yet (or file absent) → stay silent (no fallback)

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    // Explicit loop points past any lead-in keep the seam clean (Pitfall 3); a
    // true-loop asset uses the whole buffer.
    source.loopStart = 0;
    source.loopEnd = buffer.duration;

    const gain = context.createGain();
    // Start at the steady equal-power level for the CURRENT target (region full /
    // combat silent while exploring), so a mid-combat build lands at the right gain.
    gain.gain.value = track.gainFor(currentTarget);
    source.connect(gain).connect(bus);
    source.start();

    track.source = source;
    track.gain = gain;
  }

  /** Ramp both tracks to their equal-power targets over τ (never a per-frame .value= — Pitfall 4). */
  function applyCrossfade(context: AudioContext, tau: number): void {
    const now = context.currentTime;
    for (const track of tracks) {
      const param = track.gain?.gain;
      if (!param) continue;
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
      param.setTargetAtTime(track.gainFor(currentTarget), now, tau);
    }
  }

  return {
    setCombat(inCombat) {
      if (disposed) return;
      const context = ensure();
      if (!context) return;
      const bus = getMusicBus();
      if (!bus) return;
      // Build any track whose buffer just decoded (both no-op once built).
      for (const track of tracks) build(context, bus, track);

      const target = inCombat ? 1 : 0;
      if (target === currentTarget) return; // steady state: nothing to re-ramp
      currentTarget = target;
      applyCrossfade(context, inCombat ? CROSS_ENTER_TAU : CROSS_EXIT_TAU);
    },

    dispose() {
      disposed = true;
      for (const track of tracks) teardown(track);
      musicContext = null;
    },
  };
}
