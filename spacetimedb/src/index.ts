import { schema, t, table, SenderError } from 'spacetimedb/server';
import { ScheduleAt, Identity } from 'spacetimedb';
import { sha256Hex, bytesToHex } from './sha256';
import { createSeededRandom } from './rng';
import { generateCampSites } from './worldGen';
import {
  ENEMY_ARCHETYPE_STATS,
  MEMBERS_PER_CAMP,
  enemyIdFor,
  isBossMember,
  enemyMaxHealth,
  enemyContactDamage,
  GOLIATH_SIZE_STATS,
  goliathBatchForWindow,
} from './enemyStats';
import { damagePerTick, distanceBetween, gemIsCollectible, stepToward, windowBucketFor } from './combatMath';
import { pickRayHit } from './hitscan';
import { resistedDamage, GOLIATH_RESISTANCES, PLAYER_RESISTANCES, type DamageType, type ResistanceProfile } from './resistances';
import { computeBaseDamage, CHARACTER_COMBAT } from './damage';
import { rollCrit } from './crit';
import { nextSkillReadyAt, skillGrantActive } from './skillGate';
import { isWalkable, nextGoliathWaypoint } from './bridges';
import { chooseGoliathTargetCamp, headingFromStep, hasReachedCamp, isWithinForwardArc } from './goliathAI';
import { resolveTranscendInstall } from './transcendInstall';
import { resolveDupeGrant } from './gachaOverflow';
import { applyDeathShardPenalty } from './deathPenalty';
import { nextLeader, canAccept } from './partyRules';
import { runUnitAttacks } from './unitAttacks';
import { moveEnemies } from './enemyMovement';
import { isSlimeArchetype } from './slimeHop';
import { steeredStep } from './steering';
import {
  AGGRO_GOLIATH,
  AGGRO_HOME,
  AGGRO_PLAYER,
  aggroExpired,
  clampToWorld,
  isInsideSafeZone,
} from './worldRules';

// Keep in sync with src/game/data/characters.ts (client roster).
// maxHealth  = per-character pool.
// healthRegen = HP the character regens for itself per second (0 = none).
// healType   = 'none' | 'active' (heals party on skill cast) | 'passive' (aura, heals party ~1/s while on field).
// healMode   = how healPower is read: 'percent' of target maxHP | 'combo' HP per combo point | 'flat' HP per proc.
type HealType = 'none' | 'active' | 'passive';
type HealMode = 'percent' | 'combo' | 'flat';
interface CharacterStat {
  stars: 4 | 5;
  maxHealth: number;
  healthRegen: number;
  role: 'tank' | 'dps' | 'healer' | 'support';
  critRate: number;
  critDmg: number;
  healType: HealType;
  healMode: HealMode;
  healPower: number;
}
const NO_HEAL = { healType: 'none' as HealType, healMode: 'flat' as HealMode, healPower: 0 };
const CHARACTER_STATS: Record<string, CharacterStat> = {
  aeris: { stars: 5, maxHealth: 950, healthRegen: 0, role: 'support', critRate: 0.20, critDmg: 1.60, ...NO_HEAL },
  terron: { stars: 5, maxHealth: 1400, healthRegen: 0, role: 'tank', critRate: 0.12, critDmg: 1.50, ...NO_HEAL },
  volta: { stars: 5, maxHealth: 1000, healthRegen: 0, role: 'dps', critRate: 0.34, critDmg: 1.90, ...NO_HEAL },
  silva: { stars: 5, maxHealth: 1050, healthRegen: 8, role: 'dps', critRate: 0.33, critDmg: 2.00, ...NO_HEAL },
  // Marina: active healer — her water ring heals the whole party for 20% of each pool.
  marina: { stars: 5, maxHealth: 1150, healthRegen: 12, role: 'healer', critRate: 0.18, critDmg: 1.60, healType: 'active', healMode: 'percent', healPower: 0.2 },
  ignis: { stars: 5, maxHealth: 1300, healthRegen: 0, role: 'tank', critRate: 0.13, critDmg: 1.55, ...NO_HEAL },
  sarma: { stars: 5, maxHealth: 1000, healthRegen: 0, role: 'dps', critRate: 0.32, critDmg: 1.95, ...NO_HEAL },
  // Nereīda: active healer — her tide arrows mend the party for 20% of each pool.
  nereida: { stars: 5, maxHealth: 1120, healthRegen: 14, role: 'healer', critRate: 0.19, critDmg: 1.65, healType: 'active', healMode: 'percent', healPower: 0.2 },
  vesper: { stars: 5, maxHealth: 1080, healthRegen: 0, role: 'dps', critRate: 0.36, critDmg: 2.10, ...NO_HEAL },
  glacia: { stars: 5, maxHealth: 1550, healthRegen: 0, role: 'tank', critRate: 0.10, critDmg: 1.45, ...NO_HEAL },
  zefs: { stars: 4, maxHealth: 900, healthRegen: 0, role: 'support', critRate: 0.22, critDmg: 1.70, ...NO_HEAL },
  petra: { stars: 4, maxHealth: 1200, healthRegen: 0, role: 'tank', critRate: 0.14, critDmg: 1.50, ...NO_HEAL },
  zibo: { stars: 4, maxHealth: 1000, healthRegen: 0, role: 'dps', critRate: 0.30, critDmg: 1.85, ...NO_HEAL },
  // Lapa (dendro): active healer — spore burst heal scales with the combo count.
  lapa: { stars: 4, maxHealth: 950, healthRegen: 15, role: 'healer', critRate: 0.17, critDmg: 1.55, healType: 'active', healMode: 'combo', healPower: 6 },
  // Rasa (hydro): passive healer — water aura heals the party 10 HP/sec while on field.
  rasa: { stars: 4, maxHealth: 1000, healthRegen: 10, role: 'healer', critRate: 0.16, critDmg: 1.50, healType: 'passive', healMode: 'flat', healPower: 10 },
  dzirkste: { stars: 4, maxHealth: 1000, healthRegen: 0, role: 'dps', critRate: 0.31, critDmg: 1.90, ...NO_HEAL },
  stindzis: { stars: 4, maxHealth: 950, healthRegen: 0, role: 'dps', critRate: 0.35, critDmg: 2.05, ...NO_HEAL },
};
const MAX_COMBO_FOR_HEAL = 50;
const CHARACTER_POOL = Object.entries(CHARACTER_STATS).map(([characterId, s]) => ({
  characterId,
  stars: s.stars,
}));

const STARTER_CHARACTER_ID = 'zibo';
const PARTY_SIZE = 4;
const MAX_CONSTELLATION = 6; // C6 is the cap; duplicates past it mint transcend shards
const HEAL_CONSTELLATION_STEP = 0.15; // healers heal +15% per constellation
const STARTING_GEMS = 16000;
const GACHA_PULL_COST = 160;
const KILL_REWARD_GEMS = 40;
const MAX_KILL_REWARD_TIER = 3;

// Transcendence tunables (locked Phase 0; wired in phases 1-7). Declared only — no reducer references them yet.
const MAX_TRANSCEND_LEVEL = 10;
const TRANSCEND_DAMAGE_STEP = 0.05;
const TRANSCEND_HEAL_STEP = 0.08;
const SHARD_PER_OVERFLOW_DUPE = 1;
const SHARD_DEATH_LOSS = 1;
const RAID_SHARD_PAYOUT = 6;
const RAID_PARTY_SIZE = 4; // player-party (raid squad) cap per D-06, DISTINCT from PARTY_SIZE (character team)
const TRANSCEND_SHARD_COST = (n: number): number => n; // installing level n costs n shards

// ---- Wish banners + weapon catalog + pity (mirror src/game/data/gacha.ts) ----
const BANNERS: Record<string, { featuredCharacterId: string }> = {
  tide: { featuredCharacterId: 'nereida' },
  storm: { featuredCharacterId: 'vesper' },
  glacier: { featuredCharacterId: 'glacia' },
};
const GACHA_WEAPONS: Array<{ id: string; rarity: 3 | 4 | 5 }> = [
  { id: 'debesu-zobens', rarity: 5 },
  { id: 'vilku-kaps', rarity: 5 },
  { id: 'amosa-loks', rarity: 5 },
  { id: 'homas-skeptrs', rarity: 5 },
  { id: 'zudusi-lugsna', rarity: 5 },
  { id: 'saules-zobens', rarity: 4 },
  { id: 'kalna-cirvis', rarity: 4 },
  { id: 'kara-loks', rarity: 4 },
  { id: 'lietus-skeps', rarity: 4 },
  { id: 'veja-gramata', rarity: 4 },
  { id: 'koka-zobens', rarity: 3 },
  { id: 'mednieka-loks', rarity: 3 },
  { id: 'dzelzs-skeps', rarity: 3 },
];
// Genshin-authentic rates: 0.6% base 5★ (≈1.6% averaged over the pity curve),
// soft pity ramps from pull 74, hard pity guarantees a 5★ at 90. 4★ at 5.1%,
// guaranteed within 10. A 5★ every ~10 pulls is no longer expected.
const FIVE_STAR_BASE_RATE = 0.006;
const SOFT_PITY_START = 74;
const HARD_PITY = 90;
const SOFT_PITY_STEP = 0.06;
const FOUR_STAR_RATE = 0.051;
const FOUR_STAR_PITY = 10;
// Capturing Radiance: the consolidated chance a character-banner 5★ is the
// featured character when you are not already on a guarantee. HoYo's published
// figure is ~55% (a 50/50 base lifted by the anti-streak radiance mechanic).
const FEATURED_5STAR_WIN = 0.55;
const FOUR_STAR_CHARACTER_SHARE = 0.5;
const MAX_PULLS_PER_REQUEST = 10;
// Keep in sync with src/game/data/constants.ts (archipelago extent).
// MOVEMENT_LIMIT lives in worldRules.ts (shared with unitAttacks.ts via clampToWorld).
const WORLD_BOUND = 130;
const VOID_DEATH_DEPTH = -10;
const MAX_VERTICAL_STEP = 8;

// Keep in sync with ISLANDS in src/game/world/terrain.ts.
const ISLAND_ZONES = [
  { centerX: 0, centerZ: 0, radius: 46 },
  { centerX: 95, centerZ: 20, radius: 26 },
  { centerX: -80, centerZ: -60, radius: 24 },
  { centerX: -20, centerZ: 100, radius: 22 },
  { centerX: 60, centerZ: -85, radius: 24 },
];

function isOverAnyIsland(positionX: number, positionZ: number) {
  return ISLAND_ZONES.some(
    island =>
      Math.hypot(positionX - island.centerX, positionZ - island.centerZ) <= island.radius
  );
}
const SPAWN_X = 6;
const SPAWN_Z = 6;
const DEFAULT_MAX_HEALTH = 1000;
const REGEN_INTERVAL_MICROS = 1_000_000n;
const MAX_HIT_DAMAGE = 400;

function statsFor(characterId: string) {
  return CHARACTER_STATS[characterId] ?? { stars: 4 as const, maxHealth: DEFAULT_MAX_HEALTH, healthRegen: 0, role: 'dps' as const, ...NO_HEAL };
}

// 5★ probability of a pull, given how many pulls have happened since the last
// 5★ (this pull included). Ramps from SOFT_PITY_START up to a guarantee at HARD_PITY.
function fiveStarChance(pullNumber: number) {
  if (pullNumber >= HARD_PITY) return 1;
  if (pullNumber < SOFT_PITY_START) return FIVE_STAR_BASE_RATE;
  return Math.min(1, FIVE_STAR_BASE_RATE + (pullNumber - (SOFT_PITY_START - 1)) * SOFT_PITY_STEP);
}

function weaponsByRarity(rarity: number) {
  return GACHA_WEAPONS.filter(weapon => weapon.rarity === rarity);
}

function pickWeaponId(ctx: { random: any }, rarity: number) {
  const pool = weaponsByRarity(rarity);
  return pool[ctx.random.integerInRange(0, pool.length - 1)].id;
}

function pickFourStarCharacterId(ctx: { random: any }) {
  const pool = Object.keys(CHARACTER_STATS).filter(id => CHARACTER_STATS[id].stars === 4);
  return pool[ctx.random.integerInRange(0, pool.length - 1)];
}

// Genshin's character-banner "lost 50/50" pool: the permanent standard 5★s.
// That's every 5★ character NOT featured on a limited banner, plus the 5★
// weapons — drawn uniformly. Modelling it this way keeps the 5★ weapons
// obtainable (this game has no separate weapon banner) and matches Genshin,
// where a lost 50/50 yields a random standard 5★ character OR weapon.
const FEATURED_5STAR_IDS = new Set(Object.values(BANNERS).map(banner => banner.featuredCharacterId));
const STANDARD_5STAR_POOL: Array<{ kind: 'character' | 'weapon'; id: string }> = [
  ...Object.keys(CHARACTER_STATS)
    .filter(id => CHARACTER_STATS[id].stars === 5 && !FEATURED_5STAR_IDS.has(id))
    .map(id => ({ kind: 'character' as const, id })),
  ...GACHA_WEAPONS.filter(weapon => weapon.rarity === 5).map(weapon => ({
    kind: 'weapon' as const,
    id: weapon.id,
  })),
];

function pickStandardFiveStar(ctx: { random: any }) {
  return STANDARD_5STAR_POOL[ctx.random.integerInRange(0, STANDARD_5STAR_POOL.length - 1)];
}
// Bow projectiles fly up to ~45 units; server range check must cover them.
const MAX_HIT_RANGE = 45;
// Hard cap on a player's attack blast radius, so attackEnemies can't be spoofed
// into a map-wide sweep. Generously above any real melee/skill area.
const MAX_ATTACK_RADIUS = 20;
// A ranged hitscan ray is a thin line, not a blast — cap its forgiveness radius
// tightly so it can't be spoofed into a wide sweep along the ray.
const MAX_RANGED_HIT_RADIUS = 3;
const MAX_STEP_DISTANCE = 12;
const MAX_COMBO_FOR_GEMS = 100;
// How long after a valid castSkill an isSkill hit still earns the uncapped skill
// multiplier (D2-03). ~5s spans the animation + travel of the longest skills; past
// it, an isSkill hit downgrades to a basic swing (skillGrantActive gate).
const SKILL_HIT_WINDOW_MICROS = 5_000_000n;
const COMBO_GEM_STEP = 0.03; // +3% dropped gems per combo point (capped)
const PVP_DEATH_SPILL = 1 / 3; // fraction of gems a PVP loser drops
const PVE_DEATH_SPILL = 1 / 4; // fraction a player drops when an enemy kills them
const CARRY_HARD_CAP = 20000; // server sanity cap on enemy-carried gems per kill
const BOSS_GEM_MULTIPLIER = 3; // a boss kill pays triple the base reward
// A goliath raider's own base gem stipend, indexed by its size tier
// (0 = small, 1 = medium, 2 = large). Steal-able and paid on kill on top of any
// hoard it grabbed. Mirrored client-side in src/game/data/goliathArchetypes.ts
// (kept in sync by serverSync.test.ts).
const GOLIATH_BASE_GEMS_BY_SIZE = [500, 1000, 2000];
// Goliath raiders use enemy ids at/above this base, disjoint from camp enemy ids
// (campIndex*100 + member). Lets the server tell a goliath from a camp enemy by id.
// Mirrors client GOLIATH_SLOT_IDS in src/game/systems/goliathIdentity.ts.
const GOLIATH_SLOT_ID_BASE = 900000n;
// A goliath spawns once per 5-minute window and never respawns inside it, so once
// its slot is killed (by a player OR a camp) it stays paid-out for the whole
// window — unlike camp enemies, which respawn every ENEMY_RESPAWN_MICROS. Mirrors
// client GOLIATH_BATCH_WINDOW_MICROS in src/game/systems/goliathIdentity.ts.
const GOLIATH_BATCH_WINDOW_MICROS = 300_000_000n;
// A dead camp enemy revives at full health at its home after this delay. Matches
// the client RESPAWN_DELAY_SECONDS so the respawn cadence looks the same.
const ENEMY_RESPAWN_MICROS = 6_000_000n;
const GEM_SPILL_SCATTER = 2.2; // how far spilled gems scatter from the death spot
const MAX_SPILL_GEMS = 40; // physical drop cap; overflow folds into the biggest piece
// A hoard is spilled as many small gems in these denominations (largest first),
// so a kill rains lots of pickups instead of one fat gem. Client visuals key off
// the amount. Mirrored client-side in src/game/data/gemDrops.ts (kept in sync by
// serverSync.test.ts).
const GEM_DENOMINATIONS = [500, 100, 50, 20, 10, 5, 1];
// A fresh ground drop can't be vacuumed or picked up until this grace period has
// elapsed. Mirrors the client GEM_PICKUP_DELAY (1.2s) so server and client agree
// on when a drop becomes collectible — gems visibly fall and rest first.
const GEM_PICKUP_DELAY_MICROS = 1_200_000n;

// ---- Server-authoritative world simulation (enemies + goliath raiders) -------
// The camp fight runs on the server: the world tick moves every enemy/goliath,
// resolves REAL contact damage (no dice), spills loot on death, and vacuums
// ground gems. Clients become renderers that read the enemy/goliath tables.
const WORLD_TICK_INTERVAL_MICROS = 150_000n; // ~6.7 ticks/sec
// Aggro is a 5-second refreshable memory: an entity fights whoever last DAMAGED
// it, and forgets 5s after the last hit. Walking near never flips aggro.
const AGGRO_DURATION_MICROS = 5_000_000n;
// Enemies spawn scattered around their camp home; matches client SPAWN_SCATTER_RADIUS.
const SPAWN_SCATTER_RADIUS = 3;
const ENEMY_SPAWN_SEED = 0xbeef5; // matches the client enemy spawn PRNG seed
// Contact reach for the various fights (world units).
const ENEMY_GOLIATH_CONTACT_RANGE = 2.5; // goliath ↔ camp member (strike + bite-back)
const GOLIATH_SPLASH_RANGE = 4.0; // the largest raider hits everything in here
// A raider this close rallies the WHOLE camp to defend it (aggro only — the strike
// itself is still single-target unless the raider splashes). This is what makes a
// fresh camp gang up and eventually overpower a wounded goliath.
const GOLIATH_ENGAGE_RANGE = 8.0;
const ENEMY_PLAYER_CONTACT_RANGE = 1.8; // walking member (wisp/golem) ↔ player it is chasing
// DEV puppet (training dummy) chase tuning.
const PUPPET_SPEED = 6; // units/sec toward the nearest real player
const PUPPET_STOP_RADIUS = 1.8; // stop this close so it stays in melee reach
// A camp member notices an open-field player within this range and MIGHT turn
// aggressive — rolled per tick so a camp feels alive (some members lock on fast,
// some hang back) rather than every member snapping on the instant you arrive.
const ENEMY_AGGRO_RANGE = 12;
const ENEMY_PROXIMITY_AGGRO_CHANCE = 0.08;
// Aggro is contagious: a camp member already fighting a player infects nearby
// camp-mates, so hitting one enemy wakes the camp gradually (one, then another),
// spreading like a virus rather than the whole camp snapping on at once.
const ENEMY_AGGRO_SPREAD_RANGE = 8;
const ENEMY_AGGRO_SPREAD_CHANCE = 0.16;
// A goliath hits camp members far harder than they were authored to hit players,
// so it clears a couple of easy camps before the accumulated counter-damage from
// fresh, respawning camps wears it down (~2-3 slime-tier camps for a small
// raider; a stone-golem camp overpowers it outright). Pure HP attrition.
const GOLIATH_VS_ENEMY_DAMAGE_MULTIPLIER = 3;
// Gem vacuum reach: goliaths sweep a wider area than slimes.
const ENEMY_GEM_VACUUM_RANGE = 1.7; // matches client ENEMY_GEM_GRAB_RANGE
const GOLIATH_GEM_VACUUM_RANGE = 3.0;
// A raider stops stepping once within this of its target camp center, so it stands
// among the scattered members instead of orbiting the exact point forever.
const GOLIATH_STOP_RADIUS = 3.0;
// It raids a camp for this long after arriving, then advances to the next camp.
const GOLIATH_ENGAGE_DURATION_MICROS = 12_000_000n;
// A raider only rallies + strikes members inside a frontal cone of its movement
// heading (dot ≥ this). ≈156° arc: it commits to the camp it walks into and drops
// the one behind it once it turns to walk on.
const GOLIATH_FACING_ARC_MIN_DOT = 0.25;

