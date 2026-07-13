// Zero-asset WebAudio chimes for the pull-reveal payoff moments (same
// gesture-unlock pattern as game/audio/createAudioSystem: browsers gate audio
// behind a user input, and the player always pressed/tapped to reach a reveal).

let context: AudioContext | null = null;

// Lazily create + resume on the first gesture, then keep it warm. Called both
// from the global unlock listeners AND at the top of every play fn, so a sound
// still fires even if its click is the very first interaction (resume is async,
// so we run the voice inside the resume promise when the ctx is still cold).
function ensureContext(): AudioContext {
  if (!context) context = new AudioContext();
  return context;
}

function unlock() {
  void ensureContext().resume();
}
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

// Run `voice(ctx, startTime)` once the context is actually running. If it is
// already warm we fire synchronously; if still suspended we resume and play on
// the promise so nothing is dropped on a cold first click.
function withAudio(voice: (ctx: AudioContext, now: number) => void) {
  const ctx = ensureContext();
  if (ctx.state === 'running') {
    voice(ctx, ctx.currentTime);
  } else {
    void ctx.resume().then(() => voice(ctx, ctx.currentTime));
  }
}

/**
 * One pleasant bell tick. `step` raises the pitch slightly each time
 * (a quarter-tone per step) so a +1 +1 +1 run climbs like a payout jingle.
 */
function playChime(baseHz: number, step: number, level: number) {
  withAudio((ctx, now) => {
    // Quarter-tone rise per step, capped an octave up so long runs stay pleasant.
    const freq = baseHz * Math.min(2, Math.pow(2, step / 24));

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(level, now + 0.012);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    master.connect(ctx.destination);

    // Fundamental (triangle = soft bell body) + a quiet pure octave shimmer.
    const body = ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.value = freq;
    body.connect(master);
    body.start(now);
    body.stop(now + 0.42);

    const shimmer = ctx.createOscillator();
    shimmer.type = 'sine';
    shimmer.frequency.value = freq * 2;
    const shimmerGain = ctx.createGain();
    shimmerGain.gain.setValueAtTime(0.35, now);
    shimmerGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    shimmer.connect(shimmerGain).connect(master);
    shimmer.start(now);
    shimmer.stop(now + 0.28);
  });
}

/** Purple-shard +1 tick: warm mid bell, rising a hair on every increment. */
export function playShardChime(step: number) {
  playChime(660, step, 0.3);
}

/** Constellation C1→C6 step on a reveal card: brighter, lighter bell. */
export function playConstellationChime(step: number) {
  playChime(880, step, 0.22);
}

/**
 * Būsts install payoff: a low power-swell under a fast rising major arpeggio
 * (root · third · fifth · octave) capped by a bright shimmer. Higher boost
 * levels start a hair higher so B10 feels grander than B1.
 */
export function playTranscendBoost(level: number, isMax = false) {
  withAudio((ctx, now) => {
    // Whole tone up per level, capped a fifth so late boosts stay musical.
    const root = 262 * Math.min(1.5, Math.pow(2, Math.max(0, level - 1) / 24));

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.32, now + 0.02);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
    master.connect(ctx.destination);

    // Sub swell — the "power surge" body under the sparkle.
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(root / 2, now);
    sub.frequency.exponentialRampToValueAtTime(root, now + 0.5);
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.5, now);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
    sub.connect(subGain).connect(master);
    sub.start(now);
    sub.stop(now + 0.72);

    // Rising major arpeggio: 1 · 5/4 · 3/2 · 2, one note every 70ms.
    const ratios = [1, 5 / 4, 3 / 2, 2];
    ratios.forEach((r, i) => {
      const t = now + i * 0.07;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = root * r;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.28, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(g).connect(master);
      osc.start(t);
      osc.stop(t + 0.36);
    });

    // Bright shimmer sparkle on the final octave landing.
    const spark = ctx.createOscillator();
    spark.type = 'sine';
    spark.frequency.value = root * 4;
    const sparkGain = ctx.createGain();
    sparkGain.gain.setValueAtTime(0.0001, now + 0.21);
    sparkGain.gain.exponentialRampToValueAtTime(0.16, now + 0.24);
    sparkGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    spark.connect(sparkGain).connect(master);
    spark.start(now + 0.21);
    spark.stop(now + 0.62);

    // B10 jackpot tail: after the regular payoff, a fast climbing sparkle run
    // that resolves an octave over the root — the "you maxed it" dopamine hit.
    if (!isMax) return;
    const tail = now + 0.5;
    // Bright pentatonic ladder sprinting up two octaves, ~55ms apart.
    const ladder = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 5 / 2, 3, 4];
    ladder.forEach((r, i) => {
      const t = tail + i * 0.055;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = root * 2 * r;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(g).connect(master);
      osc.start(t);
      osc.stop(t + 0.24);
    });

    // Landing chord under the top of the run — a shiny major triad bloom.
    const land = tail + ladder.length * 0.055;
    [1, 5 / 4, 3 / 2, 2].forEach(r => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = root * 2 * r;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, land);
      g.gain.exponentialRampToValueAtTime(0.16, land + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, land + 0.9);
      osc.connect(g).connect(master);
      osc.start(land);
      osc.stop(land + 0.92);
    });

    // Extend the master envelope so the tail isn't clipped by the 0.9s fade.
    master.gain.cancelScheduledValues(now + 0.85);
    master.gain.setValueAtTime(0.28, now + 0.85);
    master.gain.exponentialRampToValueAtTime(0.0001, land + 1.0);
  });
}
