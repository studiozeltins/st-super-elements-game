import { schema, t, table, SenderError } from 'spacetimedb/server';
import { ScheduleAt } from 'spacetimedb';

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
  healType: HealType;
  healMode: HealMode;
  healPower: number;
}
const NO_HEAL = { healType: 'none' as HealType, healMode: 'flat' as HealMode, healPower: 0 };
const CHARACTER_STATS: Record<string, CharacterStat> = {
  aeris: { stars: 5, maxHealth: 950, healthRegen: 0, ...NO_HEAL },
  terron: { stars: 5, maxHealth: 1400, healthRegen: 0, ...NO_HEAL },
  volta: { stars: 5, maxHealth: 1000, healthRegen: 0, ...NO_HEAL },
  silva: { stars: 5, maxHealth: 1050, healthRegen: 8, ...NO_HEAL },
  // Marina: active healer — her water ring heals the whole party for 20% of each pool.
  marina: { stars: 5, maxHealth: 1150, healthRegen: 12, healType: 'active', healMode: 'percent', healPower: 0.2 },
  ignis: { stars: 5, maxHealth: 1300, healthRegen: 0, ...NO_HEAL },
  sarma: { stars: 5, maxHealth: 1000, healthRegen: 0, ...NO_HEAL },
  zefs: { stars: 4, maxHealth: 900, healthRegen: 0, ...NO_HEAL },
  petra: { stars: 4, maxHealth: 1200, healthRegen: 0, ...NO_HEAL },
  zibo: { stars: 4, maxHealth: 1000, healthRegen: 0, ...NO_HEAL },
  // Lapa (dendro): active healer — spore burst heal scales with the combo count.
  lapa: { stars: 4, maxHealth: 950, healthRegen: 15, healType: 'active', healMode: 'combo', healPower: 6 },
  // Rasa (hydro): passive healer — water aura heals the party 10 HP/sec while on field.
  rasa: { stars: 4, maxHealth: 1000, healthRegen: 10, healType: 'passive', healMode: 'flat', healPower: 10 },
  dzirkste: { stars: 4, maxHealth: 1000, healthRegen: 0, ...NO_HEAL },
  stindzis: { stars: 4, maxHealth: 950, healthRegen: 0, ...NO_HEAL },
};
const MAX_COMBO_FOR_HEAL = 50;
const CHARACTER_POOL = Object.entries(CHARACTER_STATS).map(([characterId, s]) => ({
  characterId,
  stars: s.stars,
}));

const STARTER_CHARACTER_ID = 'zibo';
const PARTY_SIZE = 4;
const MAX_CONSTELLATION = 6; // C6 is the cap; duplicates past it refund gems
const HEAL_CONSTELLATION_STEP = 0.15; // healers heal +15% per constellation
const STARTING_PRIMOGEMS = 16000;
const GACHA_PULL_COST = 160;
const DUPLICATE_REFUND = 800;
const KILL_REWARD_PRIMOGEMS = 40;
const MAX_KILL_REWARD_TIER = 3;

// ---- Wish banners + weapon catalog + pity (mirror src/game/data/gacha.ts) ----
const BANNERS: Record<string, { featuredCharacterId: string }> = {
  wind: { featuredCharacterId: 'aeris' },
  flame: { featuredCharacterId: 'ignis' },
  flood: { featuredCharacterId: 'marina' },
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
// Generous, fun rates: multiple 5★ per 10-pull are possible, and every pull
// has a real shot at a character. Pity still guarantees a 4★ within 10.
const FIVE_STAR_BASE_RATE = 0.06;
const SOFT_PITY_START = 74;
const HARD_PITY = 90;
const SOFT_PITY_STEP = 0.06;
const FOUR_STAR_RATE = 0.16;
const FOUR_STAR_PITY = 10;
const FEATURED_5STAR_WIN = 0.5;
const FOUR_STAR_CHARACTER_SHARE = 0.5;
const MAX_PULLS_PER_REQUEST = 10;
// Keep in sync with src/game/data/constants.ts (archipelago extent).
const WORLD_BOUND = 130;
const MOVEMENT_LIMIT = 135;
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
const SAFE_ZONE_RADIUS = 18;
const SPAWN_X = 6;
const SPAWN_Z = 6;
const DEFAULT_MAX_HEALTH = 1000;
const REGEN_INTERVAL_MICROS = 1_000_000n;
const MAX_HIT_DAMAGE = 400;

function statsFor(characterId: string) {
  return CHARACTER_STATS[characterId] ?? { stars: 4 as const, maxHealth: DEFAULT_MAX_HEALTH, healthRegen: 0, ...NO_HEAL };
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
// Bow projectiles fly up to ~45 units; server range check must cover them.
const MAX_HIT_RANGE = 45;
const MAX_STEP_DISTANCE = 12;
const KILL_REWARD_COOLDOWN_MICROS = 1_500_000n;
const GEM_PICKUP_RANGE = 4.2;
const MAX_COMBO_FOR_GEMS = 100;
const COMBO_GEM_STEP = 0.03; // +3% dropped gems per combo point (capped)
const PVP_DEATH_SPILL = 1 / 3; // fraction of primogems a PVP loser drops
const PVE_DEATH_SPILL = 1 / 4; // fraction a player drops when an enemy kills them
const CARRY_HARD_CAP = 20000; // server sanity cap on enemy-carried gems per kill

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
    primogems: t.u32(),
    currentHealth: t.u32(),
    lastKillRewardAt: t.timestamp(),
    // Leaderboard stats: gems this player dropped via kills vs gems they picked
    // up off the ground (others can steal your drops).
    gemsFromKills: t.u32(),
    gemsCollected: t.u32(),
  }
);