const player = table(
  { name: 'player', public: true },
  {
    identity: t.identity().primaryKey(),
    name: t.string(),
    online: t.bool(),
    positionX: t.f32(),
    positionY: t.f32(),
    positionZ: t.f32(),
    rotationY: t.f32(),
    activeCharacterId: t.string(),
    // Ordered party (up to PARTY_SIZE character ids) the player picked.
    partyOrder: t.array(t.string()),
    gems: t.u32(),
    currentHealth: t.u32(),
    lastKillRewardAt: t.timestamp(),
    // Leaderboard stats: gems this player dropped via kills vs gems they picked
    // up off the ground (others can steal your drops).
    gemsFromKills: t.u32(),
    gemsCollected: t.u32(),
    // Durable transcendence currency minted by C6-overflow dupes (REQ-shard-currency-mint).
    // .default(0) lets the additive migrate backfill existing player rows to 0 (assumption A1)
    // without a data wipe — SpacetimeDB refuses to add a non-defaulted column to a populated table.
    transcendShards: t.u32().default(0),
    // Authoritative skill cooldown state (CRIT-02 / D2-03). skillReadyAtMicros gates
    // the next castSkill; skillWindowEndsAtMicros is the deadline through which an
    // isSkill hit earns the uncapped skill multiplier. Both .default(0n) so the
    // additive migrate backfills populated rows without a wipe (Pitfall 2).
    skillReadyAtMicros: t.u64().default(0n),
    skillWindowEndsAtMicros: t.u64().default(0n),
    // Slam-victim stun window (HIT-01/D4-10): updatePosition rejects client
    // positions while now < this, so the server owns the knocked-back position
    // for the whole stun. Appended LAST with .default(0n) so the additive
    // migrate backfills populated rows without a wipe (Pitfall 2).
    stunnedUntilMicros: t.u64().default(0n),
  }
);

// Gems dropped on the ground by a kill. Any player can walk over and grab
// them; droppedBy records who earned them for the leaderboard.
const gemDrop = table(
  { name: 'gem_drop', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    positionX: t.f32(),
    positionZ: t.f32(),
    amount: t.u32(),
    droppedBy: t.identity(),
    // .default(0n) makes adding this column an additive migration (STDB backfills
    // any pre-existing row with 0n, which reads as long-elapsed → collectible).
    droppedAtMicros: t.u64().default(0n),
  }
);

// A single scarce transcendence shard dropped on the ground by a PVE death.
// Mirrors gem_drop exactly but is always a count-1 piece (no denomination shower)
// and is NEVER vacuumed by camps. Any player can grab it after the reused pickup
// grace. droppedAtMicros defaults to 0n so this whole new table is an additive
// migration and pre-existing (none, it's new) rows read as long-elapsed/collectible.
const shardDrop = table(
  { name: 'shard_drop', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    positionX: t.f32(),
    positionZ: t.f32(),
    amount: t.u32(),
    droppedBy: t.identity(),
    droppedAtMicros: t.u64().default(0n),
  }
);

// A server-authoritative camp enemy. Spawned at init (one boss + guards per camp),
// moved and fought by the world tick. Public so clients render position, health,
// and the gem hoard. enemyId is the stable camp+member id (enemyIdFor).
const enemy = table(
  { name: 'enemy', public: true },
  {
    enemyId: t.u64().primaryKey(),
    campIndex: t.u32(),
    archetypeId: t.string(),
    isBoss: t.bool(),
    rewardTier: t.u32(),
    homeX: t.f32(),
    homeZ: t.f32(),
    positionX: t.f32(),
    positionZ: t.f32(),
    health: t.u32(),
    maxHealth: t.u32(),
    contactDamage: t.u32(),
    carriedGems: t.u32(),
    // Aggro: fights whoever last DAMAGED it, for a 5s refreshable memory.
    aggroKind: t.u32(), // 0 home / 1 player / 2 goliath
    aggroPlayer: t.option(t.identity()),
    aggroGoliathId: t.u64(),
    aggroExpiresAtMicros: t.u64(),
    alive: t.bool(),
    respawnAtMicros: t.u64(),
    // NOTE: appended (not reordered) with defaults so the schema diff stays
    // additive on a populated DB (STDB rejects a non-defaulted or mid-table
    // column). Slime hop cycle in MICROS — tick-rate independent (slimeHop.ts):
    // hopDurationMicros 0 = grounded/idle; the client animates the bounce arc
    // from these two columns.
    hopStartedAtMicros: t.u64().default(0n),
    hopDurationMicros: t.u64().default(0n),
    // Hop landing, locked at hop start (the slime travels toward it while
    // airborne and slams there on the landing tick).
    hopTargetX: t.f32().default(0),
    hopTargetZ: t.f32().default(0),
    // Current patrol destination on the home ring; (0,0) = none picked yet
    // (never a legal ring point — camps sit far from the origin safe zone).
    patrolTargetX: t.f32().default(0),
    patrolTargetZ: t.f32().default(0),
    // Rests (no hop/walk) until this deadline: the grounded pause between hops
    // and the pause at each patrol point share it.
    restUntilMicros: t.u64().default(0n),
  }
);

// A roaming goliath raider. Spawned by the world tick, one seeded batch (1-3) per
// 5-minute window; never respawns inside its window once dead. Public so clients
// render it. goliathId is a fixed slot id (GOLIATH_SLOT_ID_BASE + 1..3).
const goliath = table(
  { name: 'goliath', public: true },
  {
    goliathId: t.u64().primaryKey(),
    sizeIndex: t.u32(),
    positionX: t.f32(),
    positionZ: t.f32(),
    health: t.u32(),
    maxHealth: t.u32(),
    contactDamage: t.u32(),
    moveSpeed: t.f32(),
    splashes: t.bool(),
    carriedGems: t.u32(),
    targetCampIndex: t.i32(), // -1 = no target / roaming
    aggroPlayer: t.option(t.identity()),
    aggroExpiresAtMicros: t.u64(),
    alive: t.bool(),
    windowBucket: t.u64(),
    // NOTE: appended (not reordered) so the schema diff stays additive. STDB
    // rejects inserting a column mid-table on an existing DB (manual migration).
    // When the raider has stood in its current camp long enough and should move
    // on (0 = not engaged / not yet arrived). Set on arrival, cleared on leave.
    engageEndsAtMicros: t.u64().default(0n),
    // The camp it just finished raiding, excluded from the very next target pick
    // so it doesn't immediately re-lock the camp it just left (-1 = none).
    lastRaidedCampIndex: t.i32().default(-1),
    // Unit facing from the latest movement step (Issue 5 gates camp engagement by
    // this forward arc); kept pointing at the camp it walked into while stopped.
    headingX: t.f32().default(0),
    headingZ: t.f32().default(0),
  }
);

