import { schema, t, table, SenderError } from 'spacetimedb/server';

// Keep in sync with src/game/data/characters.ts (client roster).
const CHARACTER_POOL = [
  { characterId: 'aeris', stars: 5 },
  { characterId: 'terron', stars: 5 },
  { characterId: 'volta', stars: 5 },
  { characterId: 'silva', stars: 5 },
  { characterId: 'marina', stars: 5 },
  { characterId: 'ignis', stars: 5 },
  { characterId: 'sarma', stars: 5 },
  { characterId: 'zefs', stars: 4 },
  { characterId: 'petra', stars: 4 },
  { characterId: 'zibo', stars: 4 },
  { characterId: 'lapa', stars: 4 },
  { characterId: 'rasa', stars: 4 },
  { characterId: 'dzirkste', stars: 4 },
  { characterId: 'stindzis', stars: 4 },
];

const STARTER_CHARACTER_ID = 'zibo';
const STARTING_PRIMOGEMS = 16000;
const GACHA_PULL_COST = 1600;
const DUPLICATE_REFUND = 800;
const KILL_REWARD_PRIMOGEMS = 40;
const FIVE_STAR_CHANCE = 0.1;
const WORLD_BOUND = 80;
const SAFE_ZONE_RADIUS = 18;
const SPAWN_X = 6;
const SPAWN_Z = 6;
const MAX_HEALTH = 1000;
const MAX_HIT_DAMAGE = 400;
// Bow projectiles fly up to ~45 units; server range check must cover them.
const MAX_HIT_RANGE = 45;
const MAX_STEP_DISTANCE = 12;
const KILL_REWARD_COOLDOWN_MICROS = 1_500_000n;

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
    primogems: t.u32(),
    currentHealth: t.u32(),
    lastKillRewardAt: t.timestamp(),
  }
);

const ownedCharacter = table(
  { name: 'owned_character', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity().index('btree'),
    characterId: t.string(),
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

const gachaResult = table(
  { name: 'gacha_result', public: true, event: true },
  {
    owner: t.identity(),
    characterId: t.string(),
    stars: t.u32(),
    wasNew: t.bool(),
  }
);

const spacetimedb = schema({ player, ownedCharacter, skillCast, gachaResult });
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
  return Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, coordinate));
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
      primogems: STARTING_PRIMOGEMS,
      currentHealth: MAX_HEALTH,
      lastKillRewardAt: ctx.timestamp,
    });
    ctx.db.ownedCharacter.insert({
      id: 0n,
      owner: ctx.sender,
      characterId: STARTER_CHARACTER_ID,
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
      positionY: Math.max(0, Math.min(20, positionY)),
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
    const remainingHealth = target.currentHealth - Math.min(clampedDamage, target.currentHealth);
    if (remainingHealth > 0) {
      ctx.db.player.identity.update({ ...target, currentHealth: remainingHealth });
      return;
    }

    ctx.db.player.identity.update({
      ...target,
      currentHealth: MAX_HEALTH,
      positionX: SPAWN_X,
      positionY: 0,
      positionZ: SPAWN_Z,
    });
  }
);

export const setActiveCharacter = spacetimedb.reducer(
  { characterId: t.string() },
  (ctx, { characterId }) => {
    const currentPlayer = requirePlayer(ctx);
    if (!ownsCharacter(ctx, characterId)) {
      throw new SenderError('Character not owned');
    }
    ctx.db.player.identity.update({
      ...currentPlayer,
      activeCharacterId: characterId,
    });
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
      ctx.db.player.identity.update({ ...currentPlayer, currentHealth: remainingHealth });
      return;
    }

    ctx.db.player.identity.update({
      ...currentPlayer,
      currentHealth: MAX_HEALTH,
      positionX: SPAWN_X,
      positionY: 0,
      positionZ: SPAWN_Z,
    });
  }
);

export const grantKillReward = spacetimedb.reducer(ctx => {
  const currentPlayer = requirePlayer(ctx);
  const microsSinceLastReward =
    ctx.timestamp.microsSinceUnixEpoch - currentPlayer.lastKillRewardAt.microsSinceUnixEpoch;
  if (microsSinceLastReward < KILL_REWARD_COOLDOWN_MICROS) return;
  ctx.db.player.identity.update({
    ...currentPlayer,
    primogems: currentPlayer.primogems + KILL_REWARD_PRIMOGEMS,
    lastKillRewardAt: ctx.timestamp,
  });
});

export const healInSafeZone = spacetimedb.reducer(
  { amount: t.u32() },
  (ctx, { amount }) => {
    const currentPlayer = requirePlayer(ctx);
    if (!isInsideSafeZone(currentPlayer.positionX, currentPlayer.positionZ)) {
      throw new SenderError('Healing only works inside the safe zone');
    }
    const healedHealth = Math.min(MAX_HEALTH, currentPlayer.currentHealth + amount);
    ctx.db.player.identity.update({ ...currentPlayer, currentHealth: healedHealth });
  }
);

function pickRandomCharacter(randomValue: number, pickFiveStar: boolean) {
  const tierPool = CHARACTER_POOL.filter(entry =>
    pickFiveStar ? entry.stars === 5 : entry.stars === 4
  );
  const index = Math.floor(randomValue * tierPool.length) % tierPool.length;
  return tierPool[index];
}

export const pullGacha = spacetimedb.reducer(ctx => {
  const currentPlayer = requirePlayer(ctx);
  if (currentPlayer.primogems < GACHA_PULL_COST) {
    throw new SenderError('Not enough primogems');
  }

  const pickFiveStar = ctx.random() < FIVE_STAR_CHANCE;
  const pulledCharacter = pickRandomCharacter(ctx.random(), pickFiveStar);
  const wasNew = !ownsCharacter(ctx, pulledCharacter.characterId);

  const refund = wasNew ? 0 : DUPLICATE_REFUND;
  ctx.db.player.identity.update({
    ...currentPlayer,
    primogems: currentPlayer.primogems - GACHA_PULL_COST + refund,
  });

  if (wasNew) {
    ctx.db.ownedCharacter.insert({
      id: 0n,
      owner: ctx.sender,
      characterId: pulledCharacter.characterId,
    });
  }

  ctx.db.gachaResult.insert({
    owner: ctx.sender,
    characterId: pulledCharacter.characterId,
    stars: pulledCharacter.stars,
    wasNew,
  });
});

export const init = spacetimedb.init(_ctx => {});

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
