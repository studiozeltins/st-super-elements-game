// Procedural footstep/locomotion SFX for every visible moving unit. Steps are
// distance-driven (one step per stride length travelled), not time-driven, so
// cadence naturally tracks each unit's real speed. Footsteps are AMBIENCE:
// they sit far below the combat layer (peaks ≤ ~0.5, most much lower) and a
// global spam guard keeps a crowded screen from turning into rain.

import { clampGain, createNoiseSource, jitter, panned } from './audioCore';

export type FootstepKind = 'player' | 'goliath' | 'slime' | 'golem';

export interface MovementAudio {
  /** Call once per frame per visible moving unit. Accumulates travel distance and emits one footstep each time it crosses the kind's stride length. gain 0 (culled by distance) still advances tracking but plays nothing. */
  updateUnit(key: string, kind: FootstepKind, x: number, z: number, gain: number, pan: number): void;
  /** Call once per frame after all updateUnit calls: drops tracking for units NOT updated since the previous endFrame (despawned/culled). */
  endFrame(): void;
  dispose(): void;
}

// World units travelled between steps — the per-kind gait signature.
const STRIDE_LENGTH: Record<FootstepKind, number> = {
  player: 1.5,
  goliath: 3.0,
  slime: 1.1,
  golem: 2.4,
};

/** A between-frame jump larger than this is a teleport/respawn, not travel. */
const TELEPORT_DISTANCE = 5;

// Global spam guard: at most this many footstep plays per window, shared
// across ALL units — extras are silently dropped (they're ambience).
const SPAM_WINDOW_SECONDS = 0.06;
const SPAM_MAX_PLAYS = 4;

// Peak gains per kind (each × the caller's distance gain). Quiet by design.
const PLAYER_STEP_PEAK = 0.12;
const GOLIATH_STEP_PEAK = 0.5;
const SLIME_STEP_PEAK = 0.15;
const GOLEM_STEP_PEAK = 0.4;

interface UnitState {
  x: number;
  z: number;
  travelled: number;
  seenThisFrame: boolean;
}

