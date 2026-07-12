// Zero-asset WebAudio chimes for the pull-reveal payoff moments (same
// gesture-unlock pattern as game/audio/createAudioSystem: browsers gate audio
// behind a user input, and the player always pressed/tapped to reach a reveal).

let context: AudioContext | null = null;

function unlock() {
  if (!context) context = new AudioContext();
  void context.resume().then(() => {
    if (context?.state === 'running') {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    }
  });
}
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

/**
 * One pleasant bell tick. `step` raises the pitch slightly each time
 * (a quarter-tone per step) so a +1 +1 +1 run climbs like a payout jingle.
 */
function playChime(baseHz: number, step: number, level: number) {
  if (!context || context.state !== 'running') return;
  const now = context.currentTime;
  // Quarter-tone rise per step, capped an octave up so long runs stay pleasant.
  const freq = baseHz * Math.min(2, Math.pow(2, step / 24));

  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(level, now + 0.012);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
  master.connect(context.destination);

  // Fundamental (triangle = soft bell body) + a quiet pure octave shimmer.
  const body = context.createOscillator();
  body.type = 'triangle';
  body.frequency.value = freq;
  body.connect(master);
  body.start(now);
  body.stop(now + 0.42);

  const shimmer = context.createOscillator();
  shimmer.type = 'sine';
  shimmer.frequency.value = freq * 2;
  const shimmerGain = context.createGain();
  shimmerGain.gain.setValueAtTime(0.35, now);
  shimmerGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
  shimmer.connect(shimmerGain).connect(master);
  shimmer.start(now);
  shimmer.stop(now + 0.28);
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
export function playTranscendBoost(level: number) {
  if (!context || context.state !== 'running') return;
  const now = context.currentTime;
  // Whole tone up per level, capped a fifth so late boosts stay musical.
  const root = 262 * Math.min(1.5, Math.pow(2, Math.max(0, level - 1) / 24));

  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.32, now + 0.02);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
  master.connect(context.destination);

  // Sub swell — the "power surge" body under the sparkle.
  const sub = context.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(root / 2, now);
  sub.frequency.exponentialRampToValueAtTime(root, now + 0.5);
  const subGain = context.createGain();
  subGain.gain.setValueAtTime(0.5, now);
  subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
  sub.connect(subGain).connect(master);
  sub.start(now);
  sub.stop(now + 0.72);

  // Rising major arpeggio: 1 · 5/4 · 3/2 · 2, one note every 70ms.
  const ratios = [1, 5 / 4, 3 / 2, 2];
  ratios.forEach((r, i) => {
    const t = now + i * 0.07;
    const osc = context!.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = root * r;
    const g = context!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.28, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 0.36);
  });

  // Bright shimmer sparkle on the final octave landing.
  const spark = context.createOscillator();
  spark.type = 'sine';
  spark.frequency.value = root * 4;
  const sparkGain = context.createGain();
  sparkGain.gain.setValueAtTime(0.0001, now + 0.21);
  sparkGain.gain.exponentialRampToValueAtTime(0.16, now + 0.24);
  sparkGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
  spark.connect(sparkGain).connect(master);
  spark.start(now + 0.21);
  spark.stop(now + 0.62);
}
