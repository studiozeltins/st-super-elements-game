// The deterministic brain of the goliath raid. Goliaths (like camp enemies) are
// simulated per-client with NO server entity, so their live positions DIVERGE
// between clients. Any enemy-on-enemy gem transfer (a goliath sacking a camp, or
// a camp felling a goliath) must therefore be resolved from a SHARED-TIME
// schedule that every client computes identically — never from live HP or live
// positions. Every client fires the same raid event at the same wall-clock
// instant; the server's short idempotency window then collapses the N duplicate
// reducer calls into a single payout.
//
// Everything here is pure and Three.js-free: functions of (campSites, time). The
// fight outcome is DYNAMIC and strength-weighted, but still fully deterministic —
// it swings on relative archetype power and a SEEDED roll (never Math.random,
// never per-client current HP), so two clients always agree on who won.

import { createSeededRandom } from '../world/rng';
import type { CampSite } from '../world/camps';
import {
  BOSS_DAMAGE_MULTIPLIER,
  BOSS_HEALTH_MULTIPLIER,
  ENEMY_ARCHETYPES,
} from '../data/enemyArchetypes';
import type { GoliathArchetype } from '../data/goliathArchetypes';
import { enemyIdFor, MEMBERS_PER_CAMP } from './enemyIdentity';
import {
  GOLIATH_BATCH_WINDOW_MICROS,
  goliathBatchForTime,
  type GoliathSpawnDescriptor,
} from './goliathIdentity';

// ---------------------------------------------------------------------------
// Balance tuning — the ~40% "camps kill the goliath" target is EMERGENT here,
// not a coin flip. Each camp is a probabilistic fight whose win chance is the
// goliath's strength share; the numbers below shape the curve so that, across
// the size mix (small/medium/large, uniformly rolled by goliathIdentity) and the
// camp-strength spread, roughly 40% of raiders die before clearing their route.
// Small goliaths usually die; large usually survive. Retune here — the balance
// test in goliathRaidSchedule.test.ts guards the 25–55% band.
// ---------------------------------------------------------------------------

// In a war of attrition raw HP dominates; contact damage is real but secondary,
// so it is down-weighted in the power score shared by camps and goliaths.
const CONTACT_DAMAGE_POWER_WEIGHT = 3;

// A camp is a pack of five; a goliath is one elite. This single knob multiplies
// the goliath's paper power to set the average survival rate — raising it lets
// more goliaths live. ~5 means a goliath fights at rough per-member parity with a
// full camp, which (over a multi-camp route) lands the fleet near 40% deaths.
const GOLIATH_POWER_ADVANTAGE = 5.2;

// Winning still costs blood: each cleared camp drains the goliath's health in
// proportion to how tough that camp was relative to the goliath's own strength,
// so a long route wears it down and the final camps are the deadliest.
const WEAR_PER_CAMP = 0.18;

// A goliath never fights below this fraction — it keeps a sliver so a cleared
// route still shows a plausible battered health bar while roaming.
const MIN_HEALTH_FRACTION = 0.08;

// How many camps a goliath raids before roaming. Fewer camps = more survivors;
// three keeps every raid a real gauntlet without guaranteeing death.
const ROUTE_CAMP_COUNT = 3;

// ---------------------------------------------------------------------------
// Timeline pacing — a raid is a fixed sequence of travel + engage legs, so every
// client places the goliath at the same point and fires each fight at the same
// instant. Seconds; converted to micros against the window start.
// ---------------------------------------------------------------------------
const TRAVEL_SECONDS = 18;
const ENGAGE_SECONDS = 12;
const LEG_SECONDS = TRAVEL_SECONDS + ENGAGE_SECONDS;

// Deterministic seed salts (kept distinct so the route, fight, and spawn rolls of
// one goliath never echo each other or any other seeded system).
const SEED_MODULUS = 0x100000000n;
const ROUTE_SEED_SALT = 0x2a17d;
const FIGHT_SEED_SALT = 0x51c3b;
const SPAWN_SEED_SALT = 0x7b90e;
const CAMP_SEED_STRIDE = 0x1000193;

// Goliaths march in from beyond the islands before hitting their first camp.
const SPAWN_RING_RADIUS = 70;
const MICROS_PER_SECOND = 1_000_000;

export interface GoliathScheduleState {
  slotId: bigint;
  archetype: GoliathArchetype;
  /** Interpolated route position at this instant (deterministic, shared-time). */
  position: { x: number; z: number };
  /** Remaining health 0..1 — battered feel + overlay bar. */
  healthFraction: number;
  /** True once a camp has felled this goliath earlier in the window. */
  isDefeated: boolean;
  /** Camp being travelled to / fought right now, or null while roaming/dead. */
  currentTargetCampIndex: number | null;
}