// Per-unit attack-FSM state (FSM-01/FSM-06), unit-agnostic: unitKind 0 = goliath
// (1 = camp enemy, 2 = hero later — zero schema change to reuse). Rows are lazily
// upserted per unit by runUnitAttacks: the table starts EMPTY on a migrated DB and
// is NEVER the iteration driver — the tick iterates live units and looks its row
// up via by_unit. A whole new table (not columns on goliath) so the migrate stays
// additive and other unit kinds join without touching their own tables.
const unitAttack = table(
  {
    name: 'unit_attack',
    public: true,
    indexes: [{ accessor: 'by_unit', algorithm: 'btree', columns: ['unitKind', 'unitId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    unitKind: t.u32(),
    unitId: t.u64(),
    state: t.u32(), // ATTACK_STATE_* (attacks.ts): idle/windup/strike/recovery
    attackId: t.string(), // key into ATTACKS ('' until the first windup)
    startedAtMicros: t.u64(),
    strikeAtMicros: t.u64(),
    recoveryEndsAtMicros: t.u64(),
    cooldownUntilMicros: t.u64(),
    // Landing LOCKED at windup entry (ATK-01) — later transitions only read it.
    landingX: t.f32(),
    landingZ: t.f32(),
    radius: t.f32(),
    // The cast root the unit stays planted on through the windup (D4-12).
    castX: t.f32(),
    castZ: t.f32(),
    strikeResolved: t.bool(),
    poise: t.u32(), // reset on windup entry; consumed by Phase-7 interrupts
    // Basic-attack cooldown, split from the skill cooldown (D5-08): 'basic' role
    // attacks gate on and write THIS field so the swing/swirl rhythm never blocks
    // the slam (or vice versa). Appended LAST with .default(0n) so the additive
    // migrate backfills populated rows without a wipe (Pitfall 6).
    basicCooldownUntilMicros: t.u64().default(0n),
  }
);

const ownedCharacter = table(
  { name: 'owned_character', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity().index('btree'),
    characterId: t.string(),
    // Each character keeps its own HP; only the active one is in the world, so
    // benched characters stay wounded until a healer tops them up.
    currentHealth: t.u32(),
    // Constellation level 0..6; duplicate pulls raise it. This is the UNLOCKED
    // ceiling — how many stars the player has earned for this character.
    constellation: t.u32(),
    // Transcendence install level 0..MAX_TRANSCEND_LEVEL, bought with transcendShards
    // past C6 (REQ-transcend-install). Appended AFTER constellation and given
    // .default(0) so the additive migrate backfills existing rows without a data
    // wipe — STDB refuses a non-defaulted or mid-table column on a populated table.
    transcendLevel: t.u32().default(0),
  }
);

// How many of a character's unlocked stars are currently ACTIVE (manual tuning).
// A SEPARATE table (not a column on owned_character) so it can be added to a live
// DB with no migration/wipe. No row for a character = "use the full constellation"
// (so existing players are unaffected until they dial it themselves).
const characterActivation = table(
  {
    name: 'character_activation',
    public: true,
    indexes: [{ accessor: 'by_owner_character', algorithm: 'btree', columns: ['owner', 'characterId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity().index('btree'),
    characterId: t.string(),
    activatedConstellation: t.u32(),
  }
);

const skillCast = table(
  { name: 'skill_cast', public: true, event: true },
  {
    caster: t.identity(),
    characterId: t.string(),
    skillId: t.string(),
    originX: t.f32(),
    originZ: t.f32(),
    directionX: t.f32(),
    directionZ: t.f32(),
  }
);

// Per-player, per-banner pity state.
const bannerPity = table(
  {
    name: 'banner_pity',
    public: true,
    indexes: [{ accessor: 'by_owner_banner', algorithm: 'btree', columns: ['owner', 'bannerId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity(),
    bannerId: t.string(),
    pullsSinceFiveStar: t.u32(),
    pullsSinceFourStar: t.u32(),
    guaranteedFeatured: t.bool(),
    totalPulls: t.u32(),
  }
);

// Weapon inventory — one row per (owner, weapon) STACK; count = copies pulled.
// Was one row per pull, which grew unbounded (3,711 rows) and became the client's
// frame-cost bomb (see CLAUDE.md Client Performance Rules). No combat use yet.
const weaponItem = table(
  {
    name: 'weapon_item',
    public: true,
    indexes: [{ accessor: 'by_owner_weapon', algorithm: 'btree', columns: ['owner', 'weaponId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity().index('btree'),
    weaponId: t.string(),
    rarity: t.u32(),
    acquiredAt: t.timestamp(), // when the FIRST copy arrived
    // NEW columns append at the END (additive migrate rejects reordering).
    // .default(1) backfills pre-stack rows; the one-shot consolidateWeaponItems
    // reducer then merges duplicates into real counts.
    count: t.u32().default(1),
  }
);

// Broadcasts each pull's outcome so the client can animate the result screen.
const pullResult = table(
  { name: 'pull_result', public: true, event: true },
  {
    owner: t.identity(),
    bannerId: t.string(),
    slot: t.u32(),
    kind: t.string(), // 'character' | 'weapon'
    itemId: t.string(),
    rarity: t.u32(),
    isNew: t.bool(),
    isFeatured: t.bool(),
    constellation: t.u32(), // character constellation after this pull (0 for weapons)
    shardMinted: t.u32(), // shards minted by THIS pull (C6-overflow dupe); 0 otherwise
  }
);

// Broadcasts a PVP hit so every client can float a truthful number: victim
// purple, attacker crit upgrade, spectators (CRIT-07). Carries the FULL
// computed amount (D3-02) — HP application caps separately.
const pvpHit = table(
  { name: 'pvp_hit', public: true, event: true },
  {
    target: t.identity(),
    amount: t.u32(),
    attacker: t.identity().default(Identity.zero()),
    isCrit: t.bool().default(false),
  }
);

// Broadcasts a ranged shot so every OTHER client can render the flying
// projectile (the shooter draws its own locally). Fires for every valid shot —
// including a pure-PvP shot that reaches no enemy — so a victim actually sees
// what is being fired at them, not just the damage number.
const rangedAttack = table(
  { name: 'ranged_attack', public: true, event: true },
  {
    attacker: t.identity(),
    characterId: t.string(),
    originX: t.f32(),
    originZ: t.f32(),
    directionX: t.f32(),
    directionZ: t.f32(),
  }
);

// Broadcasts one landed enemy/goliath hit with the SERVER-authoritative amount +
// crit bit (CRIT-05). Event-only: rows are never stored, one insert per surviving
// hit so the attacker's client can float the authoritative number in Plan 03.
const enemyHit = table(
  { name: 'enemy_hit', public: true, event: true },
  {
    attacker: t.identity(),
    positionX: t.f32(),
    positionZ: t.f32(),
    amount: t.u32(),
    isCrit: t.bool(),
  }
);

// Broadcasts one landed unit attack strike (ANIM-04 producer). Event-only: rows
// are never stored, ONE insert per strike — not per victim (victims learn their
// fate via their own player row) — emitted unconditionally at the strike
// transition, before any victim branching.
const attackStrike = table(
  { name: 'attack_strike', public: true, event: true },
  {
    unitKind: t.u32(),
    unitId: t.u64(),
    attackId: t.string(),
    landingX: t.f32(),
    landingZ: t.f32(),
    radius: t.f32(),
  }
);

// Broadcasts a heal so the healer's client can float green numbers (self + party).
const healEvent = table(
  { name: 'heal_event', public: true, event: true },
  {
    owner: t.identity(),
    characterId: t.string(),
    amount: t.u32(),
  }
);

const regenTimer = table(
  {
    name: 'regen_timer',
    scheduled: (): any => regenTick,
  },
  {
    scheduled_id: t.u64().primaryKey().autoInc(),
    scheduled_at: t.scheduleAt(),
  }
);

const worldTimer = table(
  {
    name: 'world_timer',
    scheduled: (): any => worldTick,
  },
  {
    scheduled_id: t.u64().primaryKey().autoInc(),
    scheduled_at: t.scheduleAt(),
  }
);

// Credential store — PRIVATE (no `public: true`), readable only by reducers and
// the DB owner. Passwords never live here: only a hash of a client-derived key,
// salted per-account and peppered server-side (see serverHash). usernameLower /
// email are unique so registration collisions roll the transaction back.
const account = table(
  { name: 'account' },
  {
    accountId: t.u64().primaryKey().autoInc(),
    username: t.string(), // original-case display name
    usernameLower: t.string().unique(),
    email: t.string().unique(),
    passwordHash: t.string(),
    salt: t.string(),
    // The identity that registered the account keys ALL of its gameplay rows
    // (player, owned_character, weapon_item, banner_pity). Other devices resolve
    // to this via account_link, so one account works across devices.
    canonicalIdentity: t.identity(),
    createdAt: t.timestamp(),
  }
);

// PUBLIC map of a device identity (ctx.sender) → the account's canonical identity.
// Holds no secrets. Each client subscribes to ONLY its own row (filtered by its
// device identity) to learn its canonical identity, then finds its player row.
const accountLink = table(
  { name: 'account_link', public: true },
  {
    identity: t.identity().primaryKey(),
    accountId: t.u64(),
    canonicalIdentity: t.identity(),
    username: t.string(),
  }
);

// ---- Multiplayer party (raid squad) -----------------------------------------
// Server-authoritative grouping (D-01..D-08). Invite-only entry: a party_member
// row is ONLY ever inserted from a matching pending party_invite the recipient
// accepts — there is deliberately NO joinParty(rawId) reducer.
const party = table(
  { name: 'party', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    leaderIdentity: t.identity(),
    createdAt: t.timestamp(),
  }
);

// One membership row per player. identity is UNIQUE — the atomic one-party-per-
// player backstop (D-06): concurrent accepts can't double-insert the same player.
const partyMember = table(
  { name: 'party_member', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    partyId: t.u64().index('btree'),
    identity: t.identity().unique(),
    joinedAt: t.timestamp(),
  }
);

// A pending join negotiation. joinerIdentity = who gets ADDED on accept
// (invite→target, request→me); recipientIdentity = who must ACCEPT (always the
// target). kind ∈ {'invite','request'} is DISPLAY COPY ONLY — accept/decline authz
// must never branch on it, keeping the recipient guard symmetric across both paths.
const partyInvite = table(
  { name: 'party_invite', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    partyId: t.u64().index('btree'),
    joinerIdentity: t.identity().index('btree'),
    recipientIdentity: t.identity().index('btree'),
    kind: t.string(),
    createdAt: t.timestamp(),
  }
);

// DEV/TEST: a player marked here is a server-driven "puppet" (training dummy) —
// the world tick steers it toward the nearest real player like an enemy, and
// updatePosition ignores its client so the server owns its movement. Local only.
const puppet = table(
  { name: 'puppet', public: true },
  { identity: t.identity().primaryKey() }
);

const spacetimedb = schema({
  account,
  accountLink,
  player,
  gemDrop,
  shardDrop,
  enemy,
  goliath,
  unitAttack,
  ownedCharacter,
  characterActivation,
  skillCast,
  bannerPity,
  weaponItem,
  pullResult,
  pvpHit,
  rangedAttack,
  enemyHit,
  attackStrike,
  healEvent,
  regenTimer,
  worldTimer,
  party,
  partyMember,
  partyInvite,
  puppet,
});
export default spacetimedb;

// ---- Accounts / auth --------------------------------------------------------
// Server pepper: a constant secret folded into every stored hash so a table-dump
// leak alone (account.passwordHash + salt) can't be replayed without the module
// source. Not secret from the DB owner — that's expected.
const AUTH_PEPPER = 'super-elements:v1:pepper:6d1f9a4c2e7b';
const USERNAME_MIN = 3;
const USERNAME_MAX = 16;

// Second-stage hash of the client-derived key (see src/auth/hash.ts). The raw
// password never reaches the server; this re-hashes the derived key with the
// account's random salt + pepper so the stored value differs from what the
// client sends over the wire.
function serverHash(derivedKey: string, salt: string): string {
  return sha256Hex(`${derivedKey}:${salt}:${AUTH_PEPPER}`);
}

// Username: 3–16 chars, lowercase letters / digits / underscore only.
function normalizeUsername(raw: string): string {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  if (lower.length < USERNAME_MIN) throw new SenderError(`Username must be at least ${USERNAME_MIN} characters`);
  if (lower.length > USERNAME_MAX) throw new SenderError(`Username too long (max ${USERNAME_MAX})`);
  for (const ch of lower) {
    const ok = (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch === '_';
    if (!ok) throw new SenderError('Username: letters, numbers and underscore only');
  }
  return trimmed;
}

function normalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  const at = email.indexOf('@');
  const dot = email.lastIndexOf('.');
  if (at <= 0 || dot < at + 2 || dot >= email.length - 1 || email.includes(' ')) {
    throw new SenderError('Invalid email address');
  }
  return email;
}

// Device identity (ctx.sender) → this account's canonical identity, or null if
// the device is not logged in. All ownership resolves through here.
function accountIdentity(ctx: { db: any; sender: any }): any | null {
  const link = ctx.db.accountLink.identity.find(ctx.sender);
  return link ? link.canonicalIdentity : null;
}

// Single active session per account: this device (keepIdentity) becomes the sole
// device linked to the account, deleting every OTHER device's account_link row.
// Those evicted clients see their own link row vanish (they each subscribe to
// only it) and drop back to the login screen with a "logged in elsewhere" notice.
// This is the root-cause fix for the same account being driven from two devices
// at once (which also made the shared online flag flap). No accountId index, but
// account_link is tiny, so a full scan is fine.
function claimSession(ctx: { db: any }, accountId: bigint, keepIdentity: any) {
  for (const link of [...ctx.db.accountLink.iter()]) {
    if (link.accountId === accountId && !link.identity.equals(keepIdentity)) {
      ctx.db.accountLink.identity.delete(link.identity);
    }
  }
}

// Seeds a fresh player + starter character under the given (canonical) identity.
// If a player row already exists for this identity (e.g. it played anonymously
// before accounts existed), ADOPT it: keep its progress, just rename to the
// account's username and mark it online. Avoids a PK collision on player.identity.
function seedPlayer(ctx: { db: any; timestamp: any }, identity: any, name: string) {
  const existing = ctx.db.player.identity.find(identity);
  if (existing) {
    ctx.db.player.identity.update({ ...existing, name, online: true });
    return;
  }
  ctx.db.player.insert({
    identity,
    name,
    online: true,
    positionX: SPAWN_X,
    positionY: 0,
    positionZ: SPAWN_Z,
    rotationY: 0,
    activeCharacterId: STARTER_CHARACTER_ID,
    partyOrder: [STARTER_CHARACTER_ID],
    gems: STARTING_GEMS,
    currentHealth: statsFor(STARTER_CHARACTER_ID).maxHealth,
    lastKillRewardAt: ctx.timestamp,
    gemsFromKills: 0,
    gemsCollected: 0,
    transcendShards: 0,
    skillReadyAtMicros: 0n,
    skillWindowEndsAtMicros: 0n,
    stunnedUntilMicros: 0n,
  });
  ctx.db.ownedCharacter.insert({
    id: 0n,
    owner: identity,
    characterId: STARTER_CHARACTER_ID,
    currentHealth: statsFor(STARTER_CHARACTER_ID).maxHealth,
    constellation: 0,
  });
}

function requirePlayer(ctx: { db: any; sender: any }) {
  const canonical = accountIdentity(ctx);
  if (!canonical) throw new SenderError('Log in first');
  const existingPlayer = ctx.db.player.identity.find(canonical);
  if (!existingPlayer) throw new SenderError('Log in first');
  return existingPlayer;
}

function ownsCharacter(ctx: { db: any }, owner: any, characterId: string) {
  const owned = [...ctx.db.ownedCharacter.owner.filter(owner)];
  return owned.some(row => row.characterId === characterId);
}

function findOwnedRow(ctx: { db: any }, targetPlayer: any, characterId: string) {
  return [...ctx.db.ownedCharacter.owner.filter(targetPlayer.identity)].find(
    (row: any) => row.characterId === characterId
  );
}

// The player row mirrors the ACTIVE character's live HP (for combat/HUD); the
// owned_character row is the persistent store. Keep both in step.
function setActiveHealth(ctx: { db: any }, targetPlayer: any, health: number) {
  ctx.db.player.identity.update({ ...targetPlayer, currentHealth: health });
  const activeOwned = findOwnedRow(ctx, targetPlayer, targetPlayer.activeCharacterId);
  if (activeOwned) ctx.db.ownedCharacter.id.update({ ...activeOwned, currentHealth: health });
}

function healAmountFor(stats: CharacterStat, targetMaxHealth: number, comboCount: number) {
  switch (stats.healMode) {
    case 'percent':
      return Math.round(targetMaxHealth * stats.healPower);
    case 'combo':
      return stats.healPower * Math.min(comboCount, MAX_COMBO_FOR_HEAL);
    default:
      return stats.healPower;
  }
}

function respawnPlayerAtSpawn(ctx: { db: any }, targetPlayer: any) {
  ctx.db.player.identity.update({
    ...targetPlayer,
    currentHealth: statsFor(targetPlayer.activeCharacterId).maxHealth,
    positionX: SPAWN_X,
    positionY: 0,
    positionZ: SPAWN_Z,
  });
  const activeOwned = findOwnedRow(ctx, targetPlayer, targetPlayer.activeCharacterId);
  if (activeOwned) {
    ctx.db.ownedCharacter.id.update({
      ...activeOwned,
      currentHealth: statsFor(targetPlayer.activeCharacterId).maxHealth,
    });
  }
}

// Breaks a total into a scattered shower of small denominated gem drops (largest
// first) so a kill rains lots of pickups. Positions are jittered deterministically
// via ctx.random. Caps the number of physical drops; any overflow folds into the
// biggest piece so no gems ever vanish.
function spillDenominations(
  ctx: { db: any; random: any; timestamp: any },
  centerX: number,
  centerZ: number,
  total: number,
  droppedBy: any
) {
  if (total <= 0) return;
  const pieces: number[] = [];
  let remaining = total;
  for (const denom of GEM_DENOMINATIONS) {
    while (remaining >= denom && pieces.length < MAX_SPILL_GEMS) {
      pieces.push(denom);
      remaining -= denom;
    }
    if (pieces.length >= MAX_SPILL_GEMS) break;
  }
  // Leftover only survives if the piece cap was hit — fold it into the biggest
  // (first) piece rather than dropping it. If total < 1 we never get here.
  if (remaining > 0) {
    if (pieces.length > 0) pieces[0] += remaining;
    else pieces.push(remaining);
  }
  for (const amount of pieces) {
    const angle = ctx.random() * Math.PI * 2;
    const radius = ctx.random() * GEM_SPILL_SCATTER;
    ctx.db.gemDrop.insert({
      id: 0n,
      positionX: clampToWorld(centerX + Math.cos(angle) * radius),
      positionZ: clampToWorld(centerZ + Math.sin(angle) * radius),
      amount,
      droppedBy,
      droppedAtMicros: ctx.timestamp.microsSinceUnixEpoch,
    });
  }
}

// Spills a fraction of a victim's gems onto the ground at their location as
// a shower of small gems. Returns how much was dropped (caller deducts it).
function spillGems(
  ctx: { db: any; random: any; timestamp: any },
  victim: any,
  fraction: number,
  droppedBy: any
) {
  const amount = Math.floor(victim.gems * fraction);
  if (amount <= 0) return 0;
  spillDenominations(ctx, victim.positionX, victim.positionZ, amount, droppedBy);
  return amount;
}

// Drops a SINGLE transcendence shard on the ground at a PVE death spot. Unlike
// spillDenominations this never denominates — a shard is a count-1 piece — but it
// reuses the same deterministic scatter (GEM_SPILL_SCATTER + clampToWorld) and the
// same droppedAtMicros grace stamp so collectShard can reuse gemIsCollectible.
function spillShards(
  ctx: { db: any; random: any; timestamp: any },
  positionX: number,
  positionZ: number,
  amount: number,
  droppedBy: any
) {
  if (amount <= 0) return;
  const angle = ctx.random() * Math.PI * 2;
  const radius = ctx.random() * GEM_SPILL_SCATTER;
  ctx.db.shardDrop.insert({
    id: 0n,
    positionX: clampToWorld(positionX + Math.cos(angle) * radius),
    positionZ: clampToWorld(positionZ + Math.sin(angle) * radius),
    amount,
    droppedBy,
    droppedAtMicros: ctx.timestamp.microsSinceUnixEpoch,
  });
}

function distanceBetweenPlayers(playerA: any, playerB: any) {
  return Math.hypot(
    playerA.positionX - playerB.positionX,
    playerA.positionZ - playerB.positionZ
  );
}

// Creates a new account: validates + reserves username/email, stores the salted
// server hash of the client-derived key, links this device, and seeds the player.
// Each account gets its own freshly minted canonical identity (see below), so the
// same device can hold several independent accounts without sharing player data.
export const register = spacetimedb.reducer(
  { username: t.string(), email: t.string(), derivedKey: t.string() },
  (ctx, { username, email, derivedKey }) => {
    if (ctx.db.accountLink.identity.find(ctx.sender)) {
      throw new SenderError('This device is already logged in');
    }
    const displayName = normalizeUsername(username);
    const usernameLower = displayName.toLowerCase();
    const emailNorm = normalizeEmail(email);
    if (!derivedKey) throw new SenderError('Missing credentials');
    if (ctx.db.account.usernameLower.find(usernameLower)) throw new SenderError('Username already taken');
    if (ctx.db.account.email.find(emailNorm)) throw new SenderError('Email already registered');

    const salt = bytesToHex(ctx.random.fill(new Uint8Array(16)));
    // Mint a fresh, account-unique canonical identity (random 32 bytes) to key
    // this account's data — NOT the device identity. Otherwise a second account
    // registered on the same device (logout → register) would reuse the device
    // identity as its canonical and inherit the first account's player + inventory.
    const canonicalIdentity = Identity.fromString('0x' + bytesToHex(ctx.random.fill(new Uint8Array(32))));
    const acct = ctx.db.account.insert({
      accountId: 0n,
      username: displayName,
      usernameLower,
      email: emailNorm,
      passwordHash: serverHash(derivedKey, salt),
      salt,
      canonicalIdentity,
      createdAt: ctx.timestamp,
    });
    ctx.db.accountLink.insert({
      identity: ctx.sender,
      accountId: acct.accountId,
      canonicalIdentity,
      username: displayName,
    });
    seedPlayer(ctx, canonicalIdentity, displayName);
  }
);

// Logs this device into an existing account, linking its identity to the
// account's canonical identity so it reaches the same player data.
export const login = spacetimedb.reducer(
  { username: t.string(), derivedKey: t.string() },
  (ctx, { username, derivedKey }) => {
    const usernameLower = username.trim().toLowerCase();
    const acct = ctx.db.account.usernameLower.find(usernameLower);
    // Identical error for unknown user vs bad password to avoid enumeration.
    if (!acct || serverHash(derivedKey, acct.salt) !== acct.passwordHash) {
      throw new SenderError('Invalid username or password');
    }
    const existing = ctx.db.accountLink.identity.find(ctx.sender);
    if (existing && existing.accountId !== acct.accountId) {
      throw new SenderError('This device is already logged into another account');
    }
    if (!existing) {
      ctx.db.accountLink.insert({
        identity: ctx.sender,
        accountId: acct.accountId,
        canonicalIdentity: acct.canonicalIdentity,
        username: acct.username,
      });
    }
    // This device claims the account's single session, evicting any other device.
    claimSession(ctx, acct.accountId, ctx.sender);
    // Mark the account's player online (it may have been created on another device).
    const existingPlayer = ctx.db.player.identity.find(acct.canonicalIdentity);
    if (existingPlayer && !existingPlayer.online) {
      ctx.db.player.identity.update({ ...existingPlayer, online: true });
    }
  }
);

// Unlinks this device from its account (player data stays under the canonical
// identity). The client returns to the auth screen.
export const logout = spacetimedb.reducer(ctx => {
  const link = ctx.db.accountLink.identity.find(ctx.sender);
  if (!link) return;
  ctx.db.accountLink.identity.delete(ctx.sender);
  const existingPlayer = ctx.db.player.identity.find(link.canonicalIdentity);
  if (existingPlayer && existingPlayer.online) {
    ctx.db.player.identity.update({ ...existingPlayer, online: false });
  }
});

// No-op reducer. The client measures the round-trip time of this call (client →
// server → confirmation) to display network latency in the ping overlay.
export const ping = spacetimedb.reducer(() => {});

export const updatePosition = spacetimedb.reducer(
  { positionX: t.f32(), positionY: t.f32(), positionZ: t.f32(), rotationY: t.f32() },
  (ctx, { positionX, positionY, positionZ, rotationY }) => {
    const currentPlayer = requirePlayer(ctx);
    // A puppet (training dummy) is server-driven — ignore its client's position.
    if (ctx.db.puppet.identity.find(currentPlayer.identity)) return;
    // A slam victim is server-owned for the stun window (HIT-01/T-04-03): reject
    // client positions until it ends so a modified client cannot wiggle out.
    if (ctx.timestamp.microsSinceUnixEpoch < currentPlayer.stunnedUntilMicros) return;
    const stepX = positionX - currentPlayer.positionX;
    const stepZ = positionZ - currentPlayer.positionZ;
    const stepDistance = Math.hypot(stepX, stepZ);
    // Anti-teleport: clamp each update toward the target at a sane max step.
    const stepScale = stepDistance > MAX_STEP_DISTANCE ? MAX_STEP_DISTANCE / stepDistance : 1;
    ctx.db.player.identity.update({
      ...currentPlayer,
      // Self-heal online: if a reload's onDisconnect landed after the new
      // onConnect (order isn't guaranteed) the flag can stick false; an active
      // player writing positions flips it back within ~100ms. Same row write.
      online: true,
      positionX: clampToWorld(currentPlayer.positionX + stepX * stepScale),
      // Negative Y allowed (falls off island edges are real), but per-update
      // steps are clamped so a client cannot teleport straight to the void.
      positionY: Math.max(
        currentPlayer.positionY - MAX_VERTICAL_STEP,
        Math.min(currentPlayer.positionY + MAX_VERTICAL_STEP, Math.max(-60, Math.min(20, positionY)))
      ),
      positionZ: clampToWorld(currentPlayer.positionZ + stepZ * stepScale),
      rotationY,
    });
  }
);

export const attackPlayer = spacetimedb.reducer(
  { targetIdentity: t.identity(), isSkill: t.bool(), comboCount: t.u32() },
  (ctx, { targetIdentity, isSkill, comboCount }) => {
    const attacker = requirePlayer(ctx);
    const target = ctx.db.player.identity.find(targetIdentity);
    if (!target) throw new SenderError('Target not found');
    if (target.identity.equals(attacker.identity)) throw new SenderError('Cannot attack yourself');
    // No friendly fire: party members in the same Bars cannot damage each other.
    const attackerMember = ctx.db.partyMember.identity.find(attacker.identity);
    const targetMember = ctx.db.partyMember.identity.find(target.identity);
    if (attackerMember && targetMember && attackerMember.partyId === targetMember.partyId) {
      return; // same party → attack passes through harmlessly
    }
    if (isInsideSafeZone(attacker.positionX, attacker.positionZ)) {
      throw new SenderError('No PVP inside the safe zone');
    }
    if (isInsideSafeZone(target.positionX, target.positionZ)) {
      throw new SenderError('Target is inside the safe zone');
    }
    if (distanceBetweenPlayers(attacker, target) > MAX_HIT_RANGE) {
      throw new SenderError('Target out of range');
    }

    // Server owns the number (CRIT-07): intent in, resolvePlayerHit composes
    // base → × crit (ctx.random) → clamp. No resistance profile for PVP (D3-03).
    const combo = Math.min(comboCount, MAX_COMBO_FOR_GEMS);
    const { amount, isCrit } = resolvePlayerHit(ctx, attacker, isSkill, combo, 'melee');
    // D3-02: FULL computed amount, PRE-branch — killing blows float full strength.
    ctx.db.pvpHit.insert({ target: targetIdentity, attacker: attacker.identity, amount, isCrit });
    const dealt = Math.min(amount, target.currentHealth);

    const remainingHealth = target.currentHealth - dealt;
    if (remainingHealth > 0) {
      setActiveHealth(ctx, target, remainingHealth);
      return;
    }
    // Kill: a third of the loser's gems spill onto the ground. The winner
    // earns credit but must collect it (as can anyone).
    const stolen = spillGems(ctx, target, PVP_DEATH_SPILL, attacker.identity);
    // Shard penalty on the VICTIM: a PVP death transfers the carried shard straight to
    // the killer (NO ground drop). The Plan 01 helper yields the victim's next* state and
    // result.shardsLost (0 when the victim eroded a level instead of dropping a shard).
    const targetOwned = findOwnedRow(ctx, target, target.activeCharacterId);
    const result = applyDeathShardPenalty(
      target.transcendShards,
      targetOwned ? targetOwned.transcendLevel : 0,
      targetOwned ? targetOwned.constellation : 0,
      SHARD_DEATH_LOSS
    );
    if (targetOwned && (result.erodedTranscend || result.erodedConstellation)) {
      ctx.db.ownedCharacter.id.update({
        ...targetOwned,
        transcendLevel: result.nextTranscendLevel,
        constellation: result.nextConstellation,
      });
    }
    // Credit the killer BOTH the gem spill (gemsFromKills) AND the stolen shard
    // (transcendShards). CRITICAL [A1]: the shard credit MUST NOT be gated by `stolen > 0`
    // alone — a victim carrying a shard but 0 gems yields stolen===0, and nesting the
    // shard credit inside that block would DROP it while the victim is already decremented,
    // DESTROYING the shard (breaks shard conservation). Both credits are no-op adds when
    // their amount is 0, so a single update gated on EITHER amount conserves both. The
    // shard credit is exactly result.shardsLost (0 on a 0-shard victim), never a fixed 1.
    if (stolen > 0 || result.shardsLost > 0) {
      ctx.db.player.identity.update({
        ...attacker,
        gemsFromKills: attacker.gemsFromKills + stolen,
        transcendShards: attacker.transcendShards + result.shardsLost,
      });
    }
    respawnPlayerAtSpawn(ctx, {
      ...target,
      gems: target.gems - stolen,
      transcendShards: result.nextShards,
    });
  }
);

export const setActiveCharacter = spacetimedb.reducer(
  { characterId: t.string() },
  (ctx, { characterId }) => {
    const currentPlayer = requirePlayer(ctx);
    // A stunned player is server-owned for the whole stun window (HIT-01, same
    // gate as updatePosition): switching is a combat action — swapping to a
    // fresh body/HP pool mid-stun would sidestep the swing tag's escape race
    // (D5-12). Silent return; the client UI gates the same window for feel.
    if (ctx.timestamp.microsSinceUnixEpoch < currentPlayer.stunnedUntilMicros) return;
    if (characterId === currentPlayer.activeCharacterId) return;
    const nextOwned = findOwnedRow(ctx, currentPlayer, characterId);
    if (!nextOwned) throw new SenderError('Character not owned');

    // Persist the outgoing character's live HP, then bring in the incoming
    // character at whatever HP it was last left with (each keeps its own pool).
    const outgoing = findOwnedRow(ctx, currentPlayer, currentPlayer.activeCharacterId);
    if (outgoing) {
      ctx.db.ownedCharacter.id.update({ ...outgoing, currentHealth: currentPlayer.currentHealth });
    }
    ctx.db.player.identity.update({
      ...currentPlayer,
      activeCharacterId: characterId,
      currentHealth: nextOwned.currentHealth,
    });
  }
);

// Manually set how many unlocked stars are active for a character (0..unlocked).
// Combat scaling reads activatedConstellation, so this tunes the character's power
// within the ceiling the player has earned from duplicate pulls.
export const setConstellation = spacetimedb.reducer(
  { characterId: t.string(), level: t.u32() },
  (ctx, { characterId, level }) => {
    const currentPlayer = requirePlayer(ctx);
    const owned = findOwnedRow(ctx, currentPlayer, characterId);
    if (!owned) throw new SenderError('Character not owned');
    setActivation(ctx, currentPlayer.identity, characterId, Math.min(level, owned.constellation));
  }
);

// Installs one transcendence level on a C6 character, spending transcendShards.
// This reducer is the SOLE enforcement point for the currency (client gating is UX
// only): ownership, the C6 gate, the level cap, and the shard cost are all derived
// server-side from ctx.sender + stored rows + constants — the caller supplies ONLY a
// characterId. The pure resolveTranscendInstall (plan 01) is the decision authority;
// every reject path throws before any mutation, and the deduct happens only on ok
// (so a u32 balance can never underflow — T-02-03).
export const transcendCharacter = spacetimedb.reducer(
  { characterId: t.string() },
  (ctx, { characterId }) => {
    const currentPlayer = requirePlayer(ctx);
    const owned = findOwnedRow(ctx, currentPlayer, characterId);
    if (!owned) throw new SenderError('Character not owned');

    const result = resolveTranscendInstall(
      owned.constellation,
      MAX_CONSTELLATION,
      owned.transcendLevel,
      MAX_TRANSCEND_LEVEL,
      currentPlayer.transcendShards,
      TRANSCEND_SHARD_COST
    );
    if (!result.ok) {
      if (result.reason === 'below_c6') throw new SenderError('Requires C6');
      if (result.reason === 'at_cap') throw new SenderError('At transcend cap');
      throw new SenderError('Not enough shards');
    }

    ctx.db.player.identity.update({
      ...currentPlayer,
      transcendShards: currentPlayer.transcendShards - result.shardCost,
    });
    ctx.db.ownedCharacter.id.update({ ...owned, transcendLevel: result.nextLevel });
  }
);

// ---- Multiplayer party reducers ---------------------------------------------
// Invite-only entry (D-01): a party_member row is only ever inserted from a
// matching pending party_invite the recipient accepts. Every reducer resolves the
// ACTOR via requirePlayer(ctx); targetIdentity is a lookup target only, never
// trusted as the caller (T-05-01 Spoofing, CLAUDE.md rule 5).

// D-02 invite branch: ensure MY party (me = leader), then leave a pending invite
// the target must accept.
export const invitePlayer = spacetimedb.reducer(
  { targetIdentity: t.identity() },
  (ctx, { targetIdentity }) => {
    const me = requirePlayer(ctx);
    if (me.identity.equals(targetIdentity)) throw new SenderError('Nevar aicināt sevi');
    const target = ctx.db.player.identity.find(targetIdentity);
    if (!target) throw new SenderError('Spēlētājs nav atrasts');

    // Ensure my party exists with me as leader.
    const mine = ctx.db.partyMember.identity.find(me.identity);
    let partyId: bigint;
    if (mine) {
      partyId = mine.partyId;
    } else {
      const p = ctx.db.party.insert({ id: 0n, leaderIdentity: me.identity, createdAt: ctx.timestamp });
      partyId = p.id;
      ctx.db.partyMember.insert({ id: 0n, partyId, identity: me.identity, joinedAt: ctx.timestamp });
    }

    // A target already in MY party is a no-op; a target in ANOTHER party is allowed
    // now — the recipient decides how to resolve it (merge if they lead, or
    // poach/forward if they're a member). Cap is re-checked at accept time.
    const targetMem = ctx.db.partyMember.identity.find(targetIdentity);
    if (targetMem && targetMem.partyId === partyId)
      throw new SenderError(`${target.name} jau ir tavā barā`);

    const roster = [...ctx.db.partyMember.partyId.filter(partyId)];
    if (roster.length >= RAID_PARTY_SIZE) throw new SenderError('Bars ir pilns (4/4)');

    // Dedupe: don't stack a second pending invite for this joiner in this party (T-05-06).
    const dupe = [...ctx.db.partyInvite.partyId.filter(partyId)]
      .some(inv => inv.joinerIdentity.equals(targetIdentity));
    if (dupe) return;

    ctx.db.partyInvite.insert({
      id: 0n,
      partyId,
      joinerIdentity: targetIdentity,
      recipientIdentity: targetIdentity,
      kind: 'invite',
      createdAt: ctx.timestamp,
    });
  }
);

// D-02 ask-to-join branch (the mirror of invitePlayer): ensure the TARGET's party
// (target = leader), then leave a pending request the target must accept.
export const requestJoin = spacetimedb.reducer(
  { targetIdentity: t.identity() },
  (ctx, { targetIdentity }) => {
    const me = requirePlayer(ctx);
    if (me.identity.equals(targetIdentity)) throw new SenderError('Nevar aicināt sevi');
    const target = ctx.db.player.identity.find(targetIdentity);
    if (!target) throw new SenderError('Spēlētājs nav atrasts');
    if (ctx.db.partyMember.identity.find(me.identity))
      throw new SenderError('jau esi citā barā');

    // Ensure the target's party exists with the target as leader.
    const theirs = ctx.db.partyMember.identity.find(targetIdentity);
    let partyId: bigint;
    if (theirs) {
      partyId = theirs.partyId;
    } else {
      const p = ctx.db.party.insert({ id: 0n, leaderIdentity: targetIdentity, createdAt: ctx.timestamp });
      partyId = p.id;
      ctx.db.partyMember.insert({ id: 0n, partyId, identity: targetIdentity, joinedAt: ctx.timestamp });
    }

    const roster = [...ctx.db.partyMember.partyId.filter(partyId)];
    if (roster.length >= RAID_PARTY_SIZE) throw new SenderError('Bars ir pilns (4/4)');

    // Dedupe: don't stack a second pending request from me into this party (T-05-06).
    const dupe = [...ctx.db.partyInvite.partyId.filter(partyId)]
      .some(inv => inv.joinerIdentity.equals(me.identity));
    if (dupe) return;

    ctx.db.partyInvite.insert({
      id: 0n,
      partyId,
      joinerIdentity: me.identity,
      recipientIdentity: targetIdentity,
      kind: 'request',
      createdAt: ctx.timestamp,
    });
  }
);

// Accept a pending invite/request (D-03, D-06). Only the recipient may accept, and
// the same guard covers both kinds — authz never branches on inv.kind (T-05-02).
export const acceptInvite = spacetimedb.reducer(
  { inviteId: t.u64() },
  (ctx, { inviteId }) => {
    const me = requirePlayer(ctx);
    const inv = ctx.db.partyInvite.id.find(inviteId);
    if (!inv) throw new SenderError('Aicinājums vairs nav spēkā');
    if (!inv.recipientIdentity.equals(me.identity)) throw new SenderError('unauthorized');
    // A join REQUEST may only be accepted by the party leader — a non-leader member
    // who holds one must forward it up (forwardRequest), never accept directly.
    if (inv.kind === 'request') {
      const party = ctx.db.party.id.find(inv.partyId);
      if (party && !party.leaderIdentity.equals(me.identity))
        throw new SenderError('Tikai vadonis var pieņemt pieprasījumu');
    }

    // Eligibility decided by Plan 01's pure helper (cap + no-double-join, T-05-04).
    const rosterSize = [...ctx.db.partyMember.partyId.filter(inv.partyId)].length;
    const joinerAlreadyPartied = !!ctx.db.partyMember.identity.find(inv.joinerIdentity);
    const decision = canAccept(rosterSize, joinerAlreadyPartied, RAID_PARTY_SIZE);
    if (!decision.ok) {
      if (decision.reason === 'already_partied') throw new SenderError('jau esi citā barā');
      throw new SenderError('bars ir pilns');
    }

    // Add the joiner. party_member.identity.unique() is the atomic race backstop.
    ctx.db.partyMember.insert({
      id: 0n,
      partyId: inv.partyId,
      identity: inv.joinerIdentity,
      joinedAt: ctx.timestamp,
    });

    // State-based invalidation (D-08): the joiner now has a party, so drop every
    // OTHER pending invite that would add them elsewhere.
    for (const other of [...ctx.db.partyInvite.joinerIdentity.filter(inv.joinerIdentity)]) {
      if (other.id !== inv.id) ctx.db.partyInvite.id.delete(other.id);
    }
    // If the roster is now full, drop this party's remaining pending invites.
    const nowSize = [...ctx.db.partyMember.partyId.filter(inv.partyId)].length;
    if (nowSize >= RAID_PARTY_SIZE) {
      for (const stale of [...ctx.db.partyInvite.partyId.filter(inv.partyId)]) {
        if (stale.id !== inv.id) ctx.db.partyInvite.id.delete(stale.id);
      }
    }
    // Finally consume the accepted invite.
    ctx.db.partyInvite.id.delete(inv.id);
  }
);

// Forward a join REQUEST to the party leader (D-02 relay). A non-leader member who
// received an ask-to-join can pass it up: only the current recipient may forward,
// and only a 'request' (not an 'invite'). Re-points recipient to the leader, who
// then accepts/declines through the normal toast. No membership change here.
export const forwardRequest = spacetimedb.reducer(
  { inviteId: t.u64() },
  (ctx, { inviteId }) => {
    const me = requirePlayer(ctx);
    const inv = ctx.db.partyInvite.id.find(inviteId);
    if (!inv) throw new SenderError('Aicinājums vairs nav spēkā');
    if (!inv.recipientIdentity.equals(me.identity)) throw new SenderError('unauthorized');
    if (inv.kind !== 'request') throw new SenderError('Tikai pieprasījumu var nodot');
    const party = ctx.db.party.id.find(inv.partyId);
    if (!party) throw new SenderError('Bars vairs nav spēkā');
    if (party.leaderIdentity.equals(me.identity)) return; // I'm the leader — nothing to relay
    ctx.db.partyInvite.id.update({ ...inv, recipientIdentity: party.leaderIdentity });
  }
);

// Decline a pending invite/request: same recipient-only guard, no membership change.
export const declineInvite = spacetimedb.reducer(
  { inviteId: t.u64() },
  (ctx, { inviteId }) => {
    const me = requirePlayer(ctx);
    const inv = ctx.db.partyInvite.id.find(inviteId);
    if (!inv) throw new SenderError('Aicinājums vairs nav spēkā');
    if (!inv.recipientIdentity.equals(me.identity)) throw new SenderError('unauthorized');
    ctx.db.partyInvite.id.delete(inv.id);
  }
);

// Accept an invite by MERGING my whole party into the inviter's (D-02 extension).
// Only a leader merges: every member of my party moves into the inviter's party,
// the inviter stays leader, and my old party row + invites are dissolved. Rejected
// if the combined roster would exceed the 4/4 cap.
export const acceptMerge = spacetimedb.reducer(
  { inviteId: t.u64() },
  (ctx, { inviteId }) => {
    const me = requirePlayer(ctx);
    const inv = ctx.db.partyInvite.id.find(inviteId);
    if (!inv) throw new SenderError('Aicinājums vairs nav spēkā');
    if (!inv.recipientIdentity.equals(me.identity)) throw new SenderError('unauthorized');
    if (inv.kind !== 'invite') throw new SenderError('Nav apvienojams');
    const myMem = ctx.db.partyMember.identity.find(me.identity);
    if (!myMem) throw new SenderError('Neesi barā — pieņem parasti');
    const myParty = ctx.db.party.id.find(myMem.partyId);
    if (!myParty || !myParty.leaderIdentity.equals(me.identity))
      throw new SenderError('Tikai vadonis var apvienot barus');
    const dest = ctx.db.party.id.find(inv.partyId);
    if (!dest) throw new SenderError('Bars vairs nav spēkā');
    if (myMem.partyId === inv.partyId) {
      ctx.db.partyInvite.id.delete(inv.id);
      return;
    }
    const myMembers = [...ctx.db.partyMember.partyId.filter(myMem.partyId)];
    const destSize = [...ctx.db.partyMember.partyId.filter(inv.partyId)].length;
    if (destSize + myMembers.length > RAID_PARTY_SIZE)
      throw new SenderError('Apvienotais bars pārsniedz 4/4');
    for (const m of myMembers) ctx.db.partyMember.id.update({ ...m, partyId: inv.partyId });
    for (const stale of [...ctx.db.partyInvite.partyId.filter(myMem.partyId)])
      ctx.db.partyInvite.id.delete(stale.id);
    ctx.db.party.id.delete(myMem.partyId);
    ctx.db.partyInvite.id.delete(inv.id);
  }
);

// Accept an invite by being POACHED: a non-leader member leaves their current party
// (which lives on for the others) and joins the inviter's party. Rejected if the
// inviter's party is full. A leader can't be poached — they merge instead.
export const acceptPoach = spacetimedb.reducer(
  { inviteId: t.u64() },
  (ctx, { inviteId }) => {
    const me = requirePlayer(ctx);
    const inv = ctx.db.partyInvite.id.find(inviteId);
    if (!inv) throw new SenderError('Aicinājums vairs nav spēkā');
    if (!inv.recipientIdentity.equals(me.identity)) throw new SenderError('unauthorized');
    if (inv.kind !== 'invite') throw new SenderError('Nav pārvelkams');
    const myMem = ctx.db.partyMember.identity.find(me.identity);
    if (!myMem) throw new SenderError('Neesi barā — pieņem parasti');
    const myParty = ctx.db.party.id.find(myMem.partyId);
    if (myParty && myParty.leaderIdentity.equals(me.identity))
      throw new SenderError('Vadoni nevar pārvilkt — apvieno barus');
    const dest = ctx.db.party.id.find(inv.partyId);
    if (!dest) throw new SenderError('Bars vairs nav spēkā');
    if ([...ctx.db.partyMember.partyId.filter(inv.partyId)].length >= RAID_PARTY_SIZE)
      throw new SenderError('Bars ir pilns (4/4)');
    ctx.db.partyMember.id.delete(myMem.id);
    ctx.db.partyMember.insert({ id: 0n, partyId: inv.partyId, identity: me.identity, joinedAt: ctx.timestamp });
    ctx.db.partyInvite.id.delete(inv.id);
  }
);

// A non-leader member who was invited elsewhere can FORWARD it as a counter-offer:
// instead of leaving, they ask their own leader to accept the inviter into THEIR
// party. Turns the invite into a 'request' (joiner = inviter, recipient = my leader).
export const forwardInviteToLeader = spacetimedb.reducer(
  { inviteId: t.u64() },
  (ctx, { inviteId }) => {
    const me = requirePlayer(ctx);
    const inv = ctx.db.partyInvite.id.find(inviteId);
    if (!inv) throw new SenderError('Aicinājums vairs nav spēkā');
    if (!inv.recipientIdentity.equals(me.identity)) throw new SenderError('unauthorized');
    if (inv.kind !== 'invite') throw new SenderError('Nav nododams');
    const myMem = ctx.db.partyMember.identity.find(me.identity);
    if (!myMem) throw new SenderError('Neesi barā');
    const myParty = ctx.db.party.id.find(myMem.partyId);
    if (!myParty) throw new SenderError('Bars vairs nav spēkā');
    if (myParty.leaderIdentity.equals(me.identity)) throw new SenderError('Esi vadonis — pieņem pats');
    const inviter = ctx.db.party.id.find(inv.partyId)?.leaderIdentity;
    if (!inviter) throw new SenderError('Bars vairs nav spēkā');
    const dupe = [...ctx.db.partyInvite.partyId.filter(myMem.partyId)].some(row =>
      row.joinerIdentity.equals(inviter)
    );
    if (!dupe)
      ctx.db.partyInvite.insert({
        id: 0n,
        partyId: myMem.partyId,
        joinerIdentity: inviter,
        recipientIdentity: myParty.leaderIdentity,
        kind: 'request',
        createdAt: ctx.timestamp,
      });
    ctx.db.partyInvite.id.delete(inv.id);
  }
);

// A member asks their leader to promote them to leader. Recorded as a 'promote'
// pending row (joiner = me, recipient = current leader) the leader accepts/declines.
export const requestPromotion = spacetimedb.reducer(ctx => {
  const me = requirePlayer(ctx);
  const myMem = ctx.db.partyMember.identity.find(me.identity);
  if (!myMem) throw new SenderError('Neesi nevienā barā');
  const party = ctx.db.party.id.find(myMem.partyId);
  if (!party) throw new SenderError('Bars vairs nav spēkā');
  if (party.leaderIdentity.equals(me.identity)) throw new SenderError('Jau esi vadonis');
  const dupe = [...ctx.db.partyInvite.partyId.filter(myMem.partyId)].some(
    row => row.kind === 'promote' && row.joinerIdentity.equals(me.identity)
  );
  if (dupe) return;
  ctx.db.partyInvite.insert({
    id: 0n,
    partyId: myMem.partyId,
    joinerIdentity: me.identity,
    recipientIdentity: party.leaderIdentity,
    kind: 'promote',
    createdAt: ctx.timestamp,
  });
});

// Leader accepts a promotion request: the crown moves to the requester. Only the
// current leader (the recipient) may accept, and only a 'promote' row.
export const acceptPromotion = spacetimedb.reducer(
  { inviteId: t.u64() },
  (ctx, { inviteId }) => {
    const me = requirePlayer(ctx);
    const inv = ctx.db.partyInvite.id.find(inviteId);
    if (!inv) throw new SenderError('Pieprasījums vairs nav spēkā');
    if (!inv.recipientIdentity.equals(me.identity)) throw new SenderError('unauthorized');
    if (inv.kind !== 'promote') throw new SenderError('Nav paaugstinājuma pieprasījums');
    const party = ctx.db.party.id.find(inv.partyId);
    if (party && party.leaderIdentity.equals(me.identity)) {
      const promoted = ctx.db.partyMember.identity.find(inv.joinerIdentity);
      if (promoted && promoted.partyId === inv.partyId)
        ctx.db.party.id.update({ ...party, leaderIdentity: inv.joinerIdentity });
    }
    ctx.db.partyInvite.id.delete(inv.id);
  }
);

// Leave my party (D-05). Last member out disbands the party + its invites (D-08);
// a leaving leader promotes the oldest-joined remaining member via nextLeader.
export const leaveParty = spacetimedb.reducer(ctx => {
  const me = requirePlayer(ctx);
  const mine = ctx.db.partyMember.identity.find(me.identity);
  if (!mine) throw new SenderError('Neesi nevienā barā');
  const partyId = mine.partyId;
  ctx.db.partyMember.id.delete(mine.id);

  const remaining = [...ctx.db.partyMember.partyId.filter(partyId)];
  if (remaining.length === 0) {
    // Disband: last member left.
    ctx.db.party.id.delete(partyId);
    for (const inv of [...ctx.db.partyInvite.partyId.filter(partyId)]) {
      ctx.db.partyInvite.id.delete(inv.id);
    }
    return;
  }

  const party = ctx.db.party.id.find(partyId);
  if (party && party.leaderIdentity.equals(me.identity)) {
    const leaderHex = nextLeader(
      remaining.map(m => ({
        identityHex: m.identity.toHexString(),
        joinedAtMicros: m.joinedAt.microsSinceUnixEpoch,
      }))
    );
    const promoted = remaining.find(m => m.identity.toHexString() === leaderHex);
    if (promoted) {
      ctx.db.party.id.update({ ...party, leaderIdentity: promoted.identity });
    }
  }
});

// Kick a member from my party (leader-only). The leader cannot kick themselves
// (they use leaveParty, which promotes the oldest-joined member). Removing a
// non-leader never triggers promotion or disband — the leader always remains, so
// the party stays alive. Authz keys off accountIdentity(ctx) via requirePlayer:
// targetIdentity is a lookup only, never a trusted actor.
export const kickMember = spacetimedb.reducer(
  { targetIdentity: t.identity() },
  (ctx, { targetIdentity }) => {
    const me = requirePlayer(ctx);
    const mine = ctx.db.partyMember.identity.find(me.identity);
    if (!mine) throw new SenderError('Neesi nevienā barā');
    const party = ctx.db.party.id.find(mine.partyId);
    if (!party) throw new SenderError('Bars vairs nav spēkā');
    if (!party.leaderIdentity.equals(me.identity))
      throw new SenderError('Tikai vadonis var izmest no bara');
    if (me.identity.equals(targetIdentity))
      throw new SenderError('Nevar izmest sevi — pamet baru');
    const target = ctx.db.partyMember.identity.find(targetIdentity);
    if (!target || target.partyId !== mine.partyId)
      throw new SenderError('Spēlētājs nav tavā barā');
    ctx.db.partyMember.id.delete(target.id);
    // Drop any pending invite naming the kicked player as joiner into this party,
    // so a stale request can't re-add them without a fresh invite.
    for (const inv of [...ctx.db.partyInvite.partyId.filter(mine.partyId)]) {
      if (inv.joinerIdentity.equals(targetIdentity)) ctx.db.partyInvite.id.delete(inv.id);
    }
  }
);

// Promote another member of my party to leader (leader-only). The crown moves; I
// stay in the party as a normal member. Target must be a current member (not me).
export const promoteLeader = spacetimedb.reducer(
  { targetIdentity: t.identity() },
  (ctx, { targetIdentity }) => {
    const me = requirePlayer(ctx);
    const mine = ctx.db.partyMember.identity.find(me.identity);
    if (!mine) throw new SenderError('Neesi nevienā barā');
    const party = ctx.db.party.id.find(mine.partyId);
    if (!party) throw new SenderError('Bars vairs nav spēkā');
    if (!party.leaderIdentity.equals(me.identity))
      throw new SenderError('Tikai vadonis var iecelt jaunu vadoni');
    if (me.identity.equals(targetIdentity)) return; // already leader
    const target = ctx.db.partyMember.identity.find(targetIdentity);
    if (!target || target.partyId !== mine.partyId)
      throw new SenderError('Spēlētājs nav tavā barā');
    ctx.db.party.id.update({ ...party, leaderIdentity: targetIdentity });
  }
);

// Disband my whole party (leader-only). Unlike leaveParty (which promotes the
// oldest-joined member), this dissolves the party entirely: every member is
// removed, all pending invites cleared, and the party row deleted. Authz keys off
// accountIdentity(ctx) via requirePlayer; only the current leader may disband.
export const disbandParty = spacetimedb.reducer(ctx => {
  const me = requirePlayer(ctx);
  const mine = ctx.db.partyMember.identity.find(me.identity);
  if (!mine) throw new SenderError('Neesi nevienā barā');
  const party = ctx.db.party.id.find(mine.partyId);
  if (!party) throw new SenderError('Bars vairs nav spēkā');
  if (!party.leaderIdentity.equals(me.identity))
    throw new SenderError('Tikai vadonis var izformēt baru');
  for (const m of [...ctx.db.partyMember.partyId.filter(mine.partyId)]) {
    ctx.db.partyMember.id.delete(m.id);
  }
  for (const inv of [...ctx.db.partyInvite.partyId.filter(mine.partyId)]) {
    ctx.db.partyInvite.id.delete(inv.id);
  }
  ctx.db.party.id.delete(mine.partyId);
});

// Sets the ordered party (membership + order). Keeps only owned, unique ids up
// to PARTY_SIZE, and makes sure the active character stays inside the party.
export const setParty = spacetimedb.reducer(
  { characterIds: t.array(t.string()) },
  (ctx, { characterIds }) => {
    const currentPlayer = requirePlayer(ctx);
    const cleaned: string[] = [];
    for (const characterId of characterIds) {
      if (cleaned.length >= PARTY_SIZE) break;
      if (cleaned.includes(characterId)) continue;
      if (!ownsCharacter(ctx, currentPlayer.identity, characterId)) continue;
      cleaned.push(characterId);
    }
    if (cleaned.length === 0) throw new SenderError('Party cannot be empty');
    const activeCharacterId = cleaned.includes(currentPlayer.activeCharacterId)
      ? currentPlayer.activeCharacterId
      : cleaned[0];
    ctx.db.player.identity.update({ ...currentPlayer, partyOrder: cleaned, activeCharacterId });
  }
);

export const castSkill = spacetimedb.reducer(
  {
    skillId: t.string(),
    originX: t.f32(),
    originZ: t.f32(),
    directionX: t.f32(),
    directionZ: t.f32(),
  },
  (ctx, { skillId, originX, originZ, directionX, directionZ }) => {
    const currentPlayer = requirePlayer(ctx);
    const now = ctx.timestamp.microsSinceUnixEpoch;
    // Authoritative skill rate-limit: reject a cast still on cooldown (emit NO
    // skill_cast). The cooldown is derived from server CHARACTER_COMBAT, never the
    // client-sent skillId (Pitfall 5), so a spoofed id can't shorten it.
    if (now < currentPlayer.skillReadyAtMicros) return;
    const cc = CHARACTER_COMBAT[currentPlayer.activeCharacterId];
    const cooldownSeconds = cc ? cc.skillCooldownSeconds : 0;
    // Open the skill-hit window and arm the next cooldown BEFORE the broadcast, so
    // an isSkill hit landing inside SKILL_HIT_WINDOW_MICROS earns the skill multiplier.
    ctx.db.player.identity.update({
      ...currentPlayer,
      skillReadyAtMicros: nextSkillReadyAt(now, cooldownSeconds),
      skillWindowEndsAtMicros: now + SKILL_HIT_WINDOW_MICROS,
    });
    ctx.db.skillCast.insert({
      caster: currentPlayer.identity,
      characterId: currentPlayer.activeCharacterId,
      skillId,
      originX,
      originZ,
      directionX,
      directionZ,
    });
  }
);

export const takeDamage = spacetimedb.reducer(
  { damage: t.u32() },
  (ctx, { damage }) => {
    const currentPlayer = requirePlayer(ctx);
    if (isInsideSafeZone(currentPlayer.positionX, currentPlayer.positionZ)) return;

    // Active character's resistances soften the incoming blow (enemy melee = contact).
    const resisted = resistedDamage(
      Math.min(damage, MAX_HIT_DAMAGE),
      PLAYER_RESISTANCES[currentPlayer.activeCharacterId],
      'contact'
    );
    const clampedDamage = Math.min(resisted, currentPlayer.currentHealth);
    const remainingHealth = currentPlayer.currentHealth - clampedDamage;
    if (remainingHealth > 0) {
      setActiveHealth(ctx, currentPlayer, remainingHealth);
      return;
    }
    // Died to an enemy: drop a quarter of your gems where you fell.
    const spilled = spillGems(ctx, currentPlayer, PVE_DEATH_SPILL, currentPlayer.identity);
    // Shard penalty (additive to the gem spill): a carried shard falls as a collectible
    // at the death spot; a shard-less death erodes the transcend layer, then one C-level.
    // The Plan 01 helper is the sole decision authority — no raw subtraction here.
    const activeOwned = findOwnedRow(ctx, currentPlayer, currentPlayer.activeCharacterId);
    const result = applyDeathShardPenalty(
      currentPlayer.transcendShards,
      activeOwned ? activeOwned.transcendLevel : 0,
      activeOwned ? activeOwned.constellation : 0,
      SHARD_DEATH_LOSS
    );
    if (result.shardsLost > 0) {
      spillShards(ctx, currentPlayer.positionX, currentPlayer.positionZ, result.shardsLost, currentPlayer.identity);
    }
    if (activeOwned && (result.erodedTranscend || result.erodedConstellation)) {
      ctx.db.ownedCharacter.id.update({
        ...activeOwned,
        transcendLevel: result.nextTranscendLevel,
        constellation: result.nextConstellation,
      });
    }
    respawnPlayerAtSpawn(ctx, {
      ...currentPlayer,
      gems: currentPlayer.gems - spilled,
      transcendShards: result.nextShards,
    });
  }
);

export const fallToDeath = spacetimedb.reducer(ctx => {
  const currentPlayer = requirePlayer(ctx);
  // A real void fall is deep below ground AND outside every island footprint.
  const isInTheVoid =
    currentPlayer.positionY < VOID_DEATH_DEPTH &&
    !isOverAnyIsland(currentPlayer.positionX, currentPlayer.positionZ);
  if (!isInTheVoid) throw new SenderError('Not falling into the void');
  // Fall toll: half your gems are wiped from the game (not spilled as loot).
  const wiped = Math.floor(currentPlayer.gems / 2);
  respawnPlayerAtSpawn(ctx, { ...currentPlayer, gems: currentPlayer.gems - wiped });
});

// Every enemy carries a virtual base gem stipend that is always present from
// spawn — never stored, computed here so both the player-kill and enemy-raid
// payouts agree. Regular enemies scale with reward tier (bosses ×BOSS_GEM_MULTIPLIER);
// goliath raiders use their size-indexed stipend. Mirrored client-side for display
// in src/game/data/goliathArchetypes.ts + enemyArchetypes.ts (serverSync.test.ts).
function enemyBaseGems(
  isGoliath: boolean,
  goliathSizeIndex: number,
  rewardTier: number,
  isBoss: boolean
) {
  if (isGoliath) {
    const lastIndex = GOLIATH_BASE_GEMS_BY_SIZE.length - 1;
    const clampedSizeIndex = Math.max(0, Math.min(lastIndex, goliathSizeIndex));
    return GOLIATH_BASE_GEMS_BY_SIZE[clampedSizeIndex];
  }
  const clampedTier = Math.max(1, Math.min(MAX_KILL_REWARD_TIER, rewardTier));
  return KILL_REWARD_GEMS * clampedTier * (isBoss ? BOSS_GEM_MULTIPLIER : 1);
}

// ---- Server-authoritative death + economy -----------------------------------

// Spills a dead entity's loot (base stipend + carried hoard) onto the ground and
// returns the total dropped. droppedBy credits a player kill (leaderboard) or is
// the module identity for a tick/goliath kill (an uncredited drop is fine).
function spillEnemyLoot(
  ctx: { db: any; random: any; timestamp: any },
  positionX: number,
  positionZ: number,
  baseGems: number,
  carriedGems: number,
  droppedBy: any
): number {
  const total = baseGems + Math.min(carriedGems, CARRY_HARD_CAP);
  spillDenominations(ctx, positionX, positionZ, total, droppedBy);
  return total;
}

// Marks a camp enemy dead: spill its loot, clear its hoard, revert aggro to home,
// and schedule a full-health respawn at its home.
function killEnemyRow(
  ctx: { db: any; random: any; sender: any; timestamp: any },
  enemyRow: any,
  baseGems: number,
  droppedBy: any,
  nowMicros: bigint
): number {
  const dropped = spillEnemyLoot(ctx, enemyRow.positionX, enemyRow.positionZ, baseGems, enemyRow.carriedGems, droppedBy);
  ctx.db.enemy.enemyId.update({
    ...enemyRow,
    alive: false,
    health: 0,
    carriedGems: 0,
    aggroKind: AGGRO_HOME,
    aggroPlayer: undefined,
    aggroGoliathId: 0n,
    aggroExpiresAtMicros: 0n,
    respawnAtMicros: nowMicros + ENEMY_RESPAWN_MICROS,
    // A dead slime is not mid-hop; the whole move state resets with the corpse.
    hopStartedAtMicros: 0n,
    hopDurationMicros: 0n,
    hopTargetX: 0,
    hopTargetZ: 0,
    patrolTargetX: 0,
    patrolTargetZ: 0,
    restUntilMicros: 0n,
  });
  return dropped;
}

// Marks a goliath dead: spill its loot and leave it dead for the rest of its
// window (its row lingers so it can't respawn until the window rolls over).
function killGoliathRow(
  ctx: { db: any; random: any; timestamp: any },
  goliathRow: any,
  droppedBy: any
): number {
  const base = enemyBaseGems(true, goliathRow.sizeIndex, 0, false);
  const dropped = spillEnemyLoot(ctx, goliathRow.positionX, goliathRow.positionZ, base, goliathRow.carriedGems, droppedBy);
  ctx.db.goliath.goliathId.update({
    ...goliathRow,
    alive: false,
    health: 0,
    carriedGems: 0,
    aggroPlayer: undefined,
    aggroExpiresAtMicros: 0n,
    targetCampIndex: -1,
  });
  return dropped;
}

// Server-authoritative resolution of ONE landed player hit into a final
// {amount, isCrit}. Composes the pure helpers: base via computeBaseDamage (weapon
// or skill ramp + constellation/transcend), the seeded crit roll (ctx.random —
// the sole client-untrusted decision, CRIT-02), and the target's resistance.
// Apply order is load-bearing: base → × crit → resist. No output cap — every
// input is server-derived, so the full computed value is the real hit.
// grantSkill gates the uncapped skill multiplier to the authoritative cast window.
function resolvePlayerHit(
  ctx: any,
  hitter: any,
  isSkill: boolean,
  combo: number,
  dmgType: DamageType,
  profile?: ResistanceProfile
): { amount: number; isCrit: boolean } {
  const cc = CHARACTER_COMBAT[hitter.activeCharacterId];
  if (!cc) return { amount: 0, isCrit: false };
  const owned = findOwnedRow(ctx, hitter, hitter.activeCharacterId);
  const constellation = activatedConstellationFor(
    ctx,
    hitter.identity,
    hitter.activeCharacterId,
    owned ? owned.constellation : 0
  );
  const transcend = owned ? owned.transcendLevel : 0;
  const grantSkill = skillGrantActive(isSkill, ctx.timestamp.microsSinceUnixEpoch, hitter.skillWindowEndsAtMicros);
  const base = computeBaseDamage({
    weaponId: cc.weaponId,
    skillDamage: grantSkill ? cc.skillDamage : null,
    combo,
    constellation,
    transcend,
  });
  const stat = CHARACTER_STATS[hitter.activeCharacterId];
  const { isCrit, multiplier } = rollCrit(stat ? stat.critRate : 0, stat ? stat.critDmg : 1, () => ctx.random());
  const resisted = resistedDamage(base * multiplier, profile, dmgType);
  const amount = Math.round(resisted);
  return { amount, isCrit };
}

// A player's real, authoritative attack: every alive enemy AND goliath within
// radius of the center takes `damage` and has its aggro flipped to the caller.
// Anything that dies pays its combo-boosted base + hoard, credited to the killer.
// This is the one place a player can burst a goliath down before a camp does.
export const attackEnemies = spacetimedb.reducer(
  {
    centerX: t.f32(),
    centerZ: t.f32(),
    radius: t.f32(),
    isSkill: t.bool(),
    comboCount: t.u32(),
  },
  (ctx, { centerX, centerZ, radius, isSkill, comboCount }) => {
    const currentPlayer = requirePlayer(ctx);
    // Reject implausible strikes so a client can't sweep the whole map risk-free
    // from the safe zone: the strike centre must be within weapon range of the
    // attacker (as attackPlayer enforces) and the blast radius is capped. Guard
    // non-finite inputs, which would otherwise bypass the distance check.
    if (!Number.isFinite(centerX) || !Number.isFinite(centerZ) || !Number.isFinite(radius)) return;
    if (distanceBetween(currentPlayer.positionX, currentPlayer.positionZ, centerX, centerZ) > MAX_HIT_RANGE) return;
    const boundedRadius = Math.max(0, Math.min(radius, MAX_ATTACK_RADIUS));
    const now = ctx.timestamp.microsSinceUnixEpoch;
    const combo = Math.min(comboCount, MAX_COMBO_FOR_GEMS);
    const comboScale = 1 + combo * COMBO_GEM_STEP;
    let gemsCredited = 0;

    for (const enemyRow of [...ctx.db.enemy.iter()]) {
      if (!enemyRow.alive) continue;
      if (distanceBetween(enemyRow.positionX, enemyRow.positionZ, centerX, centerZ) > boundedRadius) continue;
      // Server owns the number: base + crit are computed here per target (each gets
      // its own crit roll — correct and acceptable), never sent by the client.
      const { amount, isCrit } = resolvePlayerHit(ctx, currentPlayer, isSkill, combo, 'melee');
      // Every landed hit floats a number — INCLUDING the killing blow (which shows
      // the full computed hit strength, ARPG-style, not the sliver of HP left).
      ctx.db.enemyHit.insert({
        attacker: currentPlayer.identity,
        positionX: enemyRow.positionX,
        positionZ: enemyRow.positionZ,
        amount,
        isCrit,
      });
      const remaining = enemyRow.health - Math.min(amount, enemyRow.health);
      if (remaining > 0) {
        ctx.db.enemy.enemyId.update({
          ...enemyRow,
          health: remaining,
          aggroKind: AGGRO_PLAYER,
          aggroPlayer: currentPlayer.identity,
          aggroExpiresAtMicros: now + AGGRO_DURATION_MICROS,
        });
        continue;
      }
      const base = Math.round(enemyBaseGems(false, 0, enemyRow.rewardTier, enemyRow.isBoss) * comboScale);
      gemsCredited += killEnemyRow(ctx, enemyRow, base, currentPlayer.identity, now);
    }

    for (const goliathRow of [...ctx.db.goliath.iter()]) {
      if (!goliathRow.alive) continue;
      if (distanceBetween(goliathRow.positionX, goliathRow.positionZ, centerX, centerZ) > boundedRadius) continue;
      const { amount, isCrit } = resolvePlayerHit(ctx, currentPlayer, isSkill, combo, 'melee');
      ctx.db.enemyHit.insert({
        attacker: currentPlayer.identity,
        positionX: goliathRow.positionX,
        positionZ: goliathRow.positionZ,
        amount,
        isCrit,
      });
      const remaining = goliathRow.health - Math.min(amount, goliathRow.health);
      if (remaining > 0) {
        ctx.db.goliath.goliathId.update({
          ...goliathRow,
          health: remaining,
          aggroPlayer: currentPlayer.identity,
          aggroExpiresAtMicros: now + AGGRO_DURATION_MICROS,
        });
        continue;
      }
      const base = Math.round(enemyBaseGems(true, goliathRow.sizeIndex, 0, false) * comboScale);
      // Reuse the goliath death path but with the combo-boosted, player-credited base.
      const dropped = spillEnemyLoot(ctx, goliathRow.positionX, goliathRow.positionZ, base, goliathRow.carriedGems, currentPlayer.identity);
      ctx.db.goliath.goliathId.update({
        ...goliathRow,
        alive: false,
        health: 0,
        carriedGems: 0,
        aggroPlayer: undefined,
        aggroExpiresAtMicros: 0n,
        targetCampIndex: -1,
      });
      gemsCredited += dropped;
    }

    if (gemsCredited > 0) {
      ctx.db.player.identity.update({
        ...currentPlayer,
        gemsFromKills: currentPlayer.gemsFromKills + gemsCredited,
        lastKillRewardAt: ctx.timestamp,
      });
    }
  }
);

// A player's ranged (bow) hitscan: fired ONCE when a projectile launches, not per
// frame. The server picks the first alive enemy/goliath the ray passes through
// using authoritative positions, so a shot lands the same at any range — a
// per-frame client projectile whiffed on far, moving targets because it damaged
// against a position the enemy had already drifted away from. Only the single
// entity the ray reaches first takes damage (a projectile strikes one thing).
export const attackRay = spacetimedb.reducer(
  {
    originX: t.f32(),
    originZ: t.f32(),
    dirX: t.f32(),
    dirZ: t.f32(),
    range: t.f32(),
    hitRadius: t.f32(),
    isSkill: t.bool(),
    comboCount: t.u32(),
  },
  (ctx, { originX, originZ, dirX, dirZ, range, hitRadius, isSkill, comboCount }) => {
    const currentPlayer = requirePlayer(ctx);
    if (
      !Number.isFinite(originX) ||
      !Number.isFinite(originZ) ||
      !Number.isFinite(dirX) ||
      !Number.isFinite(dirZ) ||
      !Number.isFinite(range) ||
      !Number.isFinite(hitRadius)
    ) {
      return;
    }
    // Anti-cheat: the shot must originate within weapon range of the attacker, so
    // a client can't fire hitscans from across the map (mirrors attackEnemies).
    if (distanceBetween(currentPlayer.positionX, currentPlayer.positionZ, originX, originZ) > MAX_HIT_RANGE) return;

    const boundedRange = Math.max(0, Math.min(range, MAX_HIT_RANGE));
    const boundedRadius = Math.max(0, Math.min(hitRadius, MAX_RANGED_HIT_RADIUS));
    const combo = Math.min(comboCount, MAX_COMBO_FOR_GEMS);
    const comboScale = 1 + combo * COMBO_GEM_STEP;
    const now = ctx.timestamp.microsSinceUnixEpoch;

    // Tell every other client to draw this projectile. Emitted here — before the
    // enemy/goliath hit test can early-return — so a pure-PvP shot still shows.
    ctx.db.rangedAttack.insert({
      attacker: currentPlayer.identity,
      characterId: currentPlayer.activeCharacterId,
      originX,
      originZ,
      directionX: dirX,
      directionZ: dirZ,
    });

    const aliveEnemies = [...ctx.db.enemy.iter()].filter(row => row.alive);
    const aliveGoliaths = [...ctx.db.goliath.iter()].filter(row => row.alive);
    const enemyHit = pickRayHit(
      aliveEnemies.map(row => ({ x: row.positionX, z: row.positionZ })),
      originX,
      originZ,
      dirX,
      dirZ,
      boundedRange,
      boundedRadius
    );
    const goliathHit = pickRayHit(
      aliveGoliaths.map(row => ({ x: row.positionX, z: row.positionZ })),
      originX,
      originZ,
      dirX,
      dirZ,
      boundedRange,
      boundedRadius
    );
    const enemyReached = enemyHit.index !== -1;
    const goliathReached = goliathHit.index !== -1;
    if (!enemyReached && !goliathReached) return;
    // The projectile strikes whichever entity it reaches first, regardless of type.
    const strikeGoliath = goliathReached && (!enemyReached || goliathHit.alongRay < enemyHit.alongRay);

    let gemsCredited = 0;
    if (strikeGoliath) {
      const goliathRow = aliveGoliaths[goliathHit.index];
      // Server owns the number: resolvePlayerHit applies GOLIATH_RESISTANCES ranged
      // (0.10) to the server-computed raw — the client sends no damage.
      const { amount, isCrit } = resolvePlayerHit(ctx, currentPlayer, isSkill, combo, 'ranged', GOLIATH_RESISTANCES);
      // Killing blow floats a number too — full computed hit strength, ARPG-style.
      ctx.db.enemyHit.insert({
        attacker: currentPlayer.identity,
        positionX: goliathRow.positionX,
        positionZ: goliathRow.positionZ,
        amount,
        isCrit,
      });
      const remaining = goliathRow.health - Math.min(amount, goliathRow.health);
      if (remaining > 0) {
        ctx.db.goliath.goliathId.update({
          ...goliathRow,
          health: remaining,
          aggroPlayer: currentPlayer.identity,
          aggroExpiresAtMicros: now + AGGRO_DURATION_MICROS,
        });
      } else {
        const base = Math.round(enemyBaseGems(true, goliathRow.sizeIndex, 0, false) * comboScale);
        const dropped = spillEnemyLoot(ctx, goliathRow.positionX, goliathRow.positionZ, base, goliathRow.carriedGems, currentPlayer.identity);
        ctx.db.goliath.goliathId.update({
          ...goliathRow,
          alive: false,
          health: 0,
          carriedGems: 0,
          aggroPlayer: undefined,
          aggroExpiresAtMicros: 0n,
          targetCampIndex: -1,
        });
        gemsCredited += dropped;
      }
    } else {
      const enemyRow = aliveEnemies[enemyHit.index];
      const { amount, isCrit } = resolvePlayerHit(ctx, currentPlayer, isSkill, combo, 'melee');
      ctx.db.enemyHit.insert({
        attacker: currentPlayer.identity,
        positionX: enemyRow.positionX,
        positionZ: enemyRow.positionZ,
        amount,
        isCrit,
      });
      const remaining = enemyRow.health - Math.min(amount, enemyRow.health);
      if (remaining > 0) {
        ctx.db.enemy.enemyId.update({
          ...enemyRow,
          health: remaining,
          aggroKind: AGGRO_PLAYER,
          aggroPlayer: currentPlayer.identity,
          aggroExpiresAtMicros: now + AGGRO_DURATION_MICROS,
        });
      } else {
        const base = Math.round(enemyBaseGems(false, 0, enemyRow.rewardTier, enemyRow.isBoss) * comboScale);
        gemsCredited += killEnemyRow(ctx, enemyRow, base, currentPlayer.identity, now);
      }
    }

    if (gemsCredited > 0) {
      ctx.db.player.identity.update({
        ...currentPlayer,
        gemsFromKills: currentPlayer.gemsFromKills + gemsCredited,
        lastKillRewardAt: ctx.timestamp,
      });
    }
  }
);

// --- Snapshot restore (post-wipe seeding) -------------------------------------
// SpacetimeDB has no Laravel-style seeder/import. These batch reducers re-insert
// a backup of the durable tables after a wipe (see scripts/backup.mjs +
// scripts/restore.mjs). Each is guarded to run ONLY into an empty table, so it
// can't be used to overwrite a live database or spoof other players' rows.
// Auto-increment ids and timestamps are re-minted (order is preserved by insert
// order); identities are restored verbatim so a returning player keeps their data.

const RestorePlayerRow = t.object('RestorePlayerRow', {
  identity: t.identity(),
  name: t.string(),
  positionX: t.f32(),
  positionY: t.f32(),
  positionZ: t.f32(),
  rotationY: t.f32(),
  activeCharacterId: t.string(),
  partyOrder: t.array(t.string()),
  gems: t.u32(),
  currentHealth: t.u32(),
  gemsFromKills: t.u32(),
  gemsCollected: t.u32(),
  transcendShards: t.u32(),
});

const RestoreOwnedCharacterRow = t.object('RestoreOwnedCharacterRow', {
  owner: t.identity(),
  characterId: t.string(),
  currentHealth: t.u32(),
  constellation: t.u32(),
});

const RestoreWeaponItemRow = t.object('RestoreWeaponItemRow', {
  owner: t.identity(),
  weaponId: t.string(),
  rarity: t.u32(),
  count: t.u32(),
});

const RestoreBannerPityRow = t.object('RestoreBannerPityRow', {
  owner: t.identity(),
  bannerId: t.string(),
  pullsSinceFiveStar: t.u32(),
  pullsSinceFourStar: t.u32(),
  guaranteedFeatured: t.bool(),
  totalPulls: t.u32(),
});

function requireEmpty(rows: Iterable<unknown>, name: string) {
  if ([...rows].length > 0) throw new SenderError(`${name} table is not empty; refusing to restore`);
}

export const restorePlayers = spacetimedb.reducer(
  { rows: t.array(RestorePlayerRow) },
  (ctx, { rows }) => {
    requireEmpty(ctx.db.player.iter(), 'player');
    for (const row of rows) {
      // Skill-window/stun state are additive columns absent from pre-existing
      // backups; seed them to 0n so a restored player starts off-cooldown, unstunned.
      ctx.db.player.insert({ ...row, online: false, lastKillRewardAt: ctx.timestamp, skillReadyAtMicros: 0n, skillWindowEndsAtMicros: 0n, stunnedUntilMicros: 0n });
    }
  }
);

export const restoreOwnedCharacters = spacetimedb.reducer(
  { rows: t.array(RestoreOwnedCharacterRow) },
  (ctx, { rows }) => {
    requireEmpty(ctx.db.ownedCharacter.iter(), 'owned_character');
    // transcendLevel is a Phase-02 additive column absent from pre-existing backups;
    // backfill it to 0 on restore (spread cannot override a field the row lacks).
    for (const row of rows) ctx.db.ownedCharacter.insert({ id: 0n, transcendLevel: 0, ...row });
  }
);

export const restoreWeaponItems = spacetimedb.reducer(
  { rows: t.array(RestoreWeaponItemRow) },
  (ctx, { rows }) => {
    requireEmpty(ctx.db.weaponItem.iter(), 'weapon_item');
    for (const row of rows) ctx.db.weaponItem.insert({ id: 0n, ...row, acquiredAt: ctx.timestamp });
  }
);

// One-shot migration: merge legacy one-row-per-pull weapon_item duplicates into
// (owner, weapon) stacks by summing counts. Idempotent — already-stacked rows
// have nothing to merge. Run once per environment after the stacking publish:
// `spacetime call <db> consolidate_weapon_items`.
export const consolidateWeaponItems = spacetimedb.reducer((ctx) => {
  const keeperByKey = new Map<string, any>();
  for (const row of [...ctx.db.weaponItem.iter()]) {
    const key = `${row.owner.toHexString()}:${row.weaponId}`;
    const keeper = keeperByKey.get(key);
    if (!keeper) {
      keeperByKey.set(key, { ...row });
      continue;
    }
    keeper.count += row.count;
    ctx.db.weaponItem.id.delete(row.id);
  }
  for (const keeper of keeperByKey.values()) ctx.db.weaponItem.id.update(keeper);
});

export const restoreBannerPity = spacetimedb.reducer(
  { rows: t.array(RestoreBannerPityRow) },
  (ctx, { rows }) => {
    requireEmpty(ctx.db.bannerPity.iter(), 'banner_pity');
    for (const row of rows) ctx.db.bannerPity.insert({ id: 0n, ...row });
  }
);

// Any player who walks over a drop grabs it. First one there wins the race.
// The client only requests this once a drop has magneted to the player, so the
// pickup proximity is gated client-side (same trust model as the sim enemies) —
// a server distance check against the drop's origin would wrongly reject gems
// that drifted toward the player.
export const collectGem = spacetimedb.reducer(
  { dropId: t.u64() },
  (ctx, { dropId }) => {
    const currentPlayer = requirePlayer(ctx);
    const drop = ctx.db.gemDrop.id.find(dropId);
    if (!drop) return;
    // Anti-cheat parity with the client's 1.2s pickup delay: refuse a grab until the
    // grace period has elapsed. Legit pickups wait 1.2s + sub latency, so unaffected.
    if (!gemIsCollectible(drop.droppedAtMicros, ctx.timestamp.microsSinceUnixEpoch, GEM_PICKUP_DELAY_MICROS)) return;
    ctx.db.gemDrop.id.delete(dropId);
    ctx.db.player.identity.update({
      ...currentPlayer,
      gems: currentPlayer.gems + drop.amount,
      gemsCollected: currentPlayer.gemsCollected + drop.amount,
    });
  }
);

// Grabs a ground shard. Same first-there-wins race and same 1.2s anti-cheat grace
// as collectGem — it REUSES the generic gemIsCollectible + GEM_PICKUP_DELAY_MICROS
// (no forked grace). Credits the scarce shard to the grabber's transcendShards.
export const collectShard = spacetimedb.reducer(
  { dropId: t.u64() },
  (ctx, { dropId }) => {
    const currentPlayer = requirePlayer(ctx);
    const drop = ctx.db.shardDrop.id.find(dropId);
    if (!drop) return;
    if (!gemIsCollectible(drop.droppedAtMicros, ctx.timestamp.microsSinceUnixEpoch, GEM_PICKUP_DELAY_MICROS)) return;
    ctx.db.shardDrop.id.delete(dropId);
    ctx.db.player.identity.update({
      ...currentPlayer,
      transcendShards: currentPlayer.transcendShards + drop.amount,
    });
  }
);

export const healInSafeZone = spacetimedb.reducer(
  { amount: t.u32() },
  (ctx, { amount }) => {
    const currentPlayer = requirePlayer(ctx);
    if (!isInsideSafeZone(currentPlayer.positionX, currentPlayer.positionZ)) {
      throw new SenderError('Healing only works inside the safe zone');
    }
    const maxHealth = statsFor(currentPlayer.activeCharacterId).maxHealth;
    const healedHealth = Math.min(maxHealth, currentPlayer.currentHealth + amount);
    setActiveHealth(ctx, currentPlayer, healedHealth);
  }
);

// Healer characters restore the whole owned party (benched + self). Called by
// the client when an active healer casts (burst) or once per second while a
// passive healer is on field. comboCount only matters for combo-mode healers
// and is clamped server-side. PVE self-heal, so no PVP advantage to abuse.
export const healParty = spacetimedb.reducer(
  { comboCount: t.u32() },
  (ctx, { comboCount }) => {
    const currentPlayer = requirePlayer(ctx);
    const stats = statsFor(currentPlayer.activeCharacterId);
    if (stats.healType === 'none') return;

    const ownedList = [...ctx.db.ownedCharacter.owner.filter(currentPlayer.identity)];
    const healer = ownedList.find(row => row.characterId === currentPlayer.activeCharacterId);
    const healActivated = healer
      ? activatedConstellationFor(ctx, healer.owner, healer.characterId, healer.constellation)
      : 0;
    const healMultiplier =
      1 +
      healActivated * HEAL_CONSTELLATION_STEP +
      (healer ? healer.transcendLevel : 0) * TRANSCEND_HEAL_STEP;

    let activeHealth = currentPlayer.currentHealth;
    for (const owned of ownedList) {
      const targetMax = statsFor(owned.characterId).maxHealth;
      const amount = Math.round(healAmountFor(stats, targetMax, comboCount) * healMultiplier);
      if (amount <= 0 || owned.currentHealth >= targetMax) continue;
      const healed = Math.min(targetMax, owned.currentHealth + amount);
      ctx.db.ownedCharacter.id.update({ ...owned, currentHealth: healed });
      ctx.db.healEvent.insert({
        owner: currentPlayer.identity,
        characterId: owned.characterId,
        amount: healed - owned.currentHealth,
      });
      if (owned.characterId === currentPlayer.activeCharacterId) activeHealth = healed;
    }
    // Mirror the active character's new HP onto the player row for combat/HUD.
    if (activeHealth !== currentPlayer.currentHealth) {
      ctx.db.player.identity.update({ ...currentPlayer, currentHealth: activeHealth });
    }
  }
);

// Grants a character. New → added at C0. Duplicate → +1 constellation up to
// C6. Returns the outcome so the pull can show C-level and mint a shard at max.
// Upsert a character's manual activation level.
function setActivation(ctx: { db: any }, owner: any, characterId: string, level: number) {
  const existing = [...ctx.db.characterActivation.by_owner_character.filter([owner, characterId])][0];
  if (existing) {
    ctx.db.characterActivation.id.update({ ...existing, activatedConstellation: level });
  } else {
    ctx.db.characterActivation.insert({ id: 0n, owner, characterId, activatedConstellation: level });
  }
}

// Effective active stars for scaling: the manual value if set, else the full
// unlocked constellation (so players who never touch it keep their old power).
function activatedConstellationFor(
  ctx: { db: any },
  owner: any,
  characterId: string,
  unlocked: number
): number {
  const row = [...ctx.db.characterActivation.by_owner_character.filter([owner, characterId])][0];
  return row ? Math.min(row.activatedConstellation, unlocked) : unlocked;
}

function grantCharacter(ctx: { db: any }, owner: any, characterId: string) {
  const owned = [...ctx.db.ownedCharacter.owner.filter(owner)].find(
    (row: any) => row.characterId === characterId
  );
  if (!owned) {
    ctx.db.ownedCharacter.insert({
      id: 0n,
      owner,
      characterId,
      currentHealth: statsFor(characterId).maxHealth,
      constellation: 0,
    });
    return { isNew: true, constellation: 0, shardMinted: 0 };
  }
  // Below C6 the dupe advances the constellation; at/past C6 it pins to cap and
  // mints a transcend shard instead (resolveDupeGrant is the proven pure decision).
  const { constellation, shardMinted } = resolveDupeGrant(
    owned.constellation,
    MAX_CONSTELLATION,
    SHARD_PER_OVERFLOW_DUPE
  );
  if (constellation !== owned.constellation) {
    ctx.db.ownedCharacter.id.update({ ...owned, constellation });
    // A freshly unlocked star auto-activates (feels good on pull); the player can
    // still dial it back down manually via setConstellation.
    setActivation(ctx, owner, characterId, constellation);
  }
  return { isNew: false, constellation, shardMinted };
}

function grantWeapon(ctx: { db: any; timestamp: any }, owner: any, weaponId: string, rarity: number) {
  // Stack upsert: a dupe bumps the existing row's count instead of adding a row.
  const existing = [...ctx.db.weaponItem.by_owner_weapon.filter([owner, weaponId])][0];
  if (existing) {
    ctx.db.weaponItem.id.update({ ...existing, count: existing.count + 1 });
    return;
  }
  ctx.db.weaponItem.insert({
    id: 0n,
    owner,
    weaponId,
    rarity,
    count: 1,
    acquiredAt: ctx.timestamp,
  });
}

export const pullBanner = spacetimedb.reducer(
  { bannerId: t.string(), count: t.u32() },
  (ctx, { bannerId, count }) => {
    const currentPlayer = requirePlayer(ctx);
    const banner = BANNERS[bannerId];
    if (!banner) throw new SenderError('Unknown banner');

    // count semantics: 0 = "max" (long-press ×10 → spend the whole wallet in
    // one atomic transaction), otherwise the classic ×1 / ×10 buttons.
    const pullCount =
      count === 0
        ? Math.floor(currentPlayer.gems / GACHA_PULL_COST)
        : count >= MAX_PULLS_PER_REQUEST
          ? MAX_PULLS_PER_REQUEST
          : 1;
    if (pullCount < 1) throw new SenderError('Not enough gems');
    const totalCost = GACHA_PULL_COST * pullCount;
    if (currentPlayer.gems < totalCost) throw new SenderError('Not enough gems');

    // Load (or create) this banner's pity row for the player.
    let pity = [...ctx.db.bannerPity.by_owner_banner.filter([currentPlayer.identity, bannerId])][0];
    if (!pity) {
      pity = ctx.db.bannerPity.insert({
        id: 0n,
        owner: currentPlayer.identity,
        bannerId,
        pullsSinceFiveStar: 0,
        pullsSinceFourStar: 0,
        guaranteedFeatured: false,
        totalPulls: 0,
      });
    }

    let sinceFive = pity.pullsSinceFiveStar;
    let sinceFour = pity.pullsSinceFourStar;
    let guaranteed = pity.guaranteedFeatured;
    let total = pity.totalPulls;
    let shardsMinted = 0;

    for (let slot = 0; slot < pullCount; slot++) {
      sinceFive++;
      sinceFour++;
      total++;
      let kind = 'weapon';
      let itemId = '';
      let rarity = 3;
      let isNew = false;
      let isFeatured = false;
      let constellation = 0;
      let slotShard = 0;

      if (ctx.random() < fiveStarChance(sinceFive)) {
        sinceFive = 0;
        rarity = 5;
        const wonFeatured = guaranteed || ctx.random() < FEATURED_5STAR_WIN;
        if (wonFeatured) {
          guaranteed = false;
          kind = 'character';
          itemId = banner.featuredCharacterId;
          isFeatured = true;
          const result = grantCharacter(ctx, currentPlayer.identity, itemId);
          isNew = result.isNew;
          constellation = result.constellation;
          slotShard = result.shardMinted;
          shardsMinted += result.shardMinted;
        } else {
          // Lost the 50/50 → a random standard 5★ (character or weapon), and the
          // next banner 5★ is guaranteed to be the featured character.
          guaranteed = true;
          const standard = pickStandardFiveStar(ctx);
          itemId = standard.id;
          if (standard.kind === 'character') {
            kind = 'character';
            const result = grantCharacter(ctx, currentPlayer.identity, itemId);
            isNew = result.isNew;
            constellation = result.constellation;
            slotShard = result.shardMinted;
            shardsMinted += result.shardMinted;
          } else {
            grantWeapon(ctx, currentPlayer.identity, itemId, 5);
          }
        }
      } else if (sinceFour >= FOUR_STAR_PITY || ctx.random() < FOUR_STAR_RATE) {
        sinceFour = 0;
        rarity = 4;
        if (ctx.random() < FOUR_STAR_CHARACTER_SHARE) {
          kind = 'character';
          itemId = pickFourStarCharacterId(ctx);
          const result = grantCharacter(ctx, currentPlayer.identity, itemId);
          isNew = result.isNew;
          constellation = result.constellation;
          slotShard = result.shardMinted;
          shardsMinted += result.shardMinted;
        } else {
          itemId = pickWeaponId(ctx, 4);
          grantWeapon(ctx, currentPlayer.identity, itemId, 4);
        }
      } else {
        rarity = 3;
        itemId = pickWeaponId(ctx, 3);
        grantWeapon(ctx, currentPlayer.identity, itemId, 3);
      }

      ctx.db.pullResult.insert({
        owner: currentPlayer.identity,
        bannerId,
        slot,
        kind,
        itemId,
        rarity,
        isNew,
        isFeatured,
        constellation,
        shardMinted: slotShard,
      });
    }

    ctx.db.bannerPity.id.update({
      ...pity,
      pullsSinceFiveStar: sinceFive,
      pullsSinceFourStar: sinceFour,
      guaranteedFeatured: guaranteed,
      totalPulls: total,
    });
    ctx.db.player.identity.update({
      ...currentPlayer,
      gems: currentPlayer.gems - totalCost,
      transcendShards: currentPlayer.transcendShards + shardsMinted,
    });
  }
);

export const regenTick = spacetimedb.reducer(
  { timer: regenTimer.rowType },
  ctx => {
    for (const currentPlayer of [...ctx.db.player.iter()]) {
      if (!currentPlayer.online) continue;
      const { maxHealth, healthRegen } = statsFor(currentPlayer.activeCharacterId);
      if (healthRegen <= 0 || currentPlayer.currentHealth >= maxHealth) continue;
      const healed = Math.min(maxHealth, currentPlayer.currentHealth + healthRegen);
      setActiveHealth(ctx, currentPlayer, healed);
    }
  }
);

// ---- World tick: the server-authoritative camp fight -------------------------

// Spawns every camp's members: one boss (member 0, boss multipliers) plus guards,
// scattered around the camp home via the seeded PRNG. Idempotent — only seeds
// when the enemy table is empty, so it is safe to call from init repeatedly.
// Schedules the world tick once. Guarded so it is safe to call on an existing
// database (via seedWorld) as well as from init on a fresh one.
function ensureWorldTickScheduled(ctx: { db: any }) {
  if ([...ctx.db.worldTimer.iter()].length > 0) return;
  ctx.db.worldTimer.insert({
    scheduled_id: 0n,
    scheduled_at: ScheduleAt.interval(WORLD_TICK_INTERVAL_MICROS),
  });
}

function spawnCamps(ctx: { db: any }) {
  if ([...ctx.db.enemy.iter()].length > 0) return;
  const spawnRandom = createSeededRandom(ENEMY_SPAWN_SEED);
  generateCampSites().forEach((campSite, campIndex) => {
    const archetypeId = campSite.archetypeId;
    const rewardTier = ENEMY_ARCHETYPE_STATS[archetypeId].rewardTier;
    for (let memberIndex = 0; memberIndex < MEMBERS_PER_CAMP; memberIndex++) {
      const isBoss = isBossMember(memberIndex);
      const maxHealth = enemyMaxHealth(archetypeId, isBoss);
      const angle = spawnRandom() * Math.PI * 2;
      const distance = spawnRandom() * SPAWN_SCATTER_RADIUS;
      // Each member gets its OWN scattered home so members hold a spread-out
      // formation instead of all converging on the camp centre (which stacked
      // them into one blob that a single AoE wiped out together).
      const spawnX = clampToWorld(campSite.x + Math.cos(angle) * distance);
      const spawnZ = clampToWorld(campSite.z + Math.sin(angle) * distance);
      ctx.db.enemy.insert({
        enemyId: BigInt(enemyIdFor(campIndex, memberIndex)),
        campIndex,
        archetypeId,
        isBoss,
        rewardTier,
        homeX: spawnX,
        homeZ: spawnZ,
        positionX: spawnX,
        positionZ: spawnZ,
        health: maxHealth,
        maxHealth,
        contactDamage: enemyContactDamage(archetypeId, isBoss),
        carriedGems: 0,
        aggroKind: AGGRO_HOME,
        aggroPlayer: undefined,
        aggroGoliathId: 0n,
        aggroExpiresAtMicros: 0n,
        alive: true,
        respawnAtMicros: 0n,
        hopStartedAtMicros: 0n,
        hopDurationMicros: 0n,
        hopTargetX: 0,
        hopTargetZ: 0,
        patrolTargetX: 0,
        patrolTargetZ: 0,
        restUntilMicros: 0n,
      });
    }
  });
}

interface CampCenter {
  campIndex: number;
  x: number;
  z: number;
  livingCount: number;
}

// Groups enemies by camp so goliaths can target the nearest camp still standing.
function campCentersFrom(enemies: any[]): CampCenter[] {
  const byIndex = new Map<number, CampCenter>();
  for (const enemyRow of enemies) {
    let center = byIndex.get(enemyRow.campIndex);
    if (!center) {
      center = { campIndex: enemyRow.campIndex, x: enemyRow.homeX, z: enemyRow.homeZ, livingCount: 0 };
      byIndex.set(enemyRow.campIndex, center);
    }
    if (enemyRow.alive) center.livingCount++;
  }
  return [...byIndex.values()];
}

// Spawns one seeded batch (1-3, seeded sizes) of goliath raiders per 5-minute
// window and retires the previous window's raiders. A raider never respawns
// inside its window once dead: its row lingers (alive false) so the "already
// spawned this bucket" guard keeps it from coming back.
function runGoliathLifecycle(ctx: { db: any; random: any; sender: any; timestamp: any }, nowMicros: bigint, campCenters: CampCenter[]) {
  const windowBucket = windowBucketFor(nowMicros, GOLIATH_BATCH_WINDOW_MICROS);
  const existing = [...ctx.db.goliath.iter()];
  for (const goliathRow of existing) {
    if (goliathRow.windowBucket === windowBucket) continue;
    // A raider still alive at the window boundary drops the gems it stole back onto
    // the ground (no minted base — it wasn't killed) so its hoard is never destroyed.
    if (goliathRow.alive && goliathRow.carriedGems > 0) {
      spillDenominations(ctx, goliathRow.positionX, goliathRow.positionZ, goliathRow.carriedGems, ctx.sender);
    }
    ctx.db.goliath.goliathId.delete(goliathRow.goliathId);
  }
  if (existing.some(goliathRow => goliathRow.windowBucket === windowBucket)) return;

  const spawnRandom = createSeededRandom((Number(windowBucket % 0x100000000n) ^ 0x6011a7) >>> 0);
  goliathBatchForWindow(windowBucket).forEach((sizeIndex, memberIndex) => {
    const stats = GOLIATH_SIZE_STATS[sizeIndex];
    const anchor = campCenters.length > 0 ? campCenters[memberIndex % campCenters.length] : { x: 0, z: 0 };
    const angle = spawnRandom() * Math.PI * 2;
    const distance = spawnRandom() * SPAWN_SCATTER_RADIUS;
    ctx.db.goliath.insert({
      goliathId: GOLIATH_SLOT_ID_BASE + BigInt(memberIndex + 1),
      sizeIndex,
      positionX: clampToWorld(anchor.x + Math.cos(angle) * distance),
      positionZ: clampToWorld(anchor.z + Math.sin(angle) * distance),
      health: stats.maxHealth,
      maxHealth: stats.maxHealth,
      contactDamage: stats.contactDamage,
      moveSpeed: stats.moveSpeed,
      splashes: stats.splashesOnAttack,
      carriedGems: 0,
      targetCampIndex: -1,
      engageEndsAtMicros: 0n,
      lastRaidedCampIndex: -1,
      headingX: 0,
      headingZ: 0,
      aggroPlayer: undefined,
      aggroExpiresAtMicros: 0n,
      alive: true,
      windowBucket,
    });
  });
}

// Two optional identities are equal when both are absent or share a hex.
function sameOptionalIdentity(a: any, b: any): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.toHexString() === b.toHexString();
}

// Any alive enemy/goliath within grab range of a ground drop absorbs it into its
// carried hoard (goliaths sweep a wider area). This is how a camp ends up holding
// a dead goliath's loot after it spilled on the ground.
function vacuumGems(ctx: { db: any }, nowMicros: bigint) {
  for (const drop of [...ctx.db.gemDrop.iter()]) {
    // Fresh drops are untouchable during their grace period so a kill's gems
    // visibly fall and rest before any enemy or goliath can absorb them.
    if (!gemIsCollectible(drop.droppedAtMicros, nowMicros, GEM_PICKUP_DELAY_MICROS)) continue;
    let absorbed = false;
    for (const enemyRow of [...ctx.db.enemy.iter()]) {
      if (!enemyRow.alive) continue;
      if (distanceBetween(enemyRow.positionX, enemyRow.positionZ, drop.positionX, drop.positionZ) > ENEMY_GEM_VACUUM_RANGE) continue;
      ctx.db.enemy.enemyId.update({ ...enemyRow, carriedGems: Math.min(enemyRow.carriedGems + drop.amount, CARRY_HARD_CAP) });
      absorbed = true;
      break;
    }
    if (absorbed) {
      ctx.db.gemDrop.id.delete(drop.id);
      continue;
    }
    for (const goliathRow of [...ctx.db.goliath.iter()]) {
      if (!goliathRow.alive) continue;
      if (distanceBetween(goliathRow.positionX, goliathRow.positionZ, drop.positionX, drop.positionZ) > GOLIATH_GEM_VACUUM_RANGE) continue;
      ctx.db.goliath.goliathId.update({ ...goliathRow, carriedGems: Math.min(goliathRow.carriedGems + drop.amount, CARRY_HARD_CAP) });
      ctx.db.gemDrop.id.delete(drop.id);
      break;
    }
  }
}

// Revives camp enemies whose respawn delay has elapsed, at full health at home.
function respawnEnemies(ctx: { db: any }, nowMicros: bigint) {
  for (const enemyRow of [...ctx.db.enemy.iter()]) {
    if (enemyRow.alive || enemyRow.respawnAtMicros === 0n || nowMicros < enemyRow.respawnAtMicros) continue;
    ctx.db.enemy.enemyId.update({
      ...enemyRow,
      alive: true,
      health: enemyRow.maxHealth,
      carriedGems: 0,
      positionX: enemyRow.homeX,
      positionZ: enemyRow.homeZ,
      aggroKind: AGGRO_HOME,
      aggroPlayer: undefined,
      aggroGoliathId: 0n,
      aggroExpiresAtMicros: 0n,
      respawnAtMicros: 0n,
      hopStartedAtMicros: 0n,
      hopDurationMicros: 0n,
      hopTargetX: 0,
      hopTargetZ: 0,
      patrolTargetX: 0,
      patrolTargetZ: 0,
      restUntilMicros: 0n,
    });
  }
}

// DEV/TEST: toggle a player (by name) as a server-driven puppet (training dummy)
// that the world tick steers toward the nearest real player. Local testing only.
export const debugSetPuppet = spacetimedb.reducer(
  { name: t.string(), enabled: t.bool() },
  (ctx, { name, enabled }) => {
    const target = [...ctx.db.player.iter()].find(p => p.name === name);
    if (!target) throw new SenderError('No player with that name');
    const existing = ctx.db.puppet.identity.find(target.identity);
    if (enabled && !existing) ctx.db.puppet.insert({ identity: target.identity });
    if (!enabled && existing) ctx.db.puppet.identity.delete(target.identity);
  }
);

// DEV/TEST: make player `fromName` invite player `toName` to a party (mirrors
// invitePlayer, but with an explicit actor so a headless bot can invite you).
// Local testing only.
export const debugInvite = spacetimedb.reducer(
  { fromName: t.string(), toName: t.string() },
  (ctx, { fromName, toName }) => {
    const roster0 = [...ctx.db.player.iter()];
    const me = roster0.find(p => p.name === fromName);
    const target = roster0.find(p => p.name === toName);
    if (!me || !target) throw new SenderError('Player name not found');
    if (me.identity.equals(target.identity)) throw new SenderError('Nevar aicināt sevi');
    if (ctx.db.partyMember.identity.find(target.identity))
      throw new SenderError(`${target.name} jau ir citā barā`);
    const mine = ctx.db.partyMember.identity.find(me.identity);
    let partyId: bigint;
    if (mine) {
      partyId = mine.partyId;
    } else {
      const p = ctx.db.party.insert({ id: 0n, leaderIdentity: me.identity, createdAt: ctx.timestamp });
      partyId = p.id;
      ctx.db.partyMember.insert({ id: 0n, partyId, identity: me.identity, joinedAt: ctx.timestamp });
    }
    if ([...ctx.db.partyMember.partyId.filter(partyId)].length >= RAID_PARTY_SIZE)
      throw new SenderError('Bars ir pilns (4/4)');
    const dupe = [...ctx.db.partyInvite.partyId.filter(partyId)].some(inv =>
      inv.joinerIdentity.equals(target.identity)
    );
    if (dupe) return;
    ctx.db.partyInvite.insert({
      id: 0n,
      partyId,
      joinerIdentity: target.identity,
      recipientIdentity: target.identity,
      kind: 'invite',
      createdAt: ctx.timestamp,
    });
  }
);

// DEV/TEST: synthetic bot players so party features (cap 4/4, leave, promote,
// disband) can be exercised solo. Each bot is a normal ONLINE player row parked
// in a spread ring around spawn (NOT a puppet — puppets all chase you and stack
// into one blob), so you can tap each in-game and invite it through the real UI.
// Fixed high-nibble identities keep bots out of any real identity space; clear
// them with debugClearBots. Local only.
const BOT_ID_BASE = BigInt('0x' + 'b0'.repeat(31) + '00'); // 64 hex digits, top nibble 0xb
const MAX_BOTS = 8;
function botIdentity(i: number): any {
  return new Identity(BOT_ID_BASE + BigInt(i));
}

// Resolve every pending invite addressed to a bot into an actual membership,
// respecting the 4/4 cap. Shared by the world tick (auto-accept each frame) and
// the debugBotsAccept reducer (one-shot). Bots-only so real players still accept
// through the normal flow. Cheap: partyInvite is tiny and this no-ops with no bots.
function autoAcceptBotInvites(ctx: { db: any; timestamp: any }): void {
  const invites = [...ctx.db.partyInvite.iter()];
  if (invites.length === 0) return;
  const botHexes = new Set<string>();
  for (let i = 0; i < MAX_BOTS; i++) botHexes.add(botIdentity(i).toHexString());
  for (const inv of invites) {
    // A bot can't click, so it auto-resolves anything it is the RECIPIENT of.
    if (!botHexes.has(inv.recipientIdentity.toHexString())) continue;
    ctx.db.partyInvite.id.delete(inv.id);
    const joiner = inv.joinerIdentity;
    const party = ctx.db.party.id.find(inv.partyId);
    if (!party) continue; // party gone
    if (inv.kind === 'promote') {
      // A member asked the (bot) leader to hand over the crown — approve it.
      const promoted = ctx.db.partyMember.identity.find(joiner);
      if (promoted && promoted.partyId === inv.partyId && party.leaderIdentity.equals(inv.recipientIdentity))
        ctx.db.party.id.update({ ...party, leaderIdentity: joiner });
      continue;
    }
    // 'invite' (bot joins my party) or 'request' (I join the bot's party): add joiner.
    if (ctx.db.partyMember.identity.find(joiner)) continue; // already partied
    if ([...ctx.db.partyMember.partyId.filter(inv.partyId)].length >= RAID_PARTY_SIZE) continue;
    ctx.db.partyMember.insert({
      id: 0n,
      partyId: inv.partyId,
      identity: joiner,
      joinedAt: ctx.timestamp,
    });
  }
}

export const debugSpawnBots = spacetimedb.reducer(
  { count: t.i32() },
  (ctx, { count }) => {
    const n = Math.max(1, Math.min(MAX_BOTS, count));
    for (let i = 0; i < n; i++) {
      const identity = botIdentity(i);
      if (ctx.db.player.identity.find(identity)) continue; // already spawned
      const angle = (i / MAX_BOTS) * Math.PI * 2;
      ctx.db.player.insert({
        identity,
        name: `Bot${i + 1}`,
        online: true,
        positionX: SPAWN_X + Math.cos(angle) * 5,
        positionY: 0,
        positionZ: SPAWN_Z + Math.sin(angle) * 5,
        rotationY: 0,
        activeCharacterId: STARTER_CHARACTER_ID,
        partyOrder: [STARTER_CHARACTER_ID],
        gems: 0,
        currentHealth: statsFor(STARTER_CHARACTER_ID).maxHealth,
        lastKillRewardAt: ctx.timestamp,
        gemsFromKills: 0,
        gemsCollected: 0,
        transcendShards: 0,
        skillReadyAtMicros: 0n,
        skillWindowEndsAtMicros: 0n,
        stunnedUntilMicros: 0n,
      });
    }
  }
);

// DEV/TEST: one-shot version of the world tick's bot-invite auto-accept, for
// forcing pending bot invites to join immediately without waiting a tick. Local only.
export const debugBotsAccept = spacetimedb.reducer(ctx => {
  autoAcceptBotInvites(ctx);
});

// DEV/TEST: make bot `fromName` ask to join the party of member `toName`, with
// toName as the request recipient — so if toName is a NON-leader you can exercise
// the "nodot vadonim" (forward-to-leader) toast solo. Bot joiner → the world tick
// auto-accepts once the request reaches the leader. Local only.
export const debugRequest = spacetimedb.reducer(
  { fromName: t.string(), toName: t.string() },
  (ctx, { fromName, toName }) => {
    const roster0 = [...ctx.db.player.iter()];
    const joiner = roster0.find(p => p.name === fromName);
    const recipient = roster0.find(p => p.name === toName);
    if (!joiner || !recipient) throw new SenderError('Player name not found');
    if (ctx.db.partyMember.identity.find(joiner.identity))
      throw new SenderError(`${joiner.name} jau ir barā`);
    const mem = ctx.db.partyMember.identity.find(recipient.identity);
    if (!mem) throw new SenderError(`${recipient.name} nav barā`);
    if ([...ctx.db.partyMember.partyId.filter(mem.partyId)].length >= RAID_PARTY_SIZE)
      throw new SenderError('Bars ir pilns (4/4)');
    const dupe = [...ctx.db.partyInvite.partyId.filter(mem.partyId)].some(inv =>
      inv.joinerIdentity.equals(joiner.identity)
    );
    if (dupe) return;
    ctx.db.partyInvite.insert({
      id: 0n,
      partyId: mem.partyId,
      joinerIdentity: joiner.identity,
      recipientIdentity: recipient.identity,
      kind: 'request',
      createdAt: ctx.timestamp,
    });
  }
);

// DEV/TEST: flip a player's online flag by name to simulate a disconnect/reconnect
// without closing a tab — for verifying a member stays in the party while offline
// (roster shows them dimmed) and returns online in the same party. Local only.
export const debugSetOnline = spacetimedb.reducer(
  { name: t.string(), online: t.bool() },
  (ctx, { name, online }) => {
    const target = [...ctx.db.player.iter()].find(p => p.name === name);
    if (!target) throw new SenderError('No player with that name');
    ctx.db.player.identity.update({ ...target, online });
  }
);

// DEV/TEST: remove every spawned bot and any party state they left behind.
export const debugClearBots = spacetimedb.reducer(ctx => {
  for (let i = 0; i < MAX_BOTS; i++) {
    const identity = botIdentity(i);
    // Drop pending invites addressed to / raised by the bot.
    for (const inv of [...ctx.db.partyInvite.iter()]) {
      if (inv.joinerIdentity.equals(identity) || inv.recipientIdentity.equals(identity))
        ctx.db.partyInvite.id.delete(inv.id);
    }
    // Drop the bot's party membership; if it led a party, hand the crown to the
    // oldest remaining member, or delete the party when it empties.
    const mem = ctx.db.partyMember.identity.find(identity);
    if (mem) {
      ctx.db.partyMember.id.delete(mem.id);
      const party = ctx.db.party.id.find(mem.partyId);
      if (party) {
        const remaining = [...ctx.db.partyMember.partyId.filter(mem.partyId)].sort((a, b) =>
          a.joinedAt.microsSinceUnixEpoch < b.joinedAt.microsSinceUnixEpoch ? -1 : 1
        );
        if (remaining.length === 0) {
          ctx.db.party.id.delete(mem.partyId);
        } else if (party.leaderIdentity.equals(identity)) {
          ctx.db.party.id.update({ ...party, leaderIdentity: remaining[0].identity });
        }
      }
    }
    if (ctx.db.puppet.identity.find(identity)) ctx.db.puppet.identity.delete(identity);
    if (ctx.db.player.identity.find(identity)) ctx.db.player.identity.delete(identity);
  }
});

// The heart of the server-authoritative fight. Each tick: spawn/retire goliaths,
// move everyone, resolve REAL contact damage (goliaths grind camps, camps grind
// back, aggroed enemies bite the player), pay out deaths, vacuum loose gems, and
// respawn cleared camp members. No dice — outcomes are pure HP attrition.
export const worldTick = spacetimedb.reducer(
  { timer: worldTimer.rowType },
  ctx => {
    const now = ctx.timestamp.microsSinceUnixEpoch;
    const tick = WORLD_TICK_INTERVAL_MICROS;

    // DEV: headless bots can't click "accept", so auto-resolve any invite aimed
    // at a bot into a membership (respecting the 4/4 cap) — bots join instantly
    // like a real player accepting. No-op in prod (no bot rows exist there).
    autoAcceptBotInvites(ctx);

    const enemiesBefore = [...ctx.db.enemy.iter()];
    const campCenters = campCentersFrom(enemiesBefore);
    runGoliathLifecycle(ctx, now, campCenters);

    const enemies = [...ctx.db.enemy.iter()].filter(enemyRow => enemyRow.alive);
    const goliaths = [...ctx.db.goliath.iter()].filter(goliathRow => goliathRow.alive);
    const players = [...ctx.db.player.iter()].filter(playerRow => playerRow.online);
    const playerByHex = new Map<string, any>();
    for (const playerRow of players) playerByHex.set(playerRow.identity.toHexString(), playerRow);

    // Puppet pass (DEV) — server-driven training dummies chase the nearest real
    // player, reusing the same stepToward + walkable guard as enemies.
    const puppetHexes = new Set([...ctx.db.puppet.iter()].map(p => p.identity.toHexString()));
    if (puppetHexes.size > 0) {
      const realPlayers = players.filter(p => !puppetHexes.has(p.identity.toHexString()));
      for (const pupHex of puppetHexes) {
        const pup = playerByHex.get(pupHex);
        if (!pup) continue;
        let nearest: any = null;
        let nearestDistance = Infinity;
        for (const rp of realPlayers) {
          const d = distanceBetween(pup.positionX, pup.positionZ, rp.positionX, rp.positionZ);
          if (d < nearestDistance) {
            nearestDistance = d;
            nearest = rp;
          }
        }
        if (!nearest || nearestDistance <= PUPPET_STOP_RADIUS) continue;
        const moved = stepToward(
          pup.positionX,
          pup.positionZ,
          nearest.positionX,
          nearest.positionZ,
          PUPPET_SPEED * (Number(tick) / 1_000_000)
        );
        const nx = clampToWorld(moved.x);
        const nz = clampToWorld(moved.z);
        if (!isWalkable(nx, nz)) continue;
        ctx.db.player.identity.update({
          ...pup,
          positionX: nx,
          positionZ: nz,
          rotationY: Math.atan2(nearest.positionX - pup.positionX, nearest.positionZ - pup.positionZ),
        });
      }
    }

    // Pass 1 — goliaths raid a STABLE camp target (chasing a provoker takes over).
    const goliathTarget = new Map<bigint, number>();
    const goliathPosition = new Map<bigint, { x: number; z: number }>();
    const goliathEngageEnds = new Map<bigint, bigint>();
    const goliathLastRaided = new Map<bigint, number>();
    const goliathHeading = new Map<bigint, { x: number; z: number }>();
    // Tick-start goliath bodies for mutual-avoidance steering: two raiders on
    // the same path arc around each other (deterministic sides by id) instead
    // of shoving. <= 3 raiders per window, so the O(n) nearest scan inside
    // steeredStep is a handful of hypots — no spatial hash (see steering.ts).
    const goliathObstacles = goliaths.map(otherGoliath => ({
      id: otherGoliath.goliathId,
      x: otherGoliath.positionX,
      z: otherGoliath.positionZ,
      radius: GOLIATH_SIZE_STATS[Math.min(Math.max(otherGoliath.sizeIndex, 0), GOLIATH_SIZE_STATS.length - 1)].collisionRadius,
    }));
    for (const goliathRow of goliaths) {
      const speed = goliathRow.moveSpeed * (Number(tick) / 1_000_000);
      const collisionRadius =
        GOLIATH_SIZE_STATS[Math.min(Math.max(goliathRow.sizeIndex, 0), GOLIATH_SIZE_STATS.length - 1)].collisionRadius;
      const fromX = goliathRow.positionX;
      const fromZ = goliathRow.positionZ;
      // Provoked → drop the raid and chase the player who hit it for the 5s aggro.
      const chasedPlayer =
        !aggroExpired(goliathRow.aggroExpiresAtMicros, now) && goliathRow.aggroPlayer
          ? playerByHex.get(goliathRow.aggroPlayer.toHexString())
          : undefined;
      if (chasedPlayer) {
        // Route along bridges instead of walking straight at the player (which
        // would send the raider off the island into the void). The raid timer is
        // paused (engage 0, target -1) but heading still tracks the real step.
        const waypoint = nextGoliathWaypoint(fromX, fromZ, chasedPlayer.positionX, chasedPlayer.positionZ);
        const moved = steeredStep(goliathRow.goliathId, fromX, fromZ, waypoint.x, waypoint.z, speed, collisionRadius, goliathObstacles);
        const toX = clampToWorld(moved.x);
        const toZ = clampToWorld(moved.z);
        goliathTarget.set(goliathRow.goliathId, -1);
        goliathPosition.set(goliathRow.goliathId, { x: toX, z: toZ });
        goliathEngageEnds.set(goliathRow.goliathId, 0n);
        goliathLastRaided.set(goliathRow.goliathId, goliathRow.lastRaidedCampIndex);
        goliathHeading.set(goliathRow.goliathId, headingFromStep(fromX, fromZ, toX, toZ, goliathRow.headingX, goliathRow.headingZ));
        continue;
      }

      // Hold the current camp until it is cleared or the raid timer elapses; only
      // then re-pick, excluding the camp just left so it moves on instead of
      // re-locking a respawning camp it already raided.
      const previousTarget = goliathRow.targetCampIndex;
      const target = chooseGoliathTargetCamp(previousTarget, goliathRow.lastRaidedCampIndex, campCenters, fromX, fromZ);
      let lastRaided = goliathRow.lastRaidedCampIndex;
      // The timer only starts on arrival at a NEW camp, so reset it on any switch.
      let engageEnds = target === previousTarget ? goliathRow.engageEndsAtMicros : 0n;

      if (target === -1) {
        // No living camp left: stand still, keep facing where it last walked.
        goliathTarget.set(goliathRow.goliathId, -1);
        goliathPosition.set(goliathRow.goliathId, { x: fromX, z: fromZ });
        goliathEngageEnds.set(goliathRow.goliathId, engageEnds);
        goliathLastRaided.set(goliathRow.goliathId, lastRaided);
        goliathHeading.set(goliathRow.goliathId, { x: goliathRow.headingX, z: goliathRow.headingZ });
        continue;
      }

      const center = campCenters.find(camp => camp.campIndex === target)!;
      const reached = hasReachedCamp(distanceBetween(fromX, fromZ, center.x, center.z), GOLIATH_STOP_RADIUS);
      let toX = fromX;
      let toZ = fromZ;
      if (!reached) {
        // Route along bridges toward the camp so the raider stays on walkable ground.
        const waypoint = nextGoliathWaypoint(fromX, fromZ, center.x, center.z);
        const moved = steeredStep(goliathRow.goliathId, fromX, fromZ, waypoint.x, waypoint.z, speed, collisionRadius, goliathObstacles);
        toX = clampToWorld(moved.x);
        toZ = clampToWorld(moved.z);
      }

      // Arrived → start the raid timer; timer elapsed → this camp is done, drop the
      // target and remember it so the next pick skips it.
      if (reached && engageEnds === 0n) engageEnds = now + GOLIATH_ENGAGE_DURATION_MICROS;
      let appliedTarget = target;
      if (engageEnds !== 0n && now >= engageEnds) {
        lastRaided = target;
        appliedTarget = -1;
        engageEnds = 0n;
      }

      goliathTarget.set(goliathRow.goliathId, appliedTarget);
      goliathPosition.set(goliathRow.goliathId, { x: toX, z: toZ });
      goliathEngageEnds.set(goliathRow.goliathId, engageEnds);
      goliathLastRaided.set(goliathRow.goliathId, lastRaided);
      goliathHeading.set(goliathRow.goliathId, headingFromStep(fromX, fromZ, toX, toZ, goliathRow.headingX, goliathRow.headingZ));
    }
    const goliathById = new Map<bigint, any>();
    for (const goliathRow of goliaths) goliathById.set(goliathRow.goliathId, goliathRow);

    // Player-directed damage from slime slams (pass 2), strikes (attack FSM
    // below), and enemy bites (pass 4) accumulates in ONE map so the single
    // apply loop at the bottom (resist 'contact' → death → spill → respawn)
    // stays the only damage sink. Goliath-directed damage (slime slams + pass-4
    // bites) likewise sums here and applies once in the goliath loop.
    const playerDamage = new Map<string, number>();
    const goliathDamage = new Map<bigint, number>();

    // Pass 2 — enemy movement (enemyMovement.ts): slimes bounce on a micros hop
    // cycle and slam on landing, wisps/golems walk with steering, idle members
    // patrol their camp ring. Landing damage lands in the shared maps above.
    const enemyPosition = moveEnemies(ctx, now, tick, enemies, goliaths, goliathPosition, playerByHex, playerDamage, goliathDamage);

    // Goliath→enemy damage + hard-aggro maps are shared by the attack FSM
    // (skill strikes) and pass 3 (contact drain) — one apply loop consumes both.
    const enemyDamage = new Map<bigint, number>();
    const enemyHardAggroGoliath = new Map<bigint, bigint>();

    // Attack FSM pass (FSM-01): windup → strike → recovery for every live
    // goliath. Runs AFTER the position-build passes — it overrides entries in
    // goliathPosition/goliathHeading (root during windup, leap at strike) that
    // the goliath apply loop persists — and BEFORE every damage consumer, so
    // slam damage lands in playerDamage ahead of the single apply (ATK-05:
    // strikes are now the ONLY goliath→player damage source; the old per-tick
    // contact drain is deleted). With no player aggro the FSM aims the same
    // skills at the nearest living camp member, and every strike also damages
    // the members caught in its hitbox (raids fought with real attacks).
    runUnitAttacks(ctx, now, tick, goliaths, goliathPosition, goliathHeading, playerByHex, playerDamage, {
      enemies,
      enemyPosition,
      enemyDamage,
      enemyHardAggroGoliath,
      damageMultiplier: GOLIATH_VS_ENEMY_DAMAGE_MULTIPLIER,
      engageRange: GOLIATH_ENGAGE_RANGE,
    });

    // Pass 3 — goliaths raid the camp. Proximity RALLIES every nearby member to
    // defend (soft aggro); the STRIKE lands on all members in splash range for the
    // largest raider, else on its nearest member. A member that actually takes a
    // hit gets a HARD aggro flip (a real "damaged by" event that can steal it from
    // a player), whereas a mere rally never steals a member mid-fight with a player.
    const enemyRallyGoliath = new Map<bigint, bigint>();
    for (const goliathRow of goliaths) {
      const from = goliathPosition.get(goliathRow.goliathId)!;
      const heading = goliathHeading.get(goliathRow.goliathId)!;
      const withDistance = enemies.map(enemyRow => {
        const to = enemyPosition.get(enemyRow.enemyId)!;
        return { enemyRow, to, distance: distanceBetween(from.x, from.z, to.x, to.z) };
      });
      // The raider only engages the camp it is FACING: gate both rally and strike
      // on a frontal arc of its heading so a camp it has turned its back on (while
      // walking to the next one) stops being fought and simply loses interest.
      const facing = withDistance.filter(candidate =>
        isWithinForwardArc(heading.x, heading.z, from.x, from.z, candidate.to.x, candidate.to.z, GOLIATH_FACING_ARC_MIN_DOT)
      );
      for (const { enemyRow, distance } of facing) {
        if (distance <= GOLIATH_ENGAGE_RANGE) enemyRallyGoliath.set(enemyRow.enemyId, goliathRow.goliathId);
      }
      const dealt = damagePerTick(goliathRow.contactDamage * GOLIATH_VS_ENEMY_DAMAGE_MULTIPLIER, tick);
      const struck = goliathRow.splashes
        ? facing.filter(candidate => candidate.distance <= GOLIATH_SPLASH_RANGE)
        : facing.filter(candidate => candidate.distance <= ENEMY_GOLIATH_CONTACT_RANGE).sort((a, b) => a.distance - b.distance).slice(0, 1);
      for (const { enemyRow } of struck) {
        enemyDamage.set(enemyRow.enemyId, (enemyDamage.get(enemyRow.enemyId) ?? 0) + dealt);
        enemyHardAggroGoliath.set(enemyRow.enemyId, goliathRow.goliathId);
      }
    }

    // Pass 4 — WALKING enemies bite back per tick: an enemy aggroed to a
    // goliath (in reach) hurts it; one aggroed to a player (in reach, player
    // outside the safe zone) hurts the player. Slimes are excluded — their only
    // damage is the hop-landing slam resolved in pass 2.
    for (const enemyRow of enemies) {
      if (isSlimeArchetype(enemyRow.archetypeId)) continue;
      const expired = aggroExpired(enemyRow.aggroExpiresAtMicros, now);
      if (expired) continue;
      const from = enemyPosition.get(enemyRow.enemyId)!;
      if (enemyRow.aggroKind === AGGRO_GOLIATH) {
        const chased = goliathById.get(enemyRow.aggroGoliathId);
        if (!chased) continue;
        const chasedPos = goliathPosition.get(chased.goliathId)!;
        if (distanceBetween(from.x, from.z, chasedPos.x, chasedPos.z) > ENEMY_GOLIATH_CONTACT_RANGE) continue;
        goliathDamage.set(chased.goliathId, (goliathDamage.get(chased.goliathId) ?? 0) + damagePerTick(enemyRow.contactDamage, tick));
      } else if (enemyRow.aggroKind === AGGRO_PLAYER && enemyRow.aggroPlayer) {
        const hex = enemyRow.aggroPlayer.toHexString();
        const chased = playerByHex.get(hex);
        if (!chased || isInsideSafeZone(chased.positionX, chased.positionZ)) continue;
        if (distanceBetween(from.x, from.z, chased.positionX, chased.positionZ) > ENEMY_PLAYER_CONTACT_RANGE) continue;
        playerDamage.set(hex, (playerDamage.get(hex) ?? 0) + damagePerTick(enemyRow.contactDamage, tick));
      }
    }

    // Nearest open-field (non-safe-zone) player within aggro range, or null.
    const nearestOpenPlayer = (x: number, z: number) => {
      let best: any = null;
      let bestDistance = ENEMY_AGGRO_RANGE;
      for (const playerRow of players) {
        if (isInsideSafeZone(playerRow.positionX, playerRow.positionZ)) continue;
        const distance = distanceBetween(x, z, playerRow.positionX, playerRow.positionZ);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = playerRow;
        }
      }
      return best;
    };

    // The player a nearby same-camp member is already fighting, so its aggro can
    // jump to this member (contagion). Reads tick-start aggro from `enemies`, so
    // the infection spreads one hop per tick — a virus, not an instant camp-wide flip.
    const aggroInfectorTarget = (x: number, z: number, campIndex: number) => {
      for (const other of enemies) {
        if (other.campIndex !== campIndex) continue;
        if (other.aggroKind !== AGGRO_PLAYER || !other.aggroPlayer) continue;
        if (aggroExpired(other.aggroExpiresAtMicros, now)) continue;
        const otherPosition = enemyPosition.get(other.enemyId) ?? { x: other.positionX, z: other.positionZ };
        if (distanceBetween(x, z, otherPosition.x, otherPosition.z) <= ENEMY_AGGRO_SPREAD_RANGE) {
          return other.aggroPlayer;
        }
      }
      return undefined;
    };

    // Apply enemy movement + damage + aggro; dead members drop loot (uncredited,
    // droppedBy the module identity) and schedule a respawn.
    for (const enemyRow of enemies) {
      const move = enemyPosition.get(enemyRow.enemyId)!;
      const moved = {
        ...enemyRow,
        positionX: move.x,
        positionZ: move.z,
        hopStartedAtMicros: move.hopStartedAtMicros,
        hopDurationMicros: move.hopDurationMicros,
        hopTargetX: move.hopTargetX,
        hopTargetZ: move.hopTargetZ,
        patrolTargetX: move.patrolTargetX,
        patrolTargetZ: move.patrolTargetZ,
        restUntilMicros: move.restUntilMicros,
      };
      const damage = Math.round(enemyDamage.get(enemyRow.enemyId) ?? 0);
      if (damage >= enemyRow.health) {
        killEnemyRow(ctx, moved, enemyBaseGems(false, 0, enemyRow.rewardTier, enemyRow.isBoss), ctx.sender, now);
        continue;
      }
      const hardGoliath = enemyHardAggroGoliath.get(enemyRow.enemyId);
      const rallyGoliath = enemyRallyGoliath.get(enemyRow.enemyId);
      const expired = aggroExpired(enemyRow.aggroExpiresAtMicros, now);
      const livePlayerAggro = enemyRow.aggroKind === AGGRO_PLAYER && !!enemyRow.aggroPlayer && !expired;
      let aggroKind = enemyRow.aggroKind;
      let aggroPlayer = enemyRow.aggroPlayer;
      let aggroGoliathId = enemyRow.aggroGoliathId;
      let aggroExpiresAtMicros = enemyRow.aggroExpiresAtMicros;
      if (hardGoliath !== undefined) {
        // Took a real hit → fights this goliath (last damager wins, even over a player).
        aggroKind = AGGRO_GOLIATH;
        aggroPlayer = undefined;
        aggroGoliathId = hardGoliath;
        aggroExpiresAtMicros = now + AGGRO_DURATION_MICROS;
      } else if (livePlayerAggro) {
        // A player hit it recently → keep chasing them; a raider's mere presence
        // never steals a member mid-fight with a player.
      } else if (rallyGoliath !== undefined) {
        aggroKind = AGGRO_GOLIATH;
        aggroPlayer = undefined;
        aggroGoliathId = rallyGoliath;
        aggroExpiresAtMicros = now + AGGRO_DURATION_MICROS;
      } else {
        // No goliath fight and no live player aggro. Two ways a member turns
        // hostile: a nearby open-field player provokes it directly (rolled per
        // tick), or the aggro spreads from a same-camp member already fighting
        // someone (contagion). Otherwise, if the old aggro expired, drift home.
        const provoker = nearestOpenPlayer(moved.positionX, moved.positionZ);
        const infectorTarget = provoker
          ? undefined
          : aggroInfectorTarget(moved.positionX, moved.positionZ, enemyRow.campIndex);
        const caughtPlayer =
          provoker && ctx.random() < ENEMY_PROXIMITY_AGGRO_CHANCE
            ? provoker.identity
            : infectorTarget && ctx.random() < ENEMY_AGGRO_SPREAD_CHANCE
              ? infectorTarget
              : undefined;
        if (caughtPlayer) {
          aggroKind = AGGRO_PLAYER;
          aggroPlayer = caughtPlayer;
          aggroGoliathId = 0n;
          aggroExpiresAtMicros = now + AGGRO_DURATION_MICROS;
        } else if (expired) {
          aggroKind = AGGRO_HOME;
          aggroPlayer = undefined;
          aggroGoliathId = 0n;
          aggroExpiresAtMicros = 0n;
        }
      }
      const newHealth = enemyRow.health - damage;
      const unchanged =
        moved.positionX === enemyRow.positionX &&
        moved.positionZ === enemyRow.positionZ &&
        moved.hopStartedAtMicros === enemyRow.hopStartedAtMicros &&
        moved.hopDurationMicros === enemyRow.hopDurationMicros &&
        moved.hopTargetX === enemyRow.hopTargetX &&
        moved.hopTargetZ === enemyRow.hopTargetZ &&
        moved.patrolTargetX === enemyRow.patrolTargetX &&
        moved.patrolTargetZ === enemyRow.patrolTargetZ &&
        moved.restUntilMicros === enemyRow.restUntilMicros &&
        newHealth === enemyRow.health &&
        aggroKind === enemyRow.aggroKind &&
        aggroGoliathId === enemyRow.aggroGoliathId &&
        aggroExpiresAtMicros === enemyRow.aggroExpiresAtMicros &&
        sameOptionalIdentity(aggroPlayer, enemyRow.aggroPlayer);
      if (unchanged) continue;
      ctx.db.enemy.enemyId.update({ ...moved, health: newHealth, aggroKind, aggroPlayer, aggroGoliathId, aggroExpiresAtMicros });
    }

    // Apply goliath movement + damage; a goliath worn to 0 dies for the window.
    for (const goliathRow of goliaths) {
      const position = goliathPosition.get(goliathRow.goliathId)!;
      const heading = goliathHeading.get(goliathRow.goliathId)!;
      const moved = {
        ...goliathRow,
        positionX: position.x,
        positionZ: position.z,
        targetCampIndex: goliathTarget.get(goliathRow.goliathId) ?? -1,
        engageEndsAtMicros: goliathEngageEnds.get(goliathRow.goliathId) ?? 0n,
        lastRaidedCampIndex: goliathLastRaided.get(goliathRow.goliathId) ?? -1,
        headingX: heading.x,
        headingZ: heading.z,
      };
      const damage = Math.round(goliathDamage.get(goliathRow.goliathId) ?? 0);
      if (damage >= goliathRow.health) {
        killGoliathRow(ctx, moved, ctx.sender);
        continue;
      }
      const cleared = aggroExpired(goliathRow.aggroExpiresAtMicros, now);
      const newHealth = goliathRow.health - damage;
      const newAggroPlayer = cleared ? undefined : goliathRow.aggroPlayer;
      const newExpires = cleared ? 0n : goliathRow.aggroExpiresAtMicros;
      const unchanged =
        moved.positionX === goliathRow.positionX &&
        moved.positionZ === goliathRow.positionZ &&
        moved.targetCampIndex === goliathRow.targetCampIndex &&
        moved.engageEndsAtMicros === goliathRow.engageEndsAtMicros &&
        moved.lastRaidedCampIndex === goliathRow.lastRaidedCampIndex &&
        moved.headingX === goliathRow.headingX &&
        moved.headingZ === goliathRow.headingZ &&
        newHealth === goliathRow.health &&
        newExpires === goliathRow.aggroExpiresAtMicros &&
        sameOptionalIdentity(newAggroPlayer, goliathRow.aggroPlayer);
      if (unchanged) continue;
      ctx.db.goliath.goliathId.update({
        ...moved,
        health: newHealth,
        aggroPlayer: newAggroPlayer,
        aggroExpiresAtMicros: newExpires,
      });
    }

    // Apply summed player damage: a killed player spills PVE loot and respawns.
    for (const [hex, rawDamage] of playerDamage) {
      const targetPlayer = ctx.db.player.identity.find(playerByHex.get(hex).identity);
      if (!targetPlayer || isInsideSafeZone(targetPlayer.positionX, targetPlayer.positionZ)) continue;
      // Active character's resistances soften enemy/goliath melee (contact channel).
      const resisted = resistedDamage(
        Math.round(rawDamage),
        PLAYER_RESISTANCES[targetPlayer.activeCharacterId],
        'contact'
      );
      const damage = Math.min(resisted, targetPlayer.currentHealth);
      const remaining = targetPlayer.currentHealth - damage;
      if (remaining > 0) {
        setActiveHealth(ctx, targetPlayer, remaining);
        continue;
      }
      const spilled = spillGems(ctx, targetPlayer, PVE_DEATH_SPILL, ctx.sender);
      // Same additive shard penalty as takeDamage — a carried shard falls at the death
      // spot (droppedBy = the dying player); a shard-less death erodes transcend then C.
      const activeOwned = findOwnedRow(ctx, targetPlayer, targetPlayer.activeCharacterId);
      const result = applyDeathShardPenalty(
        targetPlayer.transcendShards,
        activeOwned ? activeOwned.transcendLevel : 0,
        activeOwned ? activeOwned.constellation : 0,
        SHARD_DEATH_LOSS
      );
      if (result.shardsLost > 0) {
        spillShards(ctx, targetPlayer.positionX, targetPlayer.positionZ, result.shardsLost, targetPlayer.identity);
      }
      if (activeOwned && (result.erodedTranscend || result.erodedConstellation)) {
        ctx.db.ownedCharacter.id.update({
          ...activeOwned,
          transcendLevel: result.nextTranscendLevel,
          constellation: result.nextConstellation,
        });
      }
      respawnPlayerAtSpawn(ctx, {
        ...targetPlayer,
        gems: targetPlayer.gems - spilled,
        transcendShards: result.nextShards,
      });
    }

    vacuumGems(ctx, now);
    respawnEnemies(ctx, now);
  }
);

export const init = spacetimedb.init(ctx => {
  ctx.db.regenTimer.insert({
    scheduled_id: 0n,
    scheduled_at: ScheduleAt.interval(REGEN_INTERVAL_MICROS),
  });
  ensureWorldTickScheduled(ctx);
  spawnCamps(ctx);
});

// Activates the world sim on an EXISTING database where init won't re-run
// (e.g. publishing new tables to maincloud without wiping player data).
// Idempotent: schedules the tick only if unscheduled and seeds camps only if
// the enemy table is empty, so it is safe to call more than once.
export const seedWorld = spacetimedb.reducer(ctx => {
  ensureWorldTickScheduled(ctx);
  spawnCamps(ctx);
});

// ---- Dev/test harness reducers (perf playtests) ------------------------------
// Called from the CLI / test scripts, never from game UI. They exist so an
// automated combat playtest can build a maxed roster and force a full goliath
// batch on demand instead of waiting out the 5-minute spawn window.

const DEBUG_LOADOUT_CHARACTERS = ['terron', 'glacia', 'nereida', 'ignis'];

// Grants the owner four maxed 5★ characters (C6, B10, full HP) and sets them
// as the active party, so a test player survives a multi-goliath fight.
export const debugGrantLoadout = spacetimedb.reducer(
  { owner: t.identity() },
  (ctx, { owner }) => {
    for (const characterId of DEBUG_LOADOUT_CHARACTERS) {
      const maxHealth = statsFor(characterId).maxHealth;
      const owned = [...ctx.db.ownedCharacter.owner.filter(owner)].find(
        (row: any) => row.characterId === characterId
      );
      if (owned) {
        ctx.db.ownedCharacter.id.update({
          ...owned,
          constellation: MAX_CONSTELLATION,
          transcendLevel: MAX_TRANSCEND_LEVEL,
          currentHealth: maxHealth,
        });
      } else {
        ctx.db.ownedCharacter.insert({
          id: 0n,
          owner,
          characterId,
          currentHealth: maxHealth,
          constellation: MAX_CONSTELLATION,
          transcendLevel: MAX_TRANSCEND_LEVEL,
        });
      }
      setActivation(ctx, owner, characterId, MAX_CONSTELLATION);
    }
    const existingPlayer = ctx.db.player.identity.find(owner);
    if (existingPlayer) {
      ctx.db.player.identity.update({
        ...existingPlayer,
        partyOrder: DEBUG_LOADOUT_CHARACTERS,
        activeCharacterId: DEBUG_LOADOUT_CHARACTERS[0],
        currentHealth: statsFor(DEBUG_LOADOUT_CHARACTERS[0]).maxHealth,
      });
    }
  }
);

// Replaces the current goliath batch with one raider of EVERY size around the
// given point — the "3 golems at once" worst case the fps playtest measures.
export const debugSpawnGoliaths = spacetimedb.reducer(
  { x: t.f64(), z: t.f64() },
  (ctx, { x, z }) => {
    const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
    const windowBucket = windowBucketFor(nowMicros, GOLIATH_BATCH_WINDOW_MICROS);
    for (const goliathRow of [...ctx.db.goliath.iter()]) {
      ctx.db.goliath.goliathId.delete(goliathRow.goliathId);
    }
    GOLIATH_SIZE_STATS.forEach((stats, sizeIndex) => {
      const angle = (sizeIndex / GOLIATH_SIZE_STATS.length) * Math.PI * 2;
      ctx.db.goliath.insert({
        goliathId: GOLIATH_SLOT_ID_BASE + BigInt(sizeIndex + 1),
        sizeIndex,
        positionX: clampToWorld(x + Math.cos(angle) * 6),
        positionZ: clampToWorld(z + Math.sin(angle) * 6),
        health: stats.maxHealth,
        maxHealth: stats.maxHealth,
        contactDamage: stats.contactDamage,
        moveSpeed: stats.moveSpeed,
        splashes: stats.splashesOnAttack,
        carriedGems: 0,
        targetCampIndex: -1,
        engageEndsAtMicros: 0n,
        lastRaidedCampIndex: -1,
        headingX: 0,
        headingZ: 0,
        aggroPlayer: undefined,
        aggroExpiresAtMicros: 0n,
        alive: true,
        windowBucket,
      });
    });
  }
);

export const onConnect = spacetimedb.clientConnected(ctx => {
  const canonical = accountIdentity(ctx);
  if (!canonical) return; // anonymous device, not logged in yet
  const existingPlayer = ctx.db.player.identity.find(canonical);
  if (!existingPlayer) return;
  ctx.db.player.identity.update({ ...existingPlayer, online: true });
});

export const onDisconnect = spacetimedb.clientDisconnected(ctx => {
  const canonical = accountIdentity(ctx);
  if (!canonical) return;
  const existingPlayer = ctx.db.player.identity.find(canonical);
  if (!existingPlayer) return;
  ctx.db.player.identity.update({ ...existingPlayer, online: false });
});
