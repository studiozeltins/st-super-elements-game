// Procedural placeholder music (MUSIC-01/02, user request 2026-07-18): three
// self-scheduling WebAudio themes — a bright pastoral DAY loop, a calm sparse
// NIGHT loop, and a driving COMBAT loop — so the world has "Mondstadt-style"
// music with ZERO copyright and no asset sourcing. A real CC0 `.ogg` dropped at
// the matching path transparently overrides its theme (createMusic prefers a
// decoded buffer and only builds a procedural voice when the file is absent).
//
// Timing uses the WebAudio lookahead-scheduler pattern: a coarse setInterval
// schedules notes a short horizon AHEAD against ctx.currentTime, so every note is
// sample-accurate and setInterval jitter never reaches the audio (no drift). Each
// voice owns ONE output GainNode — the createMusic director crossfades that gain;
// the voice itself always plays. Every scheduled node self-disposes onended.

const midi = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);

const SCHEDULE_AHEAD_S = 0.2;
const LOOKAHEAD_MS = 40;
const STEPS_PER_BAR = 16; // sixteenth-note grid

export type MusicMood = 'day' | 'night' | 'combat';

export interface ProceduralVoice {
  /** The director ramps this gain for the crossfade; the voice plays continuously. */
  output: GainNode;
  dispose(): void;
}

// ── One-shot note helpers (all self-disposing) ──────────────────────────────

function pluck(
  ctx: AudioContext,
  out: AudioNode,
  freq: number,
  t: number,
  gain: number,
  wave: OscillatorType,
  dur: number
): void {
  const osc = ctx.createOscillator();
  osc.type = wave;
  osc.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.02);
  osc.onended = () => {
    osc.disconnect();
    g.disconnect();
  };
}

function kick(ctx: AudioContext, out: AudioNode, t: number, gain: number): void {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(140, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + 0.2);
  osc.onended = () => {
    osc.disconnect();
    g.disconnect();
  };
}

function hat(ctx: AudioContext, out: AudioNode, t: number, gain: number): void {
  const len = Math.ceil(ctx.sampleRate * 0.03);
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 7000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
  src.connect(hp).connect(g).connect(out);
  src.start(t);
  src.stop(t + 0.04);
  src.onended = () => {
    src.disconnect();
    hp.disconnect();
    g.disconnect();
  };
}

// ── Theme definitions ───────────────────────────────────────────────────────
// Each bar is a chord (MIDI notes, low→high) + a bass root. `emit` runs once per
// sixteenth step and voices that theme's character. Deliberately diatonic and
// gentle so the loops are pleasant under long play (the seed-then-tune idiom).

interface Bar {
  chord: number[];
  bass: number;
}

interface MoodConfig {
  bpm: number;
  bars: Bar[];
  padWave: OscillatorType;
  padGain: number;
  padCutoff: number;
  emit(ctx: AudioContext, mix: AudioNode, step: number, bar: Bar, t: number): void;
}