export type GoliathRaidEvent =
  | {
      kind: 'raidBossKill';
      campIndex: number;
      bossEnemyId: bigint;
      rewardTier: number;
      position: { x: number; z: number };
      atMicros: bigint;
    }
  | {
      kind: 'goliathDefeated';
      slotId: bigint;
      sizeIndex: number;
      position: { x: number; z: number };
      atMicros: bigint;
    };

interface Point {
  x: number;
  z: number;
}

interface RaidLeg {
  campIndex: number;
  fromPoint: Point;
  campPoint: Point;
  travelStartSeconds: number;
  travelEndSeconds: number;
  engageEndSeconds: number;
  /** Health while travelling to and fighting this camp (before the outcome). */
  healthFraction: number;
  won: boolean;
}

interface GoliathPlan {
  descriptor: GoliathSpawnDescriptor;
  spawnPoint: Point;
  legs: RaidLeg[];
  routePoints: Point[];
  isDefeated: boolean;
  survivedHealthFraction: number;
  clearedEndSeconds: number;
  events: GoliathRaidEvent[];
}

function clampFraction(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function seedFrom(slotId: bigint, windowBucket: bigint, salt: number): number {
  const slotPart = Number(slotId % SEED_MODULUS);
  const bucketPart = Number(windowBucket % SEED_MODULUS);
  return (slotPart ^ bucketPart ^ salt) >>> 0;
}

function lerpPoint(from: Point, to: Point, fraction: number): Point {
  return {
    x: from.x + (to.x - from.x) * fraction,
    z: from.z + (to.z - from.z) * fraction,
  };
}

/** Power score shared by camps and goliaths: HP dominates, damage is weighted. */
function powerScore(maxHealth: number, contactDamage: number): number {
  return maxHealth + contactDamage * CONTACT_DAMAGE_POWER_WEIGHT;
}

/**
 * A camp's combined strength from ARCHETYPE stats only (never live HP): four
 * guards plus one boss (boss stats scaled by the shared boss multipliers). Same
 * on every client, so the fight it drives is identical everywhere.
 */
export function campStrength(campSite: CampSite): number {
  const archetype = ENEMY_ARCHETYPES[campSite.archetypeId];
  const guardCount = MEMBERS_PER_CAMP - 1;
  const guardStrength = guardCount * powerScore(archetype.maxHealth, archetype.contactDamage);
  const bossStrength = powerScore(
    archetype.maxHealth * BOSS_HEALTH_MULTIPLIER,
    archetype.contactDamage * BOSS_DAMAGE_MULTIPLIER
  );
  return guardStrength + bossStrength;
}

/** A goliath's full (undamaged) strength from archetype stats plus the elite advantage. */
export function goliathFullStrength(archetype: GoliathArchetype): number {
  return powerScore(archetype.maxHealth, archetype.contactDamage) * GOLIATH_POWER_ADVANTAGE;
}

/**
 * Probability the goliath beats the camp: its (health-scaled) strength share of
 * the pair. Monotonic — a stronger or healthier goliath wins more; a stronger
 * camp wins less. Exported so wiring/tests can preview and assert the curve.
 */
export function goliathWinChance(
  archetype: GoliathArchetype,
  healthFraction: number,
  campSite: CampSite
): number {
  const goliathStrength = goliathFullStrength(archetype) * clampFraction(healthFraction);
  const camp = campStrength(campSite);
  return goliathStrength / (goliathStrength + camp);
}

/** Seeded fight roll in [0,1) — deterministic per (slot, camp, window), dynamic across matchups. */
function fightRoll(slotId: bigint, campIndex: number, windowBucket: bigint): number {
  const seed = seedFrom(slotId, windowBucket, FIGHT_SEED_SALT ^ (campIndex * CAMP_SEED_STRIDE)) >>> 0;
  return createSeededRandom(seed)();
}

/** Seeded march-in point on a ring beyond the islands. */
function spawnPointFor(slotId: bigint, windowBucket: bigint): Point {
  const random = createSeededRandom(seedFrom(slotId, windowBucket, SPAWN_SEED_SALT));
  const angle = random() * Math.PI * 2;
  return { x: Math.cos(angle) * SPAWN_RING_RADIUS, z: Math.sin(angle) * SPAWN_RING_RADIUS };
}

/** Seeded visitation order (Fisher–Yates over camp indices), trimmed to the route length. */
function routeCampIndices(slotId: bigint, windowBucket: bigint, campCount: number): number[] {
  const random = createSeededRandom(seedFrom(slotId, windowBucket, ROUTE_SEED_SALT));
  const order = Array.from({ length: campCount }, (_unused, index) => index);
  for (let index = campCount - 1; index > 0; index--) {
    const swapWith = Math.floor(random() * (index + 1));
    const held = order[index];
    order[index] = order[swapWith];
    order[swapWith] = held;
  }
  return order.slice(0, Math.min(ROUTE_CAMP_COUNT, campCount));
}

function windowStartMicros(windowBucket: bigint): bigint {
  return windowBucket * GOLIATH_BATCH_WINDOW_MICROS;
}

/** Builds the full deterministic timeline (legs + events) for one goliath in one window. */
function buildPlan(
  descriptor: GoliathSpawnDescriptor,
  campSites: readonly CampSite[],
  windowBucket: bigint
): GoliathPlan {
  const { slotId, archetype } = descriptor;
  const startMicros = windowStartMicros(windowBucket);
  const spawnPoint = spawnPointFor(slotId, windowBucket);
  const routeIndices = routeCampIndices(slotId, windowBucket, campSites.length);

  const legs: RaidLeg[] = [];
  const routePoints: Point[] = [];
  const events: GoliathRaidEvent[] = [];
  let healthFraction = 1;
  let fromPoint = spawnPoint;
  let cursorSeconds = 0;
  let isDefeated = false;

  for (const campIndex of routeIndices) {
    const campSite = campSites[campIndex];
    const campPoint: Point = { x: campSite.x, z: campSite.z };
    routePoints.push(campPoint);

    const travelStartSeconds = cursorSeconds;
    const travelEndSeconds = travelStartSeconds + TRAVEL_SECONDS;
    const engageEndSeconds = travelEndSeconds + ENGAGE_SECONDS;
    const atMicros = startMicros + BigInt(Math.round(engageEndSeconds * MICROS_PER_SECOND));

    const won = fightRoll(slotId, campIndex, windowBucket) < goliathWinChance(archetype, healthFraction, campSite);
    legs.push({
      campIndex,
      fromPoint,
      campPoint,
      travelStartSeconds,
      travelEndSeconds,
      engageEndSeconds,
      healthFraction,
      won,
    });

    if (!won) {
      events.push({
        kind: 'goliathDefeated',
        slotId,
        sizeIndex: archetype.sizeIndex,
        position: campPoint,
        atMicros,
      });
      isDefeated = true;
      cursorSeconds = engageEndSeconds;
      break;
    }

    const enemyArchetype = ENEMY_ARCHETYPES[campSite.archetypeId];
    events.push({
      kind: 'raidBossKill',
      campIndex,
      bossEnemyId: BigInt(enemyIdFor(campIndex, 0)),
      rewardTier: enemyArchetype.rewardTier,
      position: campPoint,
      atMicros,
    });
    // Wear down for the next camp — a tough camp costs proportionally more.
    const wear = WEAR_PER_CAMP * (campStrength(campSite) / goliathFullStrength(archetype));
    healthFraction = Math.max(MIN_HEALTH_FRACTION, healthFraction - wear);
    cursorSeconds = engageEndSeconds;
    fromPoint = campPoint;
  }

  return {
    descriptor,
    spawnPoint,
    legs,
    routePoints,
    isDefeated,
    survivedHealthFraction: healthFraction,
    clearedEndSeconds: cursorSeconds,
    events,
  };
}

/** Interpolated spatial + health state of one goliath at secondsIntoWindow. */
function stateFromPlan(plan: GoliathPlan, secondsIntoWindow: number): GoliathScheduleState {
  const { descriptor } = plan;
  const base = { slotId: descriptor.slotId, archetype: descriptor.archetype };

  for (const leg of plan.legs) {
    if (secondsIntoWindow < leg.travelEndSeconds) {
      const travelFraction = clampFraction(
        (secondsIntoWindow - leg.travelStartSeconds) / TRAVEL_SECONDS
      );
      return {
        ...base,
        position: lerpPoint(leg.fromPoint, leg.campPoint, travelFraction),
        healthFraction: leg.healthFraction,
        isDefeated: false,
        currentTargetCampIndex: leg.campIndex,
      };
    }
    if (secondsIntoWindow < leg.engageEndSeconds) {
      return {
        ...base,
        position: leg.campPoint,
        healthFraction: leg.healthFraction,
        isDefeated: false,
        currentTargetCampIndex: leg.campIndex,
      };
    }
    if (!leg.won) {
      // Fell to this camp — stays dead at the camp for the rest of the window.
      return {
        ...base,
        position: leg.campPoint,
        healthFraction: 0,
        isDefeated: true,
        currentTargetCampIndex: null,
      };
    }
  }

  // Cleared every camp on the route: roam the loop of camp homes forever.
  return roamingState(plan, secondsIntoWindow);
}

function roamingState(plan: GoliathPlan, secondsIntoWindow: number): GoliathScheduleState {
  const { descriptor, routePoints } = plan;
  const base = { slotId: descriptor.slotId, archetype: descriptor.archetype };
  const loopLength = routePoints.length;
  if (loopLength === 0) {
    return {
      ...base,
      position: plan.spawnPoint,
      healthFraction: plan.survivedHealthFraction,
      isDefeated: false,
      currentTargetCampIndex: null,
    };
  }

  const secondsRoaming = Math.max(0, secondsIntoWindow - plan.clearedEndSeconds);
  const segment = Math.floor(secondsRoaming / TRAVEL_SECONDS);
  // The route ended standing at its last camp, so roaming starts from there.
  const fromIndex = (loopLength - 1 + segment) % loopLength;
  const toIndex = (fromIndex + 1) % loopLength;
  const segmentFraction = (secondsRoaming % TRAVEL_SECONDS) / TRAVEL_SECONDS;

  return {
    ...base,
    position: lerpPoint(routePoints[fromIndex], routePoints[toIndex], segmentFraction),
    healthFraction: plan.survivedHealthFraction,
    isDefeated: false,
    currentTargetCampIndex: plan.legs[toIndex]?.campIndex ?? null,
  };
}

/** The batch minted for a given window bucket (bucket → representative time). */
function batchForBucket(windowBucket: bigint): GoliathSpawnDescriptor[] {
  return goliathBatchForTime(windowStartMicros(windowBucket));
}

/**
 * Spatial + health state of every active goliath at the shared instant. Pure and
 * deterministic: identical output for any two calls with the same inputs, so two
 * clients agree on positions, health, and defeated flags.
 */
export function goliathStatesAtTime(
  campSites: readonly CampSite[],
  sharedTimeMicros: bigint
): GoliathScheduleState[] {
  const windowBucket = sharedTimeMicros / GOLIATH_BATCH_WINDOW_MICROS;
  const secondsIntoWindow =
    Number(sharedTimeMicros - windowStartMicros(windowBucket)) / MICROS_PER_SECOND;
  return batchForBucket(windowBucket).map(descriptor =>
    stateFromPlan(buildPlan(descriptor, campSites, windowBucket), secondsIntoWindow)
  );
}

/**
 * Every raid event whose atMicros falls in the half-open interval
 * (afterMicros, throughMicros]. Half-open so consecutive slices edge-trigger each
 * event exactly once — no dup, no gap — when the system advances a marker across
 * frames. Deterministically ordered by time then slot then kind.
 */
export function goliathRaidEventsInWindow(
  campSites: readonly CampSite[],
  afterMicros: bigint,
  throughMicros: bigint
): GoliathRaidEvent[] {
  if (throughMicros <= afterMicros) return [];
  const firstBucket = (afterMicros < 0n ? 0n : afterMicros) / GOLIATH_BATCH_WINDOW_MICROS;
  const lastBucket = throughMicros / GOLIATH_BATCH_WINDOW_MICROS;

  const events: GoliathRaidEvent[] = [];
  for (let windowBucket = firstBucket; windowBucket <= lastBucket; windowBucket++) {
    for (const descriptor of batchForBucket(windowBucket)) {
      const plan = buildPlan(descriptor, campSites, windowBucket);
      for (const event of plan.events) {
        if (event.atMicros > afterMicros && event.atMicros <= throughMicros) events.push(event);
      }
    }
  }

  return events.sort((first, second) => {
    if (first.atMicros !== second.atMicros) return first.atMicros < second.atMicros ? -1 : 1;
    const firstSlot = first.kind === 'goliathDefeated' ? first.slotId : first.bossEnemyId;
    const secondSlot = second.kind === 'goliathDefeated' ? second.slotId : second.bossEnemyId;
    if (firstSlot !== secondSlot) return firstSlot < secondSlot ? -1 : 1;
    return first.kind.localeCompare(second.kind);
  });
}
