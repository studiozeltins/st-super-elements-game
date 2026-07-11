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