const MOODS: Record<MusicMood, MoodConfig> = {
  // Bright pastoral I–V–vi–IV in C major — harp-like triangle arpeggio + soft bass.
  day: {
    bpm: 94,
    bars: [
      { chord: [60, 64, 67], bass: 48 }, // C
      { chord: [55, 59, 62], bass: 43 }, // G
      { chord: [57, 60, 64], bass: 45 }, // Am
      { chord: [53, 57, 60], bass: 41 }, // F
    ],
    padWave: 'sine',
    padGain: 0.05,
    padCutoff: 900,
    emit(ctx, mix, step, bar, t) {
      if (step % 2 === 0) {
        const eighth = step / 2; // 0..7
        const tone = bar.chord[eighth % bar.chord.length];
        const sparkle = eighth % 4 === 0 ? 12 : 0; // top of each half-bar lifts an octave
        pluck(ctx, mix, midi(tone + sparkle), t, 0.16, 'triangle', 0.5);
      }
      if (step === 0 || step === 8) pluck(ctx, mix, midi(bar.bass), t, 0.14, 'sine', 0.9);
    },
  },

  // Calm, sparse Am–F–C–G — a slow bell on the strong beats, lots of air.
  night: {
    bpm: 60,
    bars: [
      { chord: [57, 60, 64], bass: 45 }, // Am
      { chord: [53, 57, 60], bass: 41 }, // F
      { chord: [60, 64, 67], bass: 48 }, // C
      { chord: [55, 59, 62], bass: 43 }, // G
    ],
    padWave: 'triangle',
    padGain: 0.08,
    padCutoff: 520,
    emit(ctx, mix, step, bar, t) {
      if (step === 0) pluck(ctx, mix, midi(bar.chord[2] + 12), t, 0.11, 'sine', 1.7); // high bell
      if (step === 8) pluck(ctx, mix, midi(bar.chord[1]), t, 0.09, 'sine', 1.4);
      if (step === 0) pluck(ctx, mix, midi(bar.bass), t, 0.1, 'sine', 1.9);
    },
  },

  // Driving Am–Am–F–G — eighth bass ostinato, fast saw arps, kick + hats.
  combat: {
    bpm: 142,
    bars: [
      { chord: [57, 60, 64], bass: 45 }, // Am
      { chord: [57, 60, 64], bass: 45 }, // Am
      { chord: [53, 57, 60], bass: 41 }, // F
      { chord: [55, 59, 62], bass: 43 }, // G
    ],
    padWave: 'sawtooth',
    padGain: 0.04,
    padCutoff: 420,
    emit(ctx, mix, step, bar, t) {
      if (step % 2 === 0) pluck(ctx, mix, midi(bar.bass - 12), t, 0.16, 'sawtooth', 0.22); // 8th bass
      const tone = bar.chord[step % bar.chord.length];
      pluck(ctx, mix, midi(tone + 12), t, 0.07, 'sawtooth', 0.13); // 16th lead
      if (step % 4 === 0) kick(ctx, mix, t, 0.35); // quarter kick
      if (step % 4 === 2) hat(ctx, mix, t, 0.08); // offbeat hat
    },
  },
};

/** Build a continuously-playing procedural voice for one mood. Gain starts at 0. */
export function createProceduralVoice(ctx: AudioContext, mood: MusicMood): ProceduralVoice {
  const cfg = MOODS[mood];
  const output = ctx.createGain();
  output.gain.value = 0; // the director crossfades this

  const mix = ctx.createGain();
  mix.gain.value = 1;
  mix.connect(output);

  // Continuous pad: root + fifth through a lowpass, retuned per bar (no re-scheduling).
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = 'lowpass';
  padFilter.frequency.value = cfg.padCutoff;
  const padGain = ctx.createGain();
  padGain.gain.value = cfg.padGain;
  padFilter.connect(padGain).connect(mix);
  const padRoot = ctx.createOscillator();
  const padFifth = ctx.createOscillator();
  padRoot.type = cfg.padWave;
  padFifth.type = cfg.padWave;
  padRoot.connect(padFilter);
  padFifth.connect(padFilter);
  const now = ctx.currentTime;
  padRoot.start(now);
  padFifth.start(now);

  function retunePad(bar: Bar, t: number): void {
    padRoot.frequency.setTargetAtTime(midi(bar.bass), t, 0.2);
    padFifth.frequency.setTargetAtTime(midi(bar.bass + 7), t, 0.2);
  }
  retunePad(cfg.bars[0], now);

  const secondsPerStep = 60 / cfg.bpm / 4;
  let step = 0;
  let barIndex = 0;
  let nextTime = now + 0.1;

  const timer = setInterval(() => {
    while (nextTime < ctx.currentTime + SCHEDULE_AHEAD_S) {
      const bar = cfg.bars[barIndex];
      if (step === 0) retunePad(bar, nextTime);
      cfg.emit(ctx, mix, step, bar, nextTime);
      step += 1;
      if (step >= STEPS_PER_BAR) {
        step = 0;
        barIndex = (barIndex + 1) % cfg.bars.length;
      }
      nextTime += secondsPerStep;
    }
  }, LOOKAHEAD_MS);

  return {
    output,
    dispose() {
      clearInterval(timer);
      try {
        padRoot.stop();
        padFifth.stop();
      } catch {
        /* already stopped */
      }
      padRoot.disconnect();
      padFifth.disconnect();
      padFilter.disconnect();
      padGain.disconnect();
      mix.disconnect();
      output.disconnect();
    },
  };
}