// Primogems dropped on the ground by a kill. Any player can walk over and grab
// them; droppedBy records who earned them for the leaderboard.
const gemDrop = table(
  { name: 'gem_drop', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    positionX: t.f32(),
    positionZ: t.f32(),
    amount: t.u32(),
    droppedBy: t.identity(),
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
    // Constellation level 0..6; duplicate pulls raise it and make the character
    // stronger (more damage, and stronger heals for healers).
    constellation: t.u32(),
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

// Weapon inventory — one row per pulled weapon. No combat use yet.
const weaponItem = table(
  { name: 'weapon_item', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity().index('btree'),
    weaponId: t.string(),
    rarity: t.u32(),
    acquiredAt: t.timestamp(),
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
  }
);

// Broadcasts a PVP hit so the victim's client can float a purple number.
const pvpHit = table(
  { name: 'pvp_hit', public: true, event: true },
  {
    target: t.identity(),
    amount: t.u32(),
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

const spacetimedb = schema({
  player,
  gemDrop,
  ownedCharacter,
  skillCast,
  bannerPity,
  weaponItem,
  pullResult,
  pvpHit,
  healEvent,
  regenTimer,
});
export default spacetimedb;

function requirePlayer(ctx: { db: any; sender: any }) {
  const existingPlayer = ctx.db.player.identity.find(ctx.sender);
  if (!existingPlayer) throw new SenderError('Join the game first');
  return existingPlayer;
}

function ownsCharacter(ctx: { db: any; sender: any }, characterId: string) {
  const owned = [...ctx.db.ownedCharacter.owner.filter(ctx.sender)];
  return owned.some(row => row.characterId === characterId);
}

function clampToWorld(coordinate: number) {
  return Math.max(-MOVEMENT_LIMIT, Math.min(MOVEMENT_LIMIT, coordinate));
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

// Spills a fraction of a victim's primogems onto the ground at their location.
// Returns how much was dropped (the caller deducts it from the victim).
function spillGems(ctx: { db: any }, victim: any, fraction: number, droppedBy: any) {
  const amount = Math.floor(victim.primogems * fraction);
  if (amount <= 0) return 0;
  ctx.db.gemDrop.insert({
    id: 0n,
    positionX: clampToWorld(victim.positionX),
    positionZ: clampToWorld(victim.positionZ),
    amount,
    droppedBy,
  });
  return amount;
}

function isInsideSafeZone(positionX: number, positionZ: number) {
  return Math.hypot(positionX, positionZ) <= SAFE_ZONE_RADIUS;
}

function distanceBetweenPlayers(playerA: any, playerB: any) {
  return Math.hypot(
    playerA.positionX - playerB.positionX,
    playerA.positionZ - playerB.positionZ
  );
}

export const joinGame = spacetimedb.reducer(
  { name: t.string() },
  (ctx, { name }) => {
    if (!name.trim()) throw new SenderError('Name must not be empty');

    const existingPlayer = ctx.db.player.identity.find(ctx.sender);
    if (existingPlayer) {
      ctx.db.player.identity.update({ ...existingPlayer, name, online: true });
      return;
    }

    ctx.db.player.insert({
      identity: ctx.sender,
      name,
      online: true,
      positionX: SPAWN_X,
      positionY: 0,
      positionZ: SPAWN_Z,
      rotationY: 0,
      activeCharacterId: STARTER_CHARACTER_ID,
      partyOrder: [STARTER_CHARACTER_ID],
      primogems: STARTING_PRIMOGEMS,
      currentHealth: statsFor(STARTER_CHARACTER_ID).maxHealth,
      lastKillRewardAt: ctx.timestamp,
      gemsFromKills: 0,
      gemsCollected: 0,
    });
    ctx.db.ownedCharacter.insert({
      id: 0n,
      owner: ctx.sender,
      characterId: STARTER_CHARACTER_ID,
      currentHealth: statsFor(STARTER_CHARACTER_ID).maxHealth,
      constellation: 0,
    });
  }
);

export const updatePosition = spacetimedb.reducer(
  { positionX: t.f32(), positionY: t.f32(), positionZ: t.f32(), rotationY: t.f32() },
  (ctx, { positionX, positionY, positionZ, rotationY }) => {
    const currentPlayer = requirePlayer(ctx);
    const stepX = positionX - currentPlayer.positionX;
    const stepZ = positionZ - currentPlayer.positionZ;
    const stepDistance = Math.hypot(stepX, stepZ);
    // Anti-teleport: clamp each update toward the target at a sane max step.
    const stepScale = stepDistance > MAX_STEP_DISTANCE ? MAX_STEP_DISTANCE / stepDistance : 1;
    ctx.db.player.identity.update({
      ...currentPlayer,
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
  { targetIdentity: t.identity(), damage: t.u32() },
  (ctx, { targetIdentity, damage }) => {
    const attacker = requirePlayer(ctx);
    const target = ctx.db.player.identity.find(targetIdentity);
    if (!target) throw new SenderError('Target not found');
    if (target.identity.equals(ctx.sender)) throw new SenderError('Cannot attack yourself');
    if (isInsideSafeZone(attacker.positionX, attacker.positionZ)) {
      throw new SenderError('No PVP inside the safe zone');
    }
    if (isInsideSafeZone(target.positionX, target.positionZ)) {
      throw new SenderError('Target is inside the safe zone');
    }
    if (distanceBetweenPlayers(attacker, target) > MAX_HIT_RANGE) {
      throw new SenderError('Target out of range');
    }

    const clampedDamage = Math.min(damage, MAX_HIT_DAMAGE);
    const dealt = Math.min(clampedDamage, target.currentHealth);
    ctx.db.pvpHit.insert({ target: targetIdentity, amount: dealt });

    const remainingHealth = target.currentHealth - dealt;
    if (remainingHealth > 0) {
      setActiveHealth(ctx, target, remainingHealth);
      return;
    }
    // Kill: a third of the loser's primogems spill onto the ground. The winner
    // earns credit but must collect it (as can anyone).
    const stolen = spillGems(ctx, target, PVP_DEATH_SPILL, ctx.sender);
    if (stolen > 0) {
      ctx.db.player.identity.update({
        ...attacker,
        gemsFromKills: attacker.gemsFromKills + stolen,
      });
    }
    respawnPlayerAtSpawn(ctx, { ...target, primogems: target.primogems - stolen });
  }
);

export const setActiveCharacter = spacetimedb.reducer(
  { characterId: t.string() },
  (ctx, { characterId }) => {
    const currentPlayer = requirePlayer(ctx);
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
      if (!ownsCharacter(ctx, characterId)) continue;
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
    ctx.db.skillCast.insert({
      caster: ctx.sender,
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

    const clampedDamage = Math.min(damage, MAX_HIT_DAMAGE, currentPlayer.currentHealth);
    const remainingHealth = currentPlayer.currentHealth - clampedDamage;
    if (remainingHealth > 0) {
      setActiveHealth(ctx, currentPlayer, remainingHealth);
      return;
    }
    // Died to an enemy: drop a quarter of your primogems where you fell.
    const spilled = spillGems(ctx, currentPlayer, PVE_DEATH_SPILL, currentPlayer.identity);
    respawnPlayerAtSpawn(ctx, { ...currentPlayer, primogems: currentPlayer.primogems - spilled });
  }
);

export const fallToDeath = spacetimedb.reducer(ctx => {
  const currentPlayer = requirePlayer(ctx);
  // A real void fall is deep below ground AND outside every island footprint.
  const isInTheVoid =
    currentPlayer.positionY < VOID_DEATH_DEPTH &&
    !isOverAnyIsland(currentPlayer.positionX, currentPlayer.positionZ);
  if (!isInTheVoid) throw new SenderError('Not falling into the void');
  respawnPlayerAtSpawn(ctx, currentPlayer);
});

// A kill drops gems on the ground instead of paying the killer directly. The
// amount scales with the combo. PVE enemies are client-simulated, so the
// cooldown caps farm rate and the tier is clamped against spoofing.
export const dropGems = spacetimedb.reducer(
  {
    positionX: t.f32(),
    positionZ: t.f32(),
    rewardTier: t.u32(),
    comboCount: t.u32(),
    // Gems this enemy had picked up off the ground; always re-dropped on death.
    carriedGems: t.u32(),
  },
  (ctx, { positionX, positionZ, rewardTier, comboCount, carriedGems }) => {
    const currentPlayer = requirePlayer(ctx);
    const carried = Math.min(carriedGems, CARRY_HARD_CAP);
    const dropX = clampToWorld(positionX);
    const dropZ = clampToWorld(positionZ);
    const microsSinceLastReward =
      ctx.timestamp.microsSinceUnixEpoch - currentPlayer.lastKillRewardAt.microsSinceUnixEpoch;

    // Cooldown gates the base reward (anti-farm), but carried gems always fall.
    if (microsSinceLastReward < KILL_REWARD_COOLDOWN_MICROS) {
      if (carried > 0) {
        ctx.db.gemDrop.insert({ id: 0n, positionX: dropX, positionZ: dropZ, amount: carried, droppedBy: ctx.sender });
      }
      return;
    }
    const clampedTier = Math.max(1, Math.min(MAX_KILL_REWARD_TIER, rewardTier));
    const combo = Math.min(comboCount, MAX_COMBO_FOR_GEMS);
    const amount =
      Math.round(KILL_REWARD_PRIMOGEMS * clampedTier * (1 + combo * COMBO_GEM_STEP)) + carried;
    ctx.db.gemDrop.insert({
      id: 0n,
      positionX: dropX,
      positionZ: dropZ,
      amount,
      droppedBy: ctx.sender,
    });
    ctx.db.player.identity.update({
      ...currentPlayer,
      gemsFromKills: currentPlayer.gemsFromKills + amount,
      lastKillRewardAt: ctx.timestamp,
    });
  }
);

// A client's simulated enemy walked over a ground drop. Remove it; the client
// tracks the amount and re-drops it (via dropGems carriedGems) when it dies.
export const enemyTakeGem = spacetimedb.reducer(
  { dropId: t.u64() },
  (ctx, { dropId }) => {
    requirePlayer(ctx);
    ctx.db.gemDrop.id.delete(dropId);
  }
);

// Any player who walks over a drop grabs it. First one there wins the race.
export const collectGem = spacetimedb.reducer(
  { dropId: t.u64() },
  (ctx, { dropId }) => {
    const currentPlayer = requirePlayer(ctx);
    const drop = ctx.db.gemDrop.id.find(dropId);
    if (!drop) return;
    const distance = Math.hypot(
      currentPlayer.positionX - drop.positionX,
      currentPlayer.positionZ - drop.positionZ
    );
    if (distance > GEM_PICKUP_RANGE) return;
    ctx.db.gemDrop.id.delete(dropId);
    ctx.db.player.identity.update({
      ...currentPlayer,
      primogems: currentPlayer.primogems + drop.amount,
      gemsCollected: currentPlayer.gemsCollected + drop.amount,
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

    const ownedList = [...ctx.db.ownedCharacter.owner.filter(ctx.sender)];
    const healer = ownedList.find(row => row.characterId === currentPlayer.activeCharacterId);
    const healMultiplier = 1 + (healer?.constellation ?? 0) * HEAL_CONSTELLATION_STEP;

    let activeHealth = currentPlayer.currentHealth;
    for (const owned of ownedList) {
      const targetMax = statsFor(owned.characterId).maxHealth;
      const amount = Math.round(healAmountFor(stats, targetMax, comboCount) * healMultiplier);
      if (amount <= 0 || owned.currentHealth >= targetMax) continue;
      const healed = Math.min(targetMax, owned.currentHealth + amount);
      ctx.db.ownedCharacter.id.update({ ...owned, currentHealth: healed });
      ctx.db.healEvent.insert({
        owner: ctx.sender,
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
// C6. Returns the outcome so the pull can show C-level and refund at max.
function grantCharacter(ctx: { db: any; sender: any }, characterId: string) {
  const owned = [...ctx.db.ownedCharacter.owner.filter(ctx.sender)].find(
    (row: any) => row.characterId === characterId
  );
  if (!owned) {
    ctx.db.ownedCharacter.insert({
      id: 0n,
      owner: ctx.sender,
      characterId,
      currentHealth: statsFor(characterId).maxHealth,
      constellation: 0,
    });
    return { isNew: true, constellation: 0, maxed: false };
  }
  if (owned.constellation < MAX_CONSTELLATION) {
    const constellation = owned.constellation + 1;
    ctx.db.ownedCharacter.id.update({ ...owned, constellation });
    return { isNew: false, constellation, maxed: false };
  }
  return { isNew: false, constellation: MAX_CONSTELLATION, maxed: true };
}

function grantWeapon(ctx: { db: any; sender: any; timestamp: any }, weaponId: string, rarity: number) {
  ctx.db.weaponItem.insert({
    id: 0n,
    owner: ctx.sender,
    weaponId,
    rarity,
    acquiredAt: ctx.timestamp,
  });
}

export const pullBanner = spacetimedb.reducer(
  { bannerId: t.string(), count: t.u32() },
  (ctx, { bannerId, count }) => {
    const currentPlayer = requirePlayer(ctx);
    const banner = BANNERS[bannerId];
    if (!banner) throw new SenderError('Unknown banner');

    const pullCount = count >= MAX_PULLS_PER_REQUEST ? MAX_PULLS_PER_REQUEST : 1;
    const totalCost = GACHA_PULL_COST * pullCount;
    if (currentPlayer.primogems < totalCost) throw new SenderError('Not enough primogems');

    // Load (or create) this banner's pity row for the player.
    let pity = [...ctx.db.bannerPity.by_owner_banner.filter([ctx.sender, bannerId])][0];
    if (!pity) {
      pity = ctx.db.bannerPity.insert({
        id: 0n,
        owner: ctx.sender,
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
    let refund = 0;

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

      if (ctx.random() < fiveStarChance(sinceFive)) {
        sinceFive = 0;
        rarity = 5;
        const wonFeatured = guaranteed || ctx.random() < FEATURED_5STAR_WIN;
        if (wonFeatured) {
          guaranteed = false;
          kind = 'character';
          itemId = banner.featuredCharacterId;
          isFeatured = true;
          const result = grantCharacter(ctx, itemId);
          isNew = result.isNew;
          constellation = result.constellation;
          if (result.maxed) refund += DUPLICATE_REFUND;
        } else {
          // Lost the 50/50 → a 5★ weapon, and the next 5★ is guaranteed featured.
          guaranteed = true;
          itemId = pickWeaponId(ctx, 5);
          grantWeapon(ctx, itemId, 5);
        }
      } else if (sinceFour >= FOUR_STAR_PITY || ctx.random() < FOUR_STAR_RATE) {
        sinceFour = 0;
        rarity = 4;
        if (ctx.random() < FOUR_STAR_CHARACTER_SHARE) {
          kind = 'character';
          itemId = pickFourStarCharacterId(ctx);
          const result = grantCharacter(ctx, itemId);
          isNew = result.isNew;
          constellation = result.constellation;
          if (result.maxed) refund += DUPLICATE_REFUND;
        } else {
          itemId = pickWeaponId(ctx, 4);
          grantWeapon(ctx, itemId, 4);
        }
      } else {
        rarity = 3;
        itemId = pickWeaponId(ctx, 3);
        grantWeapon(ctx, itemId, 3);
      }

      ctx.db.pullResult.insert({
        owner: ctx.sender,
        bannerId,
        slot,
        kind,
        itemId,
        rarity,
        isNew,
        isFeatured,
        constellation,
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
      primogems: currentPlayer.primogems - totalCost + refund,
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

export const init = spacetimedb.init(ctx => {
  ctx.db.regenTimer.insert({
    scheduled_id: 0n,
    scheduled_at: ScheduleAt.interval(REGEN_INTERVAL_MICROS),
  });
});

export const onConnect = spacetimedb.clientConnected(ctx => {
  const existingPlayer = ctx.db.player.identity.find(ctx.sender);
  if (!existingPlayer) return;
  ctx.db.player.identity.update({ ...existingPlayer, online: true });
});

export const onDisconnect = spacetimedb.clientDisconnected(ctx => {
  const existingPlayer = ctx.db.player.identity.find(ctx.sender);
  if (!existingPlayer) return;
  ctx.db.player.identity.update({ ...existingPlayer, online: false });
});
