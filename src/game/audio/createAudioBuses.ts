// The ONE audio routing owner (AMBI-01, D-01). Every sound in the game reaches
// the speakers through this graph — no module ever touches `context.destination`
// directly (D-02). The topology:
//
//   sfx    ─────────────────────────► master ► DynamicsCompressor ► destination
//   music  ► musicDuck   ───────────►  │
//   ambient ► ambientDuck ──────────►  │
//
// The compressor on master is the headroom guarantee: dense fights layering SFX
// + ambience + music glue together instead of clipping the master.
//
// SERIES SPLIT (RESEARCH Pitfall 5): `music` and `ambient` are EACH two gains in
// series — a HEAD node and a downstream DUCK node — because two independent
// writers touch each bus and must never stomp one AudioParam:
//   - the HEAD node carries user volume/mute (music) or the bed swell (ambient),
//   - the DUCK node carries ONLY the combat duck.
// volume × duck (and bed-swell × duck) then multiply cleanly through the series.
//
// Built lazily on first accessor call and rebuilt only when the AudioContext
// changes (the gesture unlock is async — never build eagerly), mirroring the
// `bus()` idiom in createCombatAudio.ts.

import { clampGain } from './audioCore';

export interface AudioBuses {
  /** The shared SFX sub-bus — all 5 SFX modules route their plays here. Null until a live context exists. */
  sfx(): GainNode | null;
  /** The music HEAD node — createMusic (10-06) connects its loops INTO this. Null until a live context exists. */
  music(): GainNode | null;
  /** The ambient HEAD node — createAmbience (10-03) connects the bed + one-shots INTO this. Null until a live context exists. */
  ambient(): GainNode | null;
  /** The master bus feeding the compressor. Null until a live context exists. */
  master(): GainNode | null;
  /** Ramp the music+ambient DUCK nodes down on combat enter / restore on exit. Writes ONLY the duck nodes. */
  duck(inCombat: boolean): void;
  /** Set the music HEAD-node volume [0,1] (clamped). Independent of mute + duck (D-13). */
  setMusicGain(volume: number): void;
  /** Set the SFX HEAD-node volume [0,1] (clamped). Independent of mute + duck (D-13). */
  setSfxGain(volume: number): void;
  /** Mute/unmute music at the HEAD node without losing the stored volume (D-13). */
  setMusicMuted(muted: boolean): void;
  /** Mute/unmute SFX at the HEAD node without losing the stored volume (D-13). */
  setSfxMuted(muted: boolean): void;
  dispose(): void;
}

// Master glue compressor (playtest seeds): a gentle bus compressor — high knee,
// moderate ratio — that only leans in when layered ambience + a dense fight push
// the master hot, so quiet exploration stays untouched but nothing ever clips.
const COMP_THRESHOLD_DB = -18;
const COMP_KNEE_DB = 24;
const COMP_RATIO = 4;
const COMP_ATTACK_SECONDS = 0.003;
const COMP_RELEASE_SECONDS = 0.25;

// Sub-bus default HEAD gains (playtest seeds; the App volume setters overwrite
// music/sfx on load from persisted settings). Music sits below full so the
// exploration loop stays under the SFX; ambient rides its own inner bed gain.
const DEFAULT_MUSIC_GAIN = 0.7;
const DEFAULT_SFX_GAIN = 1;
const DEFAULT_AMBIENT_GAIN = 1;

// Duck depth + time constants (RESEARCH Pattern 5). Target ≈ -10dB (0.3 linear);
// enter fast (~1s settle), restore slow (~2.4s settle) so combat grabs the mix
// then hands it back gently. τ ≈ settle/3.
const DUCK_TARGET = 0.3;
const DUCK_ENTER_TAU = 0.33;
const DUCK_EXIT_TAU = 0.8;
// Short smoothing on user volume writes so a dragged slider never zippers.
const VOLUME_TAU = 0.015;