export function createMovementAudio(getContext: () => AudioContext | null): MovementAudio {
  const units = new Map<string, UnitState>();
  let spamWindowStart = -Infinity;
  let spamPlays = 0;

  function ready(): AudioContext | null {
    const context = getContext();
    return context && context.state === 'running' ? context : null;
  }

  /** True when this play fits inside the shared spam budget. */
  function underSpamBudget(now: number): boolean {
    if (now - spamWindowStart >= SPAM_WINDOW_SECONDS) {
      spamWindowStart = now;
      spamPlays = 1;
      return true;
    }
    if (spamPlays >= SPAM_MAX_PLAYS) return false;
    spamPlays++;
    return true;
  }

  // Soft grass tap: short lowpassed noise + a faint low "thock" for body.
  function playPlayerStep(context: AudioContext, level: number, out: AudioNode, now: number) {
    const rate = jitter(0.12);
    const tap = createNoiseSource(context, 0.06);
    const tapLow = context.createBiquadFilter();
    tapLow.type = 'lowpass';
    tapLow.frequency.value = 800 * rate;
    const tapGain = context.createGain();
    tapGain.gain.setValueAtTime(PLAYER_STEP_PEAK * level, now);
    tapGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    tap.connect(tapLow).connect(tapGain).connect(out);
    tap.start(now);
    tap.stop(now + 0.06);

    const thock = context.createOscillator();
    thock.type = 'sine';
    thock.frequency.value = 180 * rate;
    const thockGain = context.createGain();
    thockGain.gain.setValueAtTime(0.05 * level, now);
    thockGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    thock.connect(thockGain).connect(out);
    thock.start(now);
    thock.stop(now + 0.06);
  }

  // The "dun": a deep descending sine felt in the chest + a lowpassed thud.
  function playGoliathStep(context: AudioContext, level: number, out: AudioNode, now: number) {
    const rate = jitter(0.08);
    const dun = context.createOscillator();
    dun.type = 'sine';
    dun.frequency.setValueAtTime(55 * rate, now);
    dun.frequency.exponentialRampToValueAtTime(38 * rate, now + 0.18);
    const dunGain = context.createGain();
    dunGain.gain.setValueAtTime(0.0001, now);
    dunGain.gain.exponentialRampToValueAtTime(GOLIATH_STEP_PEAK * level, now + 0.012);
    dunGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    dun.connect(dunGain).connect(out);
    dun.start(now);
    dun.stop(now + 0.24);

    const thud = createNoiseSource(context, 0.1);
    const thudLow = context.createBiquadFilter();
    thudLow.type = 'lowpass';
    thudLow.frequency.value = 250;
    const thudGain = context.createGain();
    thudGain.gain.setValueAtTime(0.25 * level, now);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    thud.connect(thudLow).connect(thudGain).connect(out);
    thud.start(now);
    thud.stop(now + 0.1);
  }

  // Wet squish: a down-sweeping bandpass — heavily jittered so a slime pack
  // sounds like many wet things, not a metronome.
  function playSlimeStep(context: AudioContext, level: number, out: AudioNode, now: number) {
    const rate = jitter(0.2);
    const squish = createNoiseSource(context, 0.1);
    const squishBand = context.createBiquadFilter();
    squishBand.type = 'bandpass';
    squishBand.Q.value = 2;
    squishBand.frequency.setValueAtTime(300 * rate, now);
    squishBand.frequency.exponentialRampToValueAtTime(150 * rate, now + 0.1);
    const squishGain = context.createGain();
    squishGain.gain.setValueAtTime(SLIME_STEP_PEAK * level, now);
    squishGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    squish.connect(squishBand).connect(squishGain).connect(out);
    squish.start(now);
    squish.stop(now + 0.1);
  }

  // Stone grind + thud: broadband scrape, a midrange grind layer, and a low
  // sine so it reads heavier than the player but lighter than a goliath.
  function playGolemStep(context: AudioContext, level: number, out: AudioNode, now: number) {
    const rate = jitter(0.1);
    const scrape = createNoiseSource(context, 0.12);
    const scrapeLow = context.createBiquadFilter();
    scrapeLow.type = 'lowpass';
    scrapeLow.frequency.value = 400 * rate;
    const scrapeGain = context.createGain();
    scrapeGain.gain.setValueAtTime(GOLEM_STEP_PEAK * level, now);
    scrapeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    scrape.connect(scrapeLow).connect(scrapeGain).connect(out);
    scrape.start(now);
    scrape.stop(now + 0.12);

    const grind = createNoiseSource(context, 0.08);
    const grindBand = context.createBiquadFilter();
    grindBand.type = 'bandpass';
    grindBand.Q.value = 1.5;
    grindBand.frequency.value = 800 * rate;
    const grindGain = context.createGain();
    grindGain.gain.setValueAtTime(0.12 * level, now);
    grindGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    grind.connect(grindBand).connect(grindGain).connect(out);
    grind.start(now);
    grind.stop(now + 0.08);

    const thud = context.createOscillator();
    thud.type = 'sine';
    thud.frequency.value = 70 * rate;
    const thudGain = context.createGain();
    thudGain.gain.setValueAtTime(0.0001, now);
    thudGain.gain.exponentialRampToValueAtTime(0.2 * level, now + 0.01);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    thud.connect(thudGain).connect(out);
    thud.start(now);
    thud.stop(now + 0.14);
  }

  function playStep(kind: FootstepKind, level: number, pan: number) {
    const context = ready();
    if (!context) return;
    const now = context.currentTime;
    if (!underSpamBudget(now)) return;
    const out = panned(context, pan, context.destination);
    if (kind === 'player') playPlayerStep(context, level, out, now);
    else if (kind === 'goliath') playGoliathStep(context, level, out, now);
    else if (kind === 'slime') playSlimeStep(context, level, out, now);
    else playGolemStep(context, level, out, now);
  }

  function updateUnit(key: string, kind: FootstepKind, x: number, z: number, gain: number, pan: number) {
    const state = units.get(key);
    if (!state) {
      // First sighting: record position only — a step here would fire on spawn.
      units.set(key, { x, z, travelled: 0, seenThisFrame: true });
      return;
    }
    state.seenThisFrame = true;
    const moved = Math.hypot(x - state.x, z - state.z);
    state.x = x;
    state.z = z;
    if (moved > TELEPORT_DISTANCE) {
      // Teleport/respawn, not travel: restart the stride from here.
      state.travelled = 0;
      return;
    }
    state.travelled += moved;
    const stride = STRIDE_LENGTH[kind];
    if (state.travelled < stride) return;
    state.travelled %= stride;
    // Culled-by-distance units keep their cadence tracked but stay silent.
    const level = clampGain(gain);
    if (level === 0) return;
    playStep(kind, level, pan);
  }

  function endFrame() {
    for (const [key, state] of units) {
      if (state.seenThisFrame) state.seenThisFrame = false;
      else units.delete(key);
    }
  }

  return {
    updateUnit,
    endFrame,
    dispose() {
      units.clear();
    },
  };
}
