// Mood-aware music (MUSIC-01/02, D-12; extended 2026-07-18 to THREE moods on user
// request): a DAY exploration loop, a NIGHT exploration loop, and a COMBAT loop on
// the music bus. The active mood is `combat` while the ONE combat signal is set
// (D-08 — the same `inCombat` the ambience duck reads), else `day`/`night` from the
// day/night phase (aligned with the creature layers via ambienceMath.isBirdTime).
// Transitions are an equal-power-style crossfade via setTargetAtTime — no hard cut:
// combat swells IN fast (~1s), exploration returns gently (~2.4s), matching the
// bed/music duck (10-02).
//
// Each mood plays a real CC0 `.ogg` when one is decoded, and otherwise a PROCEDURAL
// voice (proceduralMusic.ts) so the world has music with no asset sourcing and no
// copyright. A file is preferred: a track only falls back to procedural after a
// short grace, so a real `.ogg` that decodes on load transparently wins with zero
// code change (drop it at the path below).
//
// Zero-alloc steady state: setState runs every frame but only re-ramps on an actual
// mood change; an unchanged mood returns after the cheap ensure()/build checks.

import { isBirdTime } from './ambienceMath';
import { createProceduralVoice, type MusicMood, type ProceduralVoice } from './proceduralMusic';
import type { SampleCache } from './createSampleCache';

export interface Music {
  /**
   * Drive the day/night/combat crossfade from the shared combat signal (D-08) and
   * the day/night phase01. Called per frame; picks the mood and ramps the mix.
   */
  setState(inCombat: boolean, phase01: number): void;
  dispose(): void;
}

// ── Loop recording paths (served from public/audio/music/, D-14) ─────────────
const MUSIC = '/audio/music/';
const MOOD_URLS: Record<MusicMood, string> = {
  day: `${MUSIC}day-loop.ogg`,
  night: `${MUSIC}night-loop.ogg`,
  combat: `${MUSIC}combat-loop.ogg`,
};

// Crossfade time constants — mirror the duck (10-02): into combat fast so it grabs
// the mix, back to exploration slow so it returns gently. τ ≈ settle/3.
const CROSS_ENTER_TAU = 0.33;
const CROSS_EXIT_TAU = 0.8;

// A real `.ogg` gets this long (seconds of running context) to decode and win
// before its mood falls back to the procedural voice.
const FILE_GRACE_S = 1.5;

interface Track {
  mood: MusicMood;
  url: string;
  built: boolean;
  /** The node the director ramps for the crossfade (buffer gain OR the voice output). */
  gainNode: GainNode | null;
  source: AudioBufferSourceNode | null; // real-file path
  voice: ProceduralVoice | null; // procedural fallback
}

export function createMusic(
  getContext: () => AudioContext | null,
  getMusicBus: () => GainNode | null,
  sampleCache: SampleCache
): Music {
  let currentMood: MusicMood = 'day';
  let musicContext: AudioContext | null = null;
  let runningSince = 0; // ctx.currentTime when the live context first appeared (grace clock)
  let disposed = false;

  const tracks: Track[] = (['day', 'night', 'combat'] as MusicMood[]).map((mood) => ({
    mood,
    url: MOOD_URLS[mood],
    built: false,
    gainNode: null,
    source: null,
    voice: null,
  }));

  // Warm the loops immediately (network is context-free — Pitfall 1). Absent files
  // never decode → the procedural voice covers that mood.
  for (const track of tracks) sampleCache.preload(track.url);

  function ready(): AudioContext | null {
    const context = getContext();
    return context && context.state === 'running' ? context : null;
  }

  function gainTarget(track: Track): number {
    return track.mood === currentMood ? 1 : 0;
  }

  function teardown(track: Track): void {
    if (track.source) {
      try {
        track.source.stop();
      } catch {
        /* already stopped */
      }
      track.source.disconnect();
    }
    track.voice?.dispose();
    track.gainNode?.disconnect();
    track.source = null;
    track.voice = null;
    track.gainNode = null;
    track.built = false;
  }

  /** (Re)bind to the live context, tearing down stale nodes if it changed. */
  function ensure(): AudioContext | null {
    const context = ready();
    if (!context) return null;
    if (musicContext !== context) {
      for (const track of tracks) teardown(track);
      musicContext = context;
      runningSince = context.currentTime;
    }
    return context;
  }

  /** Build a track once: prefer a decoded buffer, else (after grace) a procedural voice. */
  function build(context: AudioContext, bus: GainNode, track: Track): void {
    if (track.built) return;
    const buffer = sampleCache.get(track.url);
    if (buffer) {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.loopStart = 0;
      source.loopEnd = buffer.duration;
      const gain = context.createGain();
      gain.gain.value = gainTarget(track);
      source.connect(gain).connect(bus);
      source.start();
      track.source = source;
      track.gainNode = gain;
      track.built = true;
      return;
    }
    // No file yet — give it a moment to decode before committing to procedural.
    if (context.currentTime - runningSince < FILE_GRACE_S) return;
    const voice = createProceduralVoice(context, track.mood);
    voice.output.gain.value = gainTarget(track);
    voice.output.connect(bus);
    track.voice = voice;
    track.gainNode = voice.output;
    track.built = true;
  }

  function applyCrossfade(context: AudioContext, tau: number): void {
    const now = context.currentTime;
    for (const track of tracks) {
      const param = track.gainNode?.gain;
      if (!param) continue;
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
      param.setTargetAtTime(gainTarget(track), now, tau);
    }
  }

  return {
    setState(inCombat, phase01) {
      if (disposed) return;
      const context = ensure();
      if (!context) return;
      const bus = getMusicBus();
      if (!bus) return;
      for (const track of tracks) build(context, bus, track);

      const mood: MusicMood = inCombat ? 'combat' : isBirdTime(phase01) ? 'day' : 'night';
      if (mood === currentMood) return; // steady state
      currentMood = mood;
      // Fast into combat, gentle back out to (or between) exploration moods.
      applyCrossfade(context, mood === 'combat' ? CROSS_ENTER_TAU : CROSS_EXIT_TAU);
    },

    dispose() {
      disposed = true;
      for (const track of tracks) teardown(track);
      musicContext = null;
    },
  };
}