export function createAudioBuses(getContext: () => AudioContext | null): AudioBuses {
  let busContext: AudioContext | null = null;
  let master: GainNode | null = null;
  let compressor: DynamicsCompressorNode | null = null;
  let sfxBus: GainNode | null = null;
  let musicHead: GainNode | null = null;
  let musicDuck: GainNode | null = null;
  let ambientHead: GainNode | null = null;
  let ambientDuck: GainNode | null = null;

  // Logical state that must survive a context rebuild (re-applied in ensure()).
  let musicVolume = DEFAULT_MUSIC_GAIN;
  let sfxVolume = DEFAULT_SFX_GAIN;
  let musicMuted = false;
  let sfxMuted = false;
  let duckTarget = 1; // current combat-duck level on the duck nodes

  /** (Re)builds the graph once per context, mirroring createCombatAudio.bus(). */
  function ensure(): AudioContext | null {
    const context = getContext();
    if (!context) return null;
    if (busContext === context && master) return context;

    master = context.createGain();
    compressor = context.createDynamicsCompressor();
    compressor.threshold.value = COMP_THRESHOLD_DB;
    compressor.knee.value = COMP_KNEE_DB;
    compressor.ratio.value = COMP_RATIO;
    compressor.attack.value = COMP_ATTACK_SECONDS;
    compressor.release.value = COMP_RELEASE_SECONDS;
    master.connect(compressor).connect(context.destination);

    // sfx: single gain straight into master.
    sfxBus = context.createGain();
    sfxBus.connect(master);

    // music + ambient: HEAD → DUCK → master (the series split, Pitfall 5).
    musicHead = context.createGain();
    musicDuck = context.createGain();
    musicHead.connect(musicDuck).connect(master);

    ambientHead = context.createGain();
    ambientDuck = context.createGain();
    ambientHead.connect(ambientDuck).connect(master);

    // Re-apply logical state to the fresh nodes (volume/mute on heads, duck on
    // duck nodes) so an async context swap never resets the mix.
    sfxBus.gain.value = sfxMuted ? 0 : sfxVolume;
    musicHead.gain.value = musicMuted ? 0 : musicVolume;
    ambientHead.gain.value = DEFAULT_AMBIENT_GAIN;
    musicDuck.gain.value = duckTarget;
    ambientDuck.gain.value = duckTarget;

    busContext = context;
    return context;
  }

  /** Writes the effective (mute ? 0 : volume) level to a HEAD node, smoothed. */
  function applyHead(node: GainNode | null, muted: boolean, volume: number) {
    const context = ensure();
    if (!context || !node) return;
    node.gain.setTargetAtTime(muted ? 0 : volume, context.currentTime, VOLUME_TAU);
  }

  return {
    sfx: () => (ensure() ? sfxBus : null),
    music: () => (ensure() ? musicHead : null),
    ambient: () => (ensure() ? ambientHead : null),
    master: () => (ensure() ? master : null),

    duck(inCombat: boolean) {
      const context = ensure();
      if (!context || !musicDuck || !ambientDuck) return;
      duckTarget = inCombat ? DUCK_TARGET : 1;
      const tau = inCombat ? DUCK_ENTER_TAU : DUCK_EXIT_TAU;
      const now = context.currentTime;
      for (const duckNode of [musicDuck, ambientDuck]) {
        duckNode.gain.cancelScheduledValues(now);
        duckNode.gain.setValueAtTime(duckNode.gain.value, now);
        duckNode.gain.setTargetAtTime(duckTarget, now, tau);
      }
    },

    setMusicGain(volume: number) {
      musicVolume = clampGain(volume); // non-finite/≤0 → 0; else min(1, v) (V5)
      applyHead(musicHead, musicMuted, musicVolume);
    },

    setSfxGain(volume: number) {
      sfxVolume = clampGain(volume); // non-finite/≤0 → 0; else min(1, v) (V5)
      applyHead(sfxBus, sfxMuted, sfxVolume);
    },

    setMusicMuted(muted: boolean) {
      musicMuted = muted;
      applyHead(musicHead, musicMuted, musicVolume);
    },

    setSfxMuted(muted: boolean) {
      sfxMuted = muted;
      applyHead(sfxBus, sfxMuted, sfxVolume);
    },

    dispose() {
      master?.disconnect();
      compressor?.disconnect();
      sfxBus?.disconnect();
      musicHead?.disconnect();
      musicDuck?.disconnect();
      ambientHead?.disconnect();
      ambientDuck?.disconnect();
      master = compressor = sfxBus = null;
      musicHead = musicDuck = ambientHead = ambientDuck = null;
      busContext = null;
    },
  };
}
