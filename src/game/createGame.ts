import * as THREE from 'three';
import { CHARACTERS, healSpecFor, type CharacterDefinition } from './data/characters';
import { WEAPONS } from './data/weapons';
import { ELEMENTS, type ElementId } from './data/elements';
import {
  GRAVITY,
  JUMP_VELOCITY,
  MAX_HEALTH,
  OVERLAY_LAYER,
  POSITION_SYNC_INTERVAL_SECONDS,
  SAFE_ZONE_HEAL_PER_SECOND,
  WORLD_BOUND,
} from './data/constants';
import { createPixelRenderer } from './engine/createPixelRenderer';
import { createMondstadtWorld, isInsideSafeZone } from './world/createMondstadtWorld';
import {
  resolveBodyCollisions,
  resolveObstacleCollisions,
  type CollisionBody,
} from './physics/resolveCollisions';
import { createCharacterModel, createNameSprite, type CharacterModel } from './entities/createCharacterModel';
import { createBoostOrbit } from './entities/createBoostOrbit';
import { createInputSystem } from './systems/createInputSystem';
import { createAudioSystem } from './audio/createAudioSystem';
import { createEffectSystem, type DamageApplier, PROJECTILE_LIFETIME_SECONDS } from './systems/createEffectSystem';
import { createAttackViewClock } from './systems/createAttackViewClock';
import { createEnemyRenderer } from './systems/createEnemyRenderer';
import { createGoliathRenderer } from './systems/createGoliathRenderer';
import { createTelegraphSystem } from './systems/createTelegraphSystem';
import { createDamageNumbers } from './systems/createDamageNumbers';
import {
  comboWindowSeconds,
  regularAttackMultiplier,
  skillAttackMultiplier,
  swingProfile,
  COMBO_INPUT_COOLDOWN_SECONDS,
  type SwingProfile,
} from './combat/comboSystem';
import type { DamageKind } from './combat/damageKind';
import { transcendDamageMultiplier } from './combat/transcendScaling';
import { attackHitsEntity } from './combat/hitTest';
import { gemVisual } from './data/gemDrops';
import { ATTACK_RENDER } from './data/attacks';
import type {
  AttackStrike,
  Enemy,
  GemDrop,
  Goliath,
  Player,
  RangedAttack,
  ShardDrop,
  SkillCast,
  UnitAttack,
} from '../module_bindings/types';

export interface HudState {
  attackCooldownFraction: number;
  skillCooldownFraction: number;
  /**
   * Remaining skill-cooldown fraction [0..1] per character id, for EVERY party
   * member whose skill is still cooling (benched characters keep cooling in real
   * time). Absent id = ready (0). Lets the party HUD show each member's cooldown,
   * not only the active one.
   */
  skillCooldownByCharacter: Record<string, number>;
  inSafeZone: boolean;
  /** Current hit combo (0 = none); unbounded, only rises on landed hits. */
  combo: number;
}

export interface GameNetworkActions {
  sendPosition(x: number, y: number, z: number, rotationY: number): void;
  sendCastSkill(
    skillId: string,
    originX: number,
    originZ: number,
    directionX: number,
    directionZ: number
  ): void;
  /**
   * The local player landed a PVP hit. The server owns the damage number and
   * the crit roll — this reports the INTENT (skill-vs-basic + combo) only; a
   * modified client can no longer author its own PVP damage.
   */
  sendAttackPlayer(target: Player, isSkill: boolean, comboCount: number): void;
  sendTakeDamage(damage: number): void;
  sendHeal(amount: number): void;
  /** Trigger a healer character's party heal (combo only matters for combo-mode). */
  sendHealParty(comboCount: number): void;
  /**
   * The local player swung within a radius. The server owns enemy/goliath HP,
   * combat, and payouts — this reports the swing so it can apply authoritative
   * damage to every server entity caught in the circle.
   */
  sendAttackEnemies(
    centerX: number,
    centerZ: number,
    radius: number,
    isSkill: boolean,
    comboCount: number
  ): void;
  /**
   * Server-authoritative ranged (bow) hitscan. Fired ONCE when a projectile
   * launches, not per frame: the server picks the first enemy/goliath the ray
   * passes through using authoritative positions, so a shot lands the same at any
   * range. The visual projectile no longer deals enemy damage (only combo + PvP).
   */
  sendAttackRay(
    originX: number,
    originZ: number,
    directionX: number,
    directionZ: number,
    range: number,
    hitRadius: number,
    isSkill: boolean,
    comboCount: number
  ): void;
  sendCollectGem(dropId: bigint): void;
  /** Requests collection of a rare transcend-shard ground drop (mirror of sendCollectGem). */
  sendCollectShard(dropId: bigint): void;
  sendFallToDeath(): void;
}

export interface Game {
  start(): void;
  dispose(): void;
  setActiveCharacter(characterId: string): void;
  /** Active character's constellation level, scaling its damage. */
  setActiveConstellation(constellation: number): void;
  /** Active character's transcend level, further scaling its damage. */
  setActiveTranscend(transcend: number): void;
  syncRemotePlayers(players: readonly Player[], myIdentityHex: string | null): void;
  syncMyServerRow(row: Player): void;
  handleRemoteSkillCast(cast: SkillCast): void;
  handleRemotePlayerAttack(attack: RangedAttack): void;
  /** Floats a number over the local player — PVP damage taken, or heals. */
  spawnSelfNumber(amount: number, kind: DamageKind): void;
  /** Floats a server-driven `enemy_hit` number at the enemy's world position (any attacker). */
  spawnWorldNumber(positionX: number, positionZ: number, amount: number, kind: DamageKind): void;
  /** Shows a remote player's health bar for a few seconds (they were hit). */
  flashRemoteHealth(identityHex: string): void;
  /** Floats a server-driven `pvp_hit` number at a remote player's live position. */
  spawnPlayerNumber(identityHex: string, amount: number, kind: DamageKind): void;
  /** Syncs the gem drops lying in the world (walk over to collect). */
  syncGemDrops(drops: readonly GemDrop[]): void;
  /** Syncs the rare transcend-shard drops lying in the world (purple, walk over to collect). */
  syncShardDrops(drops: readonly ShardDrop[]): void;
  /** Reconciles the rendered camp enemies against the server `enemy` table. */
  syncEnemies(rows: readonly Enemy[]): void;
  /** Reconciles the rendered goliath raiders against the server `goliath` table. */
  syncGoliaths(rows: readonly Goliath[]): void;
  /** Feeds `unit_attack` FSM rows to the ground-telegraph system (windup countdown). */
  syncUnitAttacks(rows: readonly UnitAttack[]): void;
  /** One `attack_strike` event: impact burst + rim flash + camera shake + SFX (ANIM-04), distance-attenuated from the local player. */
  handleAttackStrike(strike: AttackStrike): void;
  setTouchMove(x: number, z: number): void;
  pressTouchButton(button: 'attack' | 'skill' | 'jump'): void;
  releaseTouchButton(button: 'attack'): void;
  /** Register a handler fired when a remote player's floating nameplate is clicked/tapped. */
  setOnSelectPlayer(handler: ((identityHex: string) => void) | null): void;
  /** Set the identity hexes of my party (Bars) so PVP skips friendly fire. */
  setPartyAllies(identityHexes: readonly string[]): void;
  setInputEnabled(enabled: boolean): void;
  /**
   * True while the local stun window is open (HIT-01). Character switching is
   * gated on it (App.selectCharacter) so the UI never optimistically swaps a
   * model the server-side stun gate will refuse.
   */
  isStunned(): boolean;
  onPartySlotRequested: ((slotIndex: number) => void) | null;
}

interface HealthBar {
  sprite: THREE.Sprite;
  texture: THREE.CanvasTexture;
  canvas: HTMLCanvasElement;
}

interface RemotePlayerView {
  model: CharacterModel;
  nameSprite: THREE.Sprite;
  characterId: string;
  row: Player;
  targetPosition: THREE.Vector3;
  targetRotationY: number;
  // Two timestamps, deliberately separate: the send-rate gate must only ever be
  // re-armed by OUR OWN outgoing attackPlayer — if it shared a field with the
  // display flash, every broadcast pvp_hit on this victim (rival attackers, our
  // own event echo) would re-arm our 0.3s lockout and swallow our swings.
  lastPvpSentAt: number; // local send-rate gate (applyPvpDamage only)
  lastPvpHitShownAt: number; // health-bar flash display (any pvp_hit broadcast)
  healthBar: HealthBar;
}

function createHealthBar(): HealthBar {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 16;
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true })
  );
  sprite.layers.set(OVERLAY_LAYER); // crisp: rendered in the native-res overlay pass
  sprite.scale.set(1.7, 0.22, 1);
  sprite.position.y = 2.7;
  sprite.visible = false;
  return { sprite, texture, canvas };
}

function drawHealthBar(bar: HealthBar, fraction: number) {
  const ctx = bar.canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 16);
  ctx.fillStyle = 'rgba(8, 12, 9, 0.82)';
  ctx.fillRect(0, 0, 128, 16);
  const clamped = Math.max(0, Math.min(1, fraction));
  ctx.fillStyle = clamped > 0.3 ? '#7ec843' : '#ff5c3c';
  ctx.fillRect(2, 2, (128 - 4) * clamped, 12);
  bar.texture.needsUpdate = true;
}

const CAMERA_OFFSET = new THREE.Vector3(7, 15, 11);
const CAMERA_YAW = Math.atan2(CAMERA_OFFSET.x, CAMERA_OFFSET.z);
const DASH_DISTANCE = 5;
const DASH_SUBSTEPS = 4;
/** Walkable step height; anything taller needs a jump (terrace = 1.8, jump apex ≈ 2.4). */
const MAX_STEP_UP = 0.9;
/**
 * Platforms more than this above the player's feet are unreachable by jumping,
 * so they are ignored as ground — a bridge deck overhead is not a wall.
 */
const PLATFORM_REACH = 2.6;
const PVP_HIT_COOLDOWN_SECONDS = 0.3;
const PVP_MAX_HIT_RANGE = 45; // server MAX_HIT_RANGE (also caps the ranged hitscan)
/** Forgiveness radius of a bow projectile's server hitscan ray (server caps at 3). */
const RANGED_HIT_RADIUS = 2;
/** Attacks only connect within this vertical gap — no hitting across cliffs. */
const VERTICAL_HIT_GATE = 3;
const POSITION_EPSILON = 0.01;
const ROTATION_EPSILON = 0.02;
const SERVER_TELEPORT_THRESHOLD = 20;
const RESPAWN_HEALTH_JUMP = 100;
/** Ignore tiny health dips (regen jitter) so they don't spam damage numbers. */
const TAKEN_DAMAGE_FLOOR = 3;
/** A single drop this large reads as a heavy hit and floats a bigger crit number. */
const TAKEN_DAMAGE_CRIT_THRESHOLD = 120;
/** Falls up to ~2 terraces are free; longer drops hurt. */
const SAFE_FALL_DISTANCE = 4.5;
const FALL_DAMAGE_PER_UNIT = 50;
/** Below this Y the player has fallen off the islands — instant death. */
const VOID_KILL_DEPTH = -15;
const MOVEMENT_LIMIT = WORLD_BOUND + 5; // matches server clamp

export function createGame(
  canvas: HTMLCanvasElement,
  network: GameNetworkActions,
  onHudChange: (hud: HudState) => void,
  /** Fired once when MY stun window opens: duration + 0..1 proximity to the slam center. */
  onStunned?: (durationSeconds: number, intensity: number) => void
): Game {
  const scene = new THREE.Scene();
  const pixelRenderer = createPixelRenderer(canvas);
  const world = createMondstadtWorld(scene);
  const effectSystem = createEffectSystem(scene);
  const damageNumbers = createDamageNumbers(scene);
  // Enemies and goliaths are now server-authoritative: these renderers only draw
  // the `enemy`/`goliath` table rows and interpolate them. Damage/HP/economy all
  // live on the server, reached through network.sendAttackEnemies. The floating
  // NUMBERS are no longer driven by the server HP-delta (that double-drew) — every
  // hit's number now comes from the server `enemy_hit` event at the enemy's exact
  // position (App.tsx → spawnWorldNumber), so own AND other players' hits land ON
  // the enemy. The renderers still flash the health bar on any HP drop
  // (lastDamagedAt, set independently of this callback).
  const enemyRenderer = createEnemyRenderer(scene, effectSystem);
  const goliathRenderer = createGoliathRenderer(scene);
  // Ground telegraphs for server unit_attack windups (D4-14): discs sit on the
  // terrain at the LOCKED landing so the dodge read matches the server hitbox.
  const telegraphSystem = createTelegraphSystem(scene, (x, z) => world.getGroundHeight(x, z));
  const inputSystem = createInputSystem(canvas);
  // Hand-rolled WebAudio slam SFX (D4-15) — zero assets, zero dependencies.
  const audioSystem = createAudioSystem();

  // Server-clock anchored unit-attack views + the shared alive gate (ANIM-01),
  // carved into its own system module (createAttackViewClock): goliath and
  // unit_attack rows go in, per-frame AttackAnimationViews come out — this file
  // only wires them to the goliath renderer and the telegraph system.
  const attackViewClock = createAttackViewClock();

  let activeCharacter: CharacterDefinition = CHARACTERS.zibo;
  let playerModel = createCharacterModel(activeCharacter);
  scene.add(playerModel.group);

  // Būsts stars orbiting the local player (count = active character's būsts level).
  const boostOrbit = createBoostOrbit();
  scene.add(boostOrbit.group);

  // Matches SPAWN_X/SPAWN_Z on the server (next to the plaza fountain).
  const playerPosition = new THREE.Vector3(6, 0, 6);
  const playerCollisionBody: CollisionBody = { position: playerPosition, radius: 0.45, mass: 1 };
  let playerVelocityY = 0;
  let playerRotationY = 0;
  let myServerHealth = MAX_HEALTH;
  let lastSyncedCharacterId = '';
  let pvpDamageSinceSync = 0;
  let elapsedSeconds = 0;
  let positionSyncTimer = 0;
  let healTimer = 0;
  let combo = 0;
  let lastComboHitAt = -Infinity;
  let lastSwingAt = -Infinity;
  let swingIndex = 0;
  const skillReadyAtByCharacter = new Map<string, number>();
  const remotePlayers = new Map<string, RemotePlayerView>();

  // --- Nameplate picking: click/tap a remote player's floating name to open the
  // player sheet (invite / ask-to-join / kick / details). Registered on window
  // CAPTURE so a nameplate hit runs BEFORE the canvas attack listener and can
  // suppress the attack via stopPropagation. Clicks on DOM/HUD (target !== canvas)
  // and misses fall through untouched, so world attacks are unaffected.
  let onSelectPlayer: ((identityHex: string) => void) | null = null;
  // Identity hexes of my current party (Bars) — excluded from PVP friendly fire.
  let partyAllyHexes = new Set<string>();
  const pickRaycaster = new THREE.Raycaster();
  pickRaycaster.layers.enableAll(); // nameplates live on OVERLAY_LAYER
  const pickNdc = new THREE.Vector2();
  function handleNameplatePick(event: PointerEvent) {
    if (!onSelectPlayer || event.target !== canvas || !event.isPrimary) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    pickNdc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    pickRaycaster.setFromCamera(pickNdc, pixelRenderer.camera);
    const sprites: THREE.Sprite[] = [];
    const bySprite = new Map<THREE.Sprite, string>();
    for (const [hex, view] of remotePlayers) {
      sprites.push(view.nameSprite);
      bySprite.set(view.nameSprite, hex);
    }
    if (sprites.length === 0) return;
    const hit = pickRaycaster.intersectObjects(sprites, false)[0];
    if (!hit) return;
    const hex = bySprite.get(hit.object as THREE.Sprite);
    if (!hex) return;
    event.stopPropagation();
    event.preventDefault();
    onSelectPlayer(hex);
  }
  window.addEventListener('pointerdown', handleNameplatePick, true);
  const gemDrops = new Map<
    string,
    {
      mesh: THREE.Mesh;
      rawId: bigint;
      age: number;
      baseY: number;
      sparkle: boolean;
      sparkleAt: number;
    }
  >();
  const requestedGemPickups = new Set<string>();
  // Rare transcend-shard drops reuse the ENTIRE gem magnet/grace/collect pipeline
  // (same delay/magnet/collect radii below); only the mesh look differs — a purple
  // octahedron 1.4x the gem radius, brighter emissive, always sparkling.
  const shardDrops = new Map<
    string,
    {
      mesh: THREE.Mesh;
      rawId: bigint;
      age: number;
      baseY: number;
      sparkleAt: number;
    }
  >();
  const requestedShardPickups = new Set<string>();
  // Drops are un-grabbable for a moment so they are clearly visible before the
  // killer (usually standing right on top) sweeps them up. After that they
  // magnet toward the nearest (local) player and get collected on contact.
  const GEM_PICKUP_DELAY = 1.2;
  const GEM_MAGNET_RADIUS = 5.5;
  const GEM_COLLECT_RADIUS = 1.1;
  // Uniform gem look: all the smallest size, only color differs by denomination.
  const GEM_RADIUS = 0.3;
  const GEM_EMISSIVE_INTENSITY = 0.4;
  const GEM_SPARKLE_INTERVAL = 0.8;
  // Rare shard look — a purple relative of the gem: 1.4x the gem radius, a brighter
  // self-glow, and always sparkling so it reads as scarcer/heavier at a glance.
  const SHARD_COLOR = 0x9333ea;
  const SHARD_RADIUS = 0.42;
  const SHARD_EMISSIVE_INTENSITY = 0.6;
  let animationFrameHandle = 0;
  let lastFrameTime = 0;
  let lastSentPosition = new THREE.Vector3(Infinity, 0, 0);
  let lastSentRotationY = Infinity;
  let fallPeakY = 0;
  let hasReportedVoidDeath = false;

  /** True if any rendered enemy/goliath sits inside the swing (drives combo + facing). */
  // Uses the SAME geometry the server's attackEnemies reducer damages with
  // (attackHitsEntity), so combo + projectile despawn agree with actual damage.
  // A previously wider client radius (radius + 0.8, plus a vertical gate the
  // server does not apply) counted combo and burst projectiles on hits the
  // server never dealt — the "combo climbs but no damage" bug.
  function anyEntityWithinRadius(
    center: { x: number; y: number; z: number },
    radius: number
  ): boolean {
    const positions = [...enemyRenderer.getAlivePositions(), ...goliathRenderer.getAlivePositions()];
    return positions.some(position => attackHitsEntity(position.x, position.z, center.x, center.z, radius));
  }

  function dealDamage(
    center: { x: number; y: number; z: number },
    radius: number,
    damage: number,
    kind: DamageKind,
    isSkill: boolean
  ): boolean {
    // The server owns enemy/goliath HP, crit, AND the damage number now — report the
    // INTENT (skill-vs-basic + combo), never a client-authored number. Local hit
    // detection only drives combo + facing; PvP still sends its own local number.
    network.sendAttackEnemies(center.x, center.z, radius, isSkill, combo);
    const hitEntity = anyEntityWithinRadius(center, radius);
    const hitPlayer = applyPvpDamage(center, radius, damage, kind, isSkill);
    return hitEntity || hitPlayer;
  }

  // Only regular attacks build the combo (once per landed attack, even across
  // several targets); skills spend the combo scaling but do not add to it.
  const applyAttackDamage: DamageApplier = (center, radius, damage, _element, kind) => {
    const hit = dealDamage(center, radius, damage, kind, false);
    if (hit) registerComboHit();
    return hit;
  };
  const applySkillDamage: DamageApplier = (center, radius, damage, _element, kind) =>
    dealDamage(center, radius, damage, kind, true);

  // Ranged (bow) projectiles are now purely visual for enemy damage — the server
  // hitscan (sendAttackRay, fired once at launch) owns enemy/goliath HP. This
  // local applier keeps the projectile driving combo feel (ticks when the visual
  // reaches a target) and ranged PvP, WITHOUT re-sending enemy damage per frame.
  const applyRangedProjectileHit: DamageApplier = (center, radius, damage, _element, kind) => {
    const hitEntity = anyEntityWithinRadius(center, radius);
    const hitPlayer = applyPvpDamage(center, radius, damage, kind, false);
    const hit = hitEntity || hitPlayer;
    if (hit) registerComboHit();
    return hit;
  };

  function registerComboHit() {
    combo++;
    lastComboHitAt = elapsedSeconds;
  }

  function applyPvpDamage(
    center: { x: number; y: number; z: number },
    radius: number,
    damage: number,
    kind: DamageKind,
    isSkill: boolean
  ): boolean {
    if (isInsideSafeZone(playerPosition.x, playerPosition.z)) return false;
    let hitSomeone = false;
    for (const [remoteHex, remotePlayer] of remotePlayers) {
      // No friendly fire: skip players in my own party (Bars).
      if (partyAllyHexes.has(remoteHex)) continue;
      const remotePosition = remotePlayer.model.group.position;
      if (isInsideSafeZone(remotePosition.x, remotePosition.z)) continue;
      if (elapsedSeconds < remotePlayer.lastPvpSentAt + PVP_HIT_COOLDOWN_SECONDS) continue;
      if (playerPosition.distanceTo(remotePosition) > PVP_MAX_HIT_RANGE) continue;
      if (Math.abs(remotePosition.y + 1 - center.y) > VERTICAL_HIT_GATE) continue;
      const distance = Math.hypot(remotePosition.x - center.x, remotePosition.z - center.z);
      if (distance > radius + 0.8) continue;
      remotePlayer.lastPvpSentAt = elapsedSeconds;
      remotePlayer.lastPvpHitShownAt = elapsedSeconds;
      hitSomeone = true;
      network.sendAttackPlayer(remotePlayer.row, isSkill, combo);
      effectSystem.spawnBurst(remotePosition.clone().setY(1.2), 0xff4a4a, 14);
      // Instant local display number (D3-05) — the server pvp_hit event is the
      // truth; our own non-crit echo is suppressed in the App.tsx callback.
      damageNumbers.spawn(remotePosition.clone().setY(remotePosition.y + 1), damage, kind);
    }
    return hitSomeone;
  }

  function facingDirection(): { x: number; z: number } {
    return { x: Math.sin(playerRotationY), z: Math.cos(playerRotationY) };
  }

  function faceNearestTarget(maxRange: number): boolean {
    let nearestDistance = maxRange;
    let nearestPosition: THREE.Vector3 | null = null;
    for (const remotePlayer of remotePlayers.values()) {
      const remotePosition = remotePlayer.model.group.position;
      if (isInsideSafeZone(remotePosition.x, remotePosition.z)) continue;
      const distance = playerPosition.distanceTo(remotePosition);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestPosition = remotePosition;
      }
    }
    const nearestEnemyPosition = findNearestEnemyPosition(nearestDistance);
    if (nearestEnemyPosition) nearestPosition = nearestEnemyPosition;
    if (!nearestPosition) return false;
    playerRotationY = Math.atan2(
      nearestPosition.x - playerPosition.x,
      nearestPosition.z - playerPosition.z
    );
    return true;
  }

  function findNearestEnemyPosition(maxRange: number): THREE.Vector3 | null {
    let nearestPosition: THREE.Vector3 | null = null;
    let nearestDistance = maxRange;
    const targetPositions = [...enemyRenderer.getAlivePositions(), ...goliathRenderer.getAlivePositions()];
    for (const candidate of targetPositions) {
      const distance = playerPosition.distanceTo(candidate);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestPosition = candidate;
      }
    }
    return nearestPosition;
  }

  let activeConstellation = 0;
  let activeTranscend = 0;

  function performAttack() {
    // The caller already paced this by the input cooldown; the combo itself
    // only rises when a hit lands (applyAttackDamage), not per swing.
    lastSwingAt = elapsedSeconds;
    swingIndex++;
    const profile = swingProfile(swingIndex, combo);
    playerModel.triggerAttack(profile);

    const weapon = WEAPONS[activeCharacter.weapon];
    faceNearestTarget(weapon.range + 3);
    const direction = facingDirection();
    const elementColor = ELEMENTS[activeCharacter.element].color;
    // Regular attacks get only a small combo boost — the payoff is the skill.
    // Crit is now decided SERVER-side (CRIT-02); this local number is a display-only
    // 'normal' hit that keeps the projectile/melee feel until Plan 03 floats the
    // authoritative enemy_hit number.
    const amount =
      weapon.damage *
      regularAttackMultiplier(combo) *
      transcendDamageMultiplier(activeConstellation, activeTranscend);
    const kind: DamageKind = 'normal';

    if (profile.isFlourish) {
      effectSystem.spawnBurst(playerPosition.clone().setY(playerPosition.y + 1), elementColor, 30);
    }

    if (weapon.isRanged) {
      // Fire ONE server hitscan at launch: the server picks the first enemy/goliath
      // the ray reaches using authoritative positions, so a shot lands the same at
      // any range. The projectile below is purely visual for enemy damage.
      const projectileTravel = PROJECTILE_LIFETIME_SECONDS * weapon.projectileSpeed;
      const rangedRange = Math.min(PVP_MAX_HIT_RANGE, projectileTravel);
      network.sendAttackRay(
        playerPosition.x,
        playerPosition.z,
        direction.x,
        direction.z,
        rangedRange,
        RANGED_HIT_RADIUS,
        false,
        combo
      );
      effectSystem.spawnProjectile({
        origin: playerPosition.clone().setY(playerPosition.y + 1.2),
        direction,
        speed: weapon.projectileSpeed,
        damage: amount,
        element: activeCharacter.element,
        hitRadius: RANGED_HIT_RADIUS,
        applyDamage: applyRangedProjectileHit,
        damageKind: kind,
      });
      return;
    }

    const hitCenter = {
      x: playerPosition.x + direction.x * weapon.range * 0.6,
      y: playerPosition.y + 1,
      z: playerPosition.z + direction.z * weapon.range * 0.6,
    };
    effectSystem.spawnMeleeSlash(playerPosition, playerRotationY, elementColor);
    applyAttackDamage(hitCenter, weapon.range * 0.75, amount, activeCharacter.element, kind);
  }

  function performSkill() {
    const skill = activeCharacter.skill;
    const skillReadyAt = skillReadyAtByCharacter.get(activeCharacter.id) ?? 0;
    if (elapsedSeconds < skillReadyAt) return;
    skillReadyAtByCharacter.set(activeCharacter.id, elapsedSeconds + skill.cooldownSeconds);
    faceNearestTarget(16);
    const direction = facingDirection();

    if (skill.kind === 'dash') {
      const substep = DASH_DISTANCE / DASH_SUBSTEPS;
      for (let dashStep = 0; dashStep < DASH_SUBSTEPS; dashStep++) {
        if (!tryMove(direction.x * substep, direction.z * substep)) break;
      }
      clampPlayerToWorld();
    }

    effectSystem.spawnSkillEffect({
      skill,
      element: activeCharacter.element,
      origin: playerPosition.clone().setY(playerPosition.y + 1),
      direction,
      applyDamage: applySkillDamage,
      // The combo's real payoff: the skill scales strongly and uncapped.
      damageMultiplier:
        skillAttackMultiplier(combo) *
        transcendDamageMultiplier(activeConstellation, activeTranscend),
      followPosition: () => playerPosition,
    });
    network.sendCastSkill(skill.id, playerPosition.x, playerPosition.z, direction.x, direction.z);

    // Active healers (e.g. Marina, Lapa) heal the whole owned party on cast.
    if (healSpecFor(activeCharacter.id).type === 'active') {
      network.sendHealParty(combo);
    }
  }

  function clampPlayerToWorld() {
    playerPosition.x = Math.max(-MOVEMENT_LIMIT, Math.min(MOVEMENT_LIMIT, playerPosition.x));
    playerPosition.z = Math.max(-MOVEMENT_LIMIT, Math.min(MOVEMENT_LIMIT, playerPosition.z));
  }

  function reachableGroundHeight(x: number, z: number): number {
    return world.getGroundHeight(x, z, playerPosition.y + PLATFORM_REACH);
  }

  function isGrounded(): boolean {
    return playerPosition.y <= reachableGroundHeight(playerPosition.x, playerPosition.z) + 0.02;
  }

  /** Moves horizontally unless blocked by a ledge taller than one step. */
  function tryMove(deltaX: number, deltaZ: number): boolean {
    const targetX = Math.max(-MOVEMENT_LIMIT, Math.min(MOVEMENT_LIMIT, playerPosition.x + deltaX));
    const targetZ = Math.max(-MOVEMENT_LIMIT, Math.min(MOVEMENT_LIMIT, playerPosition.z + deltaZ));
    const targetGround = reachableGroundHeight(targetX, targetZ);
    const ledgeHeight = targetGround - playerPosition.y;
    if (ledgeHeight > MAX_STEP_UP) return false;
    playerPosition.x = targetX;
    playerPosition.z = targetZ;
    if (isGrounded() && ledgeHeight > 0) playerPosition.y = targetGround;
    return true;
  }

  function applyFallDamage(landingY: number) {
    const fallDistance = fallPeakY - landingY;
    if (fallDistance <= SAFE_FALL_DISTANCE) return;
    const damage = Math.round((fallDistance - SAFE_FALL_DISTANCE) * FALL_DAMAGE_PER_UNIT);
    network.sendTakeDamage(damage);
    effectSystem.spawnBurst(playerPosition.clone().setY(playerPosition.y + 0.5), 0xd8b48a, 16);
  }

  // HIT-01 client half (D4-10): a RAISED stunnedUntilMicros on my own server row
  // opens this render-side stun window — input freezes and x/z lerp toward the
  // authoritative row, so the knockback displacement the server wrote is what
  // the victim sees. 1050ms = ATTACKS.leapSlam.stunTicks (7) × the 150ms world
  // tick. The real control stays server-side: updatePosition writes are rejected
  // while now < stunnedUntilMicros (Plan 02); this is only the felt half.
  // Fallback stun render window when the causing strike is unknown (stale
  // lastStrike, e.g. future PVP stuns): the original leapSlam-tuned constant.
  // A KNOWN cause uses its own ATTACK_RENDER.stunSeconds instead (D4-09/D5-12)
  // — the swing tags 0.6s, the swirl 0 (knockback only). The old fixed 1050ms
  // over-froze every swing victim by 450ms (eating the SC2 escape race) and
  // fired a ghost freeze+popup on stun-free swirl knockbacks (05-05 fix).
  const DEFAULT_STUN_RENDER_MS = 1050;
  const STUN_LERP_RATE = 12;
  let stunActiveUntilPerfMs = 0;
  let lastStunnedUntilMicros = 0n;
  // The row KEEPS its last stunnedUntilMicros forever, so the first sync after a
  // page load must baseline against it silently — comparing to the initial 0n
  // fired a ghost STUNNED popup on every refresh.
  let hasBaselinedStun = false;
  const stunServerPosition = new THREE.Vector3();
  // Last slam this client saw — lets the stun popup scale with how close to the
  // impact center I was. The strike event and my stunned row update ride the same
  // worldTick transaction, so a fresh (<600ms) strike is MY stun's cause.
  let lastStrike: { attackId: string; x: number; z: number; radius: number; atMs: number } | null =
    null;

  function updateLocalPlayer(deltaSeconds: number) {
    const isStunned = performance.now() < stunActiveUntilPerfMs;
    const moveVector = inputSystem.getMoveVector();
    const isMoving = !isStunned && Math.hypot(moveVector.x, moveVector.z) > 0.05;
    if (isMoving) {
      // Rotate screen-space input by the camera yaw so "up" moves away from the camera.
      const worldMoveX =
        moveVector.x * Math.cos(CAMERA_YAW) + moveVector.z * Math.sin(CAMERA_YAW);
      const worldMoveZ =
        -moveVector.x * Math.sin(CAMERA_YAW) + moveVector.z * Math.cos(CAMERA_YAW);
      const stepX = worldMoveX * activeCharacter.moveSpeed * deltaSeconds;
      const stepZ = worldMoveZ * activeCharacter.moveSpeed * deltaSeconds;
      if (!tryMove(stepX, stepZ) && !tryMove(stepX, 0)) tryMove(0, stepZ);
      playerRotationY = Math.atan2(worldMoveX, worldMoveZ);
    }

    // Stunned: adopt the server's knockback — lerp x/z toward the authoritative
    // row. y stays locally owned (gravity below), so a knockback past an edge
    // still falls and dies through the existing VOID_KILL_DEPTH path (D4-11).
    if (isStunned) {
      const pull = Math.min(1, deltaSeconds * STUN_LERP_RATE);
      playerPosition.x += (stunServerPosition.x - playerPosition.x) * pull;
      playerPosition.z += (stunServerPosition.z - playerPosition.z) * pull;
    }

    if (!isStunned && inputSystem.consumeJump() && isGrounded()) {
      playerVelocityY = JUMP_VELOCITY;
    }
    playerVelocityY -= GRAVITY * deltaSeconds;
    playerPosition.y += playerVelocityY * deltaSeconds;
    fallPeakY = Math.max(fallPeakY, playerPosition.y);
    const groundBelow = reachableGroundHeight(playerPosition.x, playerPosition.z);
    if (playerPosition.y <= groundBelow) {
      playerPosition.y = groundBelow;
      playerVelocityY = 0;
      applyFallDamage(groundBelow);
      fallPeakY = groundBelow;
    }
    if (playerPosition.y < VOID_KILL_DEPTH && !hasReportedVoidDeath) {
      hasReportedVoidDeath = true;
      network.sendFallToDeath();
    }

    // Only drain one queued click per input-cooldown so rapid clicks buffer
    // instead of being eaten within a single frame.
    if (
      !isStunned &&
      elapsedSeconds - lastSwingAt >= COMBO_INPUT_COOLDOWN_SECONDS &&
      inputSystem.consumeAttackClick()
    ) {
      performAttack();
    }
    if (!isStunned && inputSystem.consumeSkill()) performSkill();
    const requestedSlot = inputSystem.consumePartySlot();
    if (requestedSlot !== null) game.onPartySlotRequested?.(requestedSlot);

    playerModel.group.position.copy(playerPosition);
    playerModel.group.rotation.y = playerRotationY;
    playerModel.animate(elapsedSeconds, deltaSeconds, isMoving);
  }

  function syncPositionToServer(deltaSeconds: number) {
    // While void death is pending, stop pushing positions so the server's
    // respawn row is not dragged back toward the falling client.
    if (hasReportedVoidDeath) return;
    positionSyncTimer += deltaSeconds;
    if (positionSyncTimer < POSITION_SYNC_INTERVAL_SECONDS) return;
    positionSyncTimer = 0;
    const positionUnchanged = playerPosition.distanceTo(lastSentPosition) < POSITION_EPSILON;
    const rotationUnchanged = Math.abs(playerRotationY - lastSentRotationY) < ROTATION_EPSILON;
    if (positionUnchanged && rotationUnchanged) return;
    lastSentPosition = playerPosition.clone();
    lastSentRotationY = playerRotationY;
    network.sendPosition(playerPosition.x, playerPosition.y, playerPosition.z, playerRotationY);
  }

  function createGemMesh(drop: GemDrop): { mesh: THREE.Mesh; baseY: number } {
    // All gems are the same small size; only the color reads the denomination.
    // No halo and a low emissive keep the glow subtle.
    const visual = gemVisual(drop.amount);
    const material = new THREE.MeshLambertMaterial({
      color: visual.color,
      emissive: visual.color,
      emissiveIntensity: GEM_EMISSIVE_INTENSITY,
    });
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(GEM_RADIUS), material);
    const baseY = world.getGroundHeight(drop.positionX, drop.positionZ) + 0.9;
    mesh.position.set(drop.positionX, baseY, drop.positionZ);
    scene.add(mesh);
    // Small sparkle on landing (color-matched for the rarer tiers).
    effectSystem.spawnBurst(mesh.position.clone(), visual.sparkle ? visual.color : 0xffe08a, 10);
    return { mesh, baseY };
  }

  function updateGemDrops(deltaSeconds: number) {
    for (const [key, gem] of gemDrops) {
      gem.age += deltaSeconds;
      gem.mesh.rotation.y += deltaSeconds * 2.4;
      gem.mesh.position.y = gem.baseY + Math.sin(elapsedSeconds * 3) * 0.12;

      // Rarer tiers emit a gentle, slow-burn pixel sparkle on a throttle.
      if (gem.sparkle && elapsedSeconds >= gem.sparkleAt) {
        gem.sparkleAt = elapsedSeconds + GEM_SPARKLE_INTERVAL;
        const material = gem.mesh.material as THREE.MeshLambertMaterial;
        effectSystem.spawnSparkle(gem.mesh.position.clone(), material.color.getHex(), 4);
      }

      if (gem.age < GEM_PICKUP_DELAY) continue;

      const playerDx = playerPosition.x - gem.mesh.position.x;
      const playerDz = playerPosition.z - gem.mesh.position.z;
      const playerDistance = Math.hypot(playerDx, playerDz);

      // Gems magnet toward the local player to collect. Enemies/goliaths vacuum
      // gems server-side now, so their row simply vanishes from syncGemDrops when
      // the server claims it — no client-side enemy pull needed.
      if (playerDistance < GEM_MAGNET_RADIUS && playerDistance > 0.001) {
        const pull = Math.min(1, deltaSeconds * (3 + (GEM_MAGNET_RADIUS - playerDistance)));
        gem.mesh.position.x += playerDx * pull;
        gem.mesh.position.z += playerDz * pull;
      }

      if (playerDistance <= GEM_COLLECT_RADIUS && !requestedGemPickups.has(key)) {
        requestedGemPickups.add(key);
        network.sendCollectGem(gem.rawId);
      }
    }
  }

  function createShardMesh(drop: ShardDrop): { mesh: THREE.Mesh; baseY: number } {
    // A rarer purple relative of the gem: same crystalline octahedron, scaled 1.4x
    // with a brighter self-glow so a scarce shard is immediately distinguishable
    // from a gold gem. Always "rare tier" — always sparkling.
    const material = new THREE.MeshLambertMaterial({
      color: SHARD_COLOR,
      emissive: SHARD_COLOR,
      emissiveIntensity: SHARD_EMISSIVE_INTENSITY,
    });
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(SHARD_RADIUS), material);
    // Raise slightly above the gem baseline so the larger mesh clears the ground.
    const baseY = world.getGroundHeight(drop.positionX, drop.positionZ) + 1.0;
    mesh.position.set(drop.positionX, baseY, drop.positionZ);
    scene.add(mesh);
    // A denser purple landing burst signals rarity.
    effectSystem.spawnBurst(mesh.position.clone(), SHARD_COLOR, 12);
    return { mesh, baseY };
  }

  function updateShardDrops(deltaSeconds: number) {
    // Mirrors updateGemDrops verbatim (spin/bob, grace gate, magnet, collect) but
    // always sparkles and requests network.sendCollectShard on contact.
    for (const [key, shard] of shardDrops) {
      shard.age += deltaSeconds;
      shard.mesh.rotation.y += deltaSeconds * 2.4;
      shard.mesh.position.y = shard.baseY + Math.sin(elapsedSeconds * 3) * 0.12;

      // A shard is always rare tier — always emits the slow-burn pixel sparkle on
      // the same throttle rare gems use.
      if (elapsedSeconds >= shard.sparkleAt) {
        shard.sparkleAt = elapsedSeconds + GEM_SPARKLE_INTERVAL;
        effectSystem.spawnSparkle(shard.mesh.position.clone(), SHARD_COLOR, 4);
      }

      if (shard.age < GEM_PICKUP_DELAY) continue;

      const playerDx = playerPosition.x - shard.mesh.position.x;
      const playerDz = playerPosition.z - shard.mesh.position.z;
      const playerDistance = Math.hypot(playerDx, playerDz);

      if (playerDistance < GEM_MAGNET_RADIUS && playerDistance > 0.001) {
        const pull = Math.min(1, deltaSeconds * (3 + (GEM_MAGNET_RADIUS - playerDistance)));
        shard.mesh.position.x += playerDx * pull;
        shard.mesh.position.z += playerDz * pull;
      }

      if (playerDistance <= GEM_COLLECT_RADIUS && !requestedShardPickups.has(key)) {
        requestedShardPickups.add(key);
        network.sendCollectShard(shard.rawId);
      }
    }
  }

  function healInSafeZone(deltaSeconds: number) {
    healTimer += deltaSeconds;
    if (healTimer < 1) return;
    healTimer = 0;
    const inSafeZone = isInsideSafeZone(playerPosition.x, playerPosition.z);
    if (inSafeZone && myServerHealth < activeCharacter.maxHealth) {
      network.sendHeal(SAFE_ZONE_HEAL_PER_SECOND);
    }
    // Passive healers (e.g. Rasa) emit a party-heal aura once per second on field.
    if (healSpecFor(activeCharacter.id).type === 'passive') {
      network.sendHealParty(combo);
    }
  }

  function updateRemotePlayerViews(deltaSeconds: number) {
    const lerpFactor = Math.min(1, deltaSeconds * 10);
    for (const remotePlayer of remotePlayers.values()) {
      const group = remotePlayer.model.group;
      group.position.lerp(remotePlayer.targetPosition, lerpFactor);
      group.rotation.y = remotePlayer.targetRotationY;
      const isMoving = group.position.distanceTo(remotePlayer.targetPosition) > 0.1;
      remotePlayer.model.animate(elapsedSeconds, deltaSeconds, isMoving);

      // Show a health bar for 5s after this player was last hit in PVP.
      const showBar = elapsedSeconds - remotePlayer.lastPvpHitShownAt < 5;
      remotePlayer.healthBar.sprite.visible = showBar;
      if (showBar) {
        const maxHealth = CHARACTERS[remotePlayer.characterId]?.maxHealth ?? MAX_HEALTH;
        drawHealthBar(remotePlayer.healthBar, remotePlayer.row.currentHealth / maxHealth);
      }
    }
  }

  // Slam camera shake (D4-15): taste-tunable. A strike sets shakeMagnitude; each
  // frame adds a random offset (render-only cosmetic randomness — the determinism
  // rule binds spacetimedb/src, not the renderer) and decays the magnitude
  // exponentially over ~0.45s. Bumped after 04-07 playtest: 0.2/12 read as nothing.
  const SHAKE_START_MAGNITUDE = 0.45; // world units
  const SHAKE_DECAY_RATE = 7; // e^-3 ≈ 5% left after ~0.43s
  const SHAKE_FLOOR = 0.005; // below this the shake snaps off
  // Per-attack juice seeds (ANIM-04): swing lightest, swirl medium, slam full.
  // Handler-local by design — feel numbers, not client/server parity material.
  const SWING_BURST_PARTICLES = 10;
  const SWING_SHAKE_MAGNITUDE = 0.15;
  const SWIRL_BURST_PARTICLES = 18;
  const SWIRL_SHAKE_MAGNITUDE = 0.3;
  // Strike juice is LOCAL feedback: shake reads as "I was hit / something
  // landed nearby", so a strike farther than this from the local player plays
  // no juice at all, and within it both shake and SFX scale down linearly.
  // Without the gate, three goliaths chaining basics across the archipelago
  // shook and thundered on every client on the map.
  const STRIKE_JUICE_RANGE = 40; // world units
  let shakeMagnitude = 0;
  const desiredPosition = new THREE.Vector3();

  function updateCamera(deltaSeconds: number) {
    desiredPosition.copy(playerPosition).add(CAMERA_OFFSET);
    if (shakeMagnitude > 0) {
      desiredPosition.x += (Math.random() - 0.5) * 2 * shakeMagnitude;
      desiredPosition.y += (Math.random() - 0.5) * 2 * shakeMagnitude;
      desiredPosition.z += (Math.random() - 0.5) * 2 * shakeMagnitude;
      shakeMagnitude *= Math.exp(-SHAKE_DECAY_RATE * deltaSeconds);
      if (shakeMagnitude < SHAKE_FLOOR) shakeMagnitude = 0;
    }
    pixelRenderer.camera.position.lerp(desiredPosition, Math.min(1, deltaSeconds * 6));
    pixelRenderer.camera.lookAt(playerPosition.x, playerPosition.y + 1, playerPosition.z);
  }

  function pushHudState() {
    const skillReadyAt = skillReadyAtByCharacter.get(activeCharacter.id) ?? 0;
    // Per-character remaining cooldown — benched members keep cooling in real time.
    const skillCooldownByCharacter: Record<string, number> = {};
    for (const [id, readyAt] of skillReadyAtByCharacter) {
      const cooldownSeconds = CHARACTERS[id]?.skill.cooldownSeconds ?? 0;
      if (cooldownSeconds <= 0) continue;
      const fraction = Math.min(1, (readyAt - elapsedSeconds) / cooldownSeconds);
      if (fraction > 0.001) skillCooldownByCharacter[id] = fraction;
    }
    onHudChange({
      attackCooldownFraction: Math.max(
        0,
        Math.min(1, (lastSwingAt + COMBO_INPUT_COOLDOWN_SECONDS - elapsedSeconds) / COMBO_INPUT_COOLDOWN_SECONDS)
      ),
      skillCooldownFraction: Math.max(
        0,
        Math.min(1, (skillReadyAt - elapsedSeconds) / activeCharacter.skill.cooldownSeconds)
      ),
      skillCooldownByCharacter,
      inSafeZone: isInsideSafeZone(playerPosition.x, playerPosition.z),
      combo,
    });
  }

  /** Bodies shove each other apart (mass-weighted), then solids push everyone out. */
  const collisionBodies: CollisionBody[] = [];

  function resolveAllCollisions() {
    collisionBodies.length = 0;
    collisionBodies.push(playerCollisionBody);
    enemyRenderer.collectCollisionBodies(collisionBodies);
    goliathRenderer.collectCollisionBodies(collisionBodies);

    const playerBeforeX = playerPosition.x;
    const playerBeforeZ = playerPosition.z;
    resolveBodyCollisions(collisionBodies);
    const obstacles = world.getObstacles();
    for (const body of collisionBodies) resolveObstacleCollisions(body, obstacles);

    // A shove must not push the player up a wall (would snap them onto the
    // cliff next frame). Revert the horizontal push if it lands against a ledge.
    if (isGrounded()) {
      const pushedGround = reachableGroundHeight(playerPosition.x, playerPosition.z);
      if (pushedGround - playerPosition.y > MAX_STEP_UP) {
        playerPosition.x = playerBeforeX;
        playerPosition.z = playerBeforeZ;
      }
    }
    playerModel.group.position.copy(playerPosition);
  }

  let hudPushTimer = 0;

  function frame(frameTime: number) {
    animationFrameHandle = requestAnimationFrame(frame);
    const deltaSeconds = Math.min(0.05, (frameTime - lastFrameTime) / 1000 || 0.016);
    lastFrameTime = frameTime;
    elapsedSeconds += deltaSeconds;

    // Combo drops if the next hit does not land inside the (shrinking) window.
    if (combo > 0 && elapsedSeconds - lastComboHitAt > comboWindowSeconds(combo)) {
      combo = 0;
    }

    updateLocalPlayer(deltaSeconds);
    boostOrbit.update({
      position: playerPosition,
      transcend: activeTranscend,
      healthFraction: myServerHealth / activeCharacter.maxHealth,
      deltaSeconds,
    });
    effectSystem.update(deltaSeconds);
    // Enemies/goliaths are drawn straight from the server tables and interpolated;
    // the server tick owns their combat and damages players (reflected through
    // syncMyServerRow), so there is no local contact-damage path here anymore.
    enemyRenderer.update(deltaSeconds, world.getGroundHeight);
    // Re-derive each goliath's attack phase/progress from its row micros and
    // push the views BEFORE the renderer animates this frame's poses.
    goliathRenderer.setAttackViews(attackViewClock.refreshViews());
    goliathRenderer.update(deltaSeconds, world.getGroundHeight);
    telegraphSystem.update(deltaSeconds);
    updateGemDrops(deltaSeconds);
    updateShardDrops(deltaSeconds);
    resolveAllCollisions();
    damageNumbers.update(deltaSeconds);
    world.update(deltaSeconds);
    updateRemotePlayerViews(deltaSeconds);
    updateCamera(deltaSeconds);
    syncPositionToServer(deltaSeconds);
    healInSafeZone(deltaSeconds);

    hudPushTimer += deltaSeconds;
    if (hudPushTimer >= 0.1) {
      hudPushTimer = 0;
      pushHudState();
    }

    pixelRenderer.render(scene);
  }

  function removeRemotePlayer(identityHex: string, view: RemotePlayerView) {
    scene.remove(view.model.group);
    view.model.dispose();
    view.healthBar.texture.dispose();
    (view.healthBar.sprite.material as THREE.SpriteMaterial).dispose();
    remotePlayers.delete(identityHex);
  }

  const game: Game = {
    onPartySlotRequested: null,
    start() {
      lastFrameTime = performance.now();
      animationFrameHandle = requestAnimationFrame(frame);
    },
    dispose() {
      cancelAnimationFrame(animationFrameHandle);
      window.removeEventListener('pointerdown', handleNameplatePick, true);
      inputSystem.dispose();
      effectSystem.dispose();
      damageNumbers.dispose();
      enemyRenderer.dispose();
      goliathRenderer.dispose();
      telegraphSystem.dispose();
      audioSystem.dispose();
      for (const [identityHex, view] of remotePlayers) removeRemotePlayer(identityHex, view);
      scene.remove(playerModel.group);
      playerModel.dispose();
      scene.remove(boostOrbit.group);
      boostOrbit.dispose();
      world.dispose();
      pixelRenderer.dispose();
    },
    setOnSelectPlayer(handler) {
      onSelectPlayer = handler;
    },
    setPartyAllies(identityHexes) {
      partyAllyHexes = new Set(identityHexes);
    },
    setActiveCharacter(characterId) {
      const nextCharacter = CHARACTERS[characterId];
      if (!nextCharacter || nextCharacter.id === activeCharacter.id) return;
      activeCharacter = nextCharacter;
      scene.remove(playerModel.group);
      playerModel.dispose();
      playerModel = createCharacterModel(nextCharacter);
      playerModel.group.position.copy(playerPosition);
      scene.add(playerModel.group);
      effectSystem.spawnBurst(
        playerPosition.clone().setY(1.2),
        ELEMENTS[nextCharacter.element].color,
        22
      );
    },
    setActiveConstellation(constellation) {
      activeConstellation = constellation;
    },
    setActiveTranscend(transcend) {
      activeTranscend = transcend;
    },
    syncRemotePlayers(players, myIdentityHex) {
      const seenIdentities = new Set<string>();
      for (const row of players) {
        const identityHex = row.identity.toHexString();
        if (identityHex === myIdentityHex) continue;
        if (!row.online) continue;
        seenIdentities.add(identityHex);
        const existingView = remotePlayers.get(identityHex);
        if (!existingView) {
          const character = CHARACTERS[row.activeCharacterId] ?? CHARACTERS.zibo;
          const model = createCharacterModel(character);
          const nameSprite = createNameSprite(row.name);
          const healthBar = createHealthBar();
          model.group.add(nameSprite, healthBar.sprite);
          model.group.position.set(row.positionX, row.positionY, row.positionZ);
          scene.add(model.group);
          remotePlayers.set(identityHex, {
            model,
            nameSprite,
            characterId: row.activeCharacterId,
            row,
            targetPosition: new THREE.Vector3(row.positionX, row.positionY, row.positionZ),
            targetRotationY: row.rotationY,
            lastPvpSentAt: 0,
            lastPvpHitShownAt: 0,
            healthBar,
          });
          continue;
        }
        existingView.row = row;
        existingView.targetPosition.set(row.positionX, row.positionY, row.positionZ);
        existingView.targetRotationY = row.rotationY;
        if (existingView.characterId !== row.activeCharacterId) {
          const character = CHARACTERS[row.activeCharacterId] ?? CHARACTERS.zibo;
          const previousPosition = existingView.model.group.position.clone();
          scene.remove(existingView.model.group);
          existingView.model.dispose();
          existingView.model = createCharacterModel(character);
          existingView.model.group.add(createNameSprite(row.name), existingView.healthBar.sprite);
          existingView.model.group.position.copy(previousPosition);
          scene.add(existingView.model.group);
          existingView.characterId = row.activeCharacterId;
        }
      }
      for (const [identityHex, view] of remotePlayers) {
        if (!seenIdentities.has(identityHex)) removeRemotePlayer(identityHex, view);
      }
    },
    syncMyServerRow(row) {
      // A big health jump only happens on death respawn (heals are +60/s).
      const wasRespawned = row.currentHealth > myServerHealth + RESPAWN_HEALTH_JUMP;
      // Contact damage from worldTick only reaches us via this synced HP drop, so
      // float a "taken" number for it. Skip respawns (up-jump) and character
      // switches (different HP pool = false drop), and net out PvP already shown.
      const sameCharacter = row.activeCharacterId === lastSyncedCharacterId;
      const drop = myServerHealth - row.currentHealth;
      if (!wasRespawned && sameCharacter && drop > 0) {
        const enemyDamage = drop - pvpDamageSinceSync;
        if (enemyDamage >= TAKEN_DAMAGE_FLOOR) {
          game.spawnSelfNumber(
            enemyDamage,
            enemyDamage >= TAKEN_DAMAGE_CRIT_THRESHOLD ? 'takenCrit' : 'taken'
          );
        }
      }
      pvpDamageSinceSync = 0;
      lastSyncedCharacterId = row.activeCharacterId;
      myServerHealth = row.currentHealth;
      const serverPosition = new THREE.Vector3(row.positionX, row.positionY, row.positionZ);
      // HIT-01: a RAISED stunnedUntilMicros means a fresh knockback landed on me
      // — open the render stun window; the freshest server row is the lerp
      // target updateLocalPlayer pulls toward while the window is active.
      if (!hasBaselinedStun) {
        hasBaselinedStun = true;
      } else if (row.stunnedUntilMicros > lastStunnedUntilMicros) {
        // The strike event and my stunned row update ride the same worldTick
        // transaction, so a fresh (<600ms) strike is MY stun's cause — its
        // per-attack stunSeconds (ATTACK_RENDER mirror, parity-locked) sets the
        // freeze + popup DURATION; proximity to its center sets the intensity.
        // Stale/absent strike info (e.g. PVP-added stuns later) falls back to
        // the leapSlam-tuned default and mid intensity.
        const fresh = lastStrike && performance.now() - lastStrike.atMs < 600;
        const stunSeconds = fresh
          ? (ATTACK_RENDER[lastStrike!.attackId]?.stunSeconds ?? DEFAULT_STUN_RENDER_MS / 1000)
          : DEFAULT_STUN_RENDER_MS / 1000;
        // A zero-stun hit (swirl knockback, D5-12) must not freeze inputs or
        // fire a ghost STUNNED! popup — the punish window belongs to the player.
        if (stunSeconds > 0) {
          stunActiveUntilPerfMs = performance.now() + stunSeconds * 1000;
          const intensity = fresh
            ? THREE.MathUtils.clamp(
                1 -
                  Math.hypot(playerPosition.x - lastStrike!.x, playerPosition.z - lastStrike!.z) /
                    Math.max(0.001, lastStrike!.radius),
                0.25,
                1
              )
            : 0.5;
          onStunned?.(stunSeconds, intensity);
        }
      }
      lastStunnedUntilMicros = row.stunnedUntilMicros;
      stunServerPosition.copy(serverPosition);
      const isFarFromServer =
        playerPosition.distanceTo(serverPosition) > SERVER_TELEPORT_THRESHOLD;
      const voidRespawnConfirmed =
        hasReportedVoidDeath && serverPosition.y >= 0 && playerPosition.y < 0;
      if (wasRespawned || isFarFromServer || voidRespawnConfirmed) {
        playerPosition.copy(serverPosition);
        playerVelocityY = 0;
        fallPeakY = serverPosition.y;
        hasReportedVoidDeath = false;
      }
      game.setActiveCharacter(row.activeCharacterId);
    },
    spawnSelfNumber(amount, kind) {
      // Account PvP damage so the synced HP drop isn't re-floated as a "taken" number.
      if (kind === 'pvp' || kind === 'pvpCrit') pvpDamageSinceSync += amount;
      damageNumbers.spawn(playerPosition.clone().setY(playerPosition.y + 1.4), amount, kind);
    },
    spawnWorldNumber(positionX, positionZ, amount, kind) {
      damageNumbers.spawn(new THREE.Vector3(positionX, 1.2, positionZ), amount, kind);
    },
    flashRemoteHealth(identityHex) {
      // Display only — must NOT touch lastPvpSentAt: this fires for every
      // broadcast pvp_hit (rival attackers, our own echo) and would otherwise
      // re-arm our local send-rate gate on the shared victim.
      const view = remotePlayers.get(identityHex);
      if (view) view.lastPvpHitShownAt = elapsedSeconds;
    },
    spawnPlayerNumber(identityHex, amount, kind) {
      const view = remotePlayers.get(identityHex);
      if (!view) return; // victim despawned — drop silently
      const p = view.model.group.position;
      damageNumbers.spawn(p.clone().setY(p.y + 1), amount, kind);
    },
    syncGemDrops(drops) {
      const seen = new Set<string>();
      for (const drop of drops) {
        const key = drop.id.toString();
        seen.add(key);
        if (!gemDrops.has(key)) {
          const { mesh, baseY } = createGemMesh(drop);
          gemDrops.set(key, {
            mesh,
            rawId: drop.id,
            age: 0,
            baseY,
            sparkle: gemVisual(drop.amount).sparkle,
            sparkleAt: 0,
          });
        }
      }
      for (const [key, gem] of gemDrops) {
        if (seen.has(key)) continue;
        scene.remove(gem.mesh);
        gem.mesh.traverse(object => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose();
            (object.material as THREE.Material).dispose();
          }
        });
        gemDrops.delete(key);
        requestedGemPickups.delete(key);
      }
    },
    syncShardDrops(drops) {
      const seen = new Set<string>();
      for (const drop of drops) {
        const key = drop.id.toString();
        seen.add(key);
        if (!shardDrops.has(key)) {
          const { mesh, baseY } = createShardMesh(drop);
          shardDrops.set(key, { mesh, rawId: drop.id, age: 0, baseY, sparkleAt: 0 });
        }
      }
      for (const [key, shard] of shardDrops) {
        if (seen.has(key)) continue;
        scene.remove(shard.mesh);
        shard.mesh.traverse(object => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose();
            (object.material as THREE.Material).dispose();
          }
        });
        shardDrops.delete(key);
        requestedShardPickups.delete(key);
      }
    },
    syncEnemies(rows) {
      enemyRenderer.syncRows(rows);
    },
    syncGoliaths(rows) {
      goliathRenderer.syncRows(rows);
      attackViewClock.syncGoliaths(rows);
      // Re-gate telegraphs on the fresh alive flags (a death mid-windup must
      // drop the disc immediately, before the attack row itself updates).
      telegraphSystem.syncAttacks(attackViewClock.getAttackRows(), attackViewClock.isUnitAlive);
    },
    syncUnitAttacks(rows) {
      // Stored in the view clock so the frame loop can re-derive attack views
      // and syncGoliaths can re-gate telegraphs between row updates.
      attackViewClock.syncAttackRows(rows);
      telegraphSystem.syncAttacks(rows, attackViewClock.isUnitAlive);
    },
    handleAttackStrike(strike) {
      // Per-attack strike juice tiers (ANIM-04) — every component fires exactly
      // ONCE per event (the App.tsx useTable hook is this event table's ONLY
      // subscription). All juice draws from the EVENT's own coords + radius, so
      // it lands even when the telegraph ring is already torn down (the rim
      // flash raced the row's windup→recovery jump and often never showed —
      // 04-07 playtest).
      const groundY = world.getGroundHeight(strike.landingX, strike.landingZ);
      const landing = new THREE.Vector3(strike.landingX, groundY + 0.05, strike.landingZ);
      lastStrike = {
        attackId: strike.attackId,
        x: strike.landingX,
        z: strike.landingZ,
        radius: strike.radius,
        atMs: performance.now(),
      };
      // Distance gate + linear falloff (lastStrike above stays unconditional —
      // stun attribution must survive even for a strike this gate mutes): a
      // strike beyond STRIKE_JUICE_RANGE plays NOTHING here; inside it, shake
      // and SFX scale by proximity so a far fight registers as a distant thud,
      // not a full-strength "I was hit" jolt. Shake joins via max() so a faint
      // far strike can never cut short an ongoing stronger shake.
      const strikeDistance = Math.hypot(
        strike.landingX - playerPosition.x,
        strike.landingZ - playerPosition.z
      );
      if (strikeDistance >= STRIKE_JUICE_RANGE) return;
      const juiceFalloff = 1 - strikeDistance / STRIKE_JUICE_RANGE;
      // Juice tint comes from the ATTACK_RENDER element palette hint (05-05
      // round 2 — telegraphs stay Frost cyan; only the strike burst/shockwave
      // is element-colored). Unknown attackIds fall back to geo like the slam.
      const juiceColor = ATTACK_RENDER[strike.attackId]?.juiceColor ?? ELEMENTS.geo.color;
      if (strike.attackId === 'swordSwing') {
        // Lightest tier: small burst, light shake, whoosh — and NO shockwave
        // (a circular shockwave misreads the swing's cone).
        effectSystem.spawnBurst(landing, juiceColor, SWING_BURST_PARTICLES);
        telegraphSystem.flashStrike(`${strike.unitKind}:${strike.unitId}`);
        shakeMagnitude = Math.max(shakeMagnitude, SWING_SHAKE_MAGNITUDE * juiceFalloff);
        audioSystem.playSwing(juiceFalloff);
        return;
      }
      if (strike.attackId === 'swordSwirl') {
        // Medium tier: the swirl IS a circle, so the radius shockwave reads true.
        effectSystem.spawnBurst(landing, juiceColor, SWIRL_BURST_PARTICLES);
        effectSystem.spawnShockwave(landing, strike.radius, juiceColor);
        telegraphSystem.flashStrike(`${strike.unitKind}:${strike.unitId}`);
        shakeMagnitude = Math.max(shakeMagnitude, SWIRL_SHAKE_MAGNITUDE * juiceFalloff);
        audioSystem.playSwirl(juiceFalloff);
        return;
      }
      // Default (leapSlam + any unknown attackId): the D4-15 full package.
      effectSystem.spawnBurst(landing, juiceColor, 26);
      effectSystem.spawnShockwave(landing, strike.radius, juiceColor);
      telegraphSystem.flashStrike(`${strike.unitKind}:${strike.unitId}`);
      shakeMagnitude = Math.max(shakeMagnitude, SHAKE_START_MAGNITUDE * juiceFalloff);
      audioSystem.playSlam(juiceFalloff);
    },
    handleRemoteSkillCast(cast) {
      const character = CHARACTERS[cast.characterId];
      if (!character) return;
      const casterView = [...remotePlayers.values()].find(
        view => view.row.identity.toHexString() === cast.caster.toHexString()
      );
      effectSystem.spawnSkillEffect({
        skill: character.skill,
        element: character.element,
        origin: new THREE.Vector3(
          cast.originX,
          world.getGroundHeight(cast.originX, cast.originZ) + 1,
          cast.originZ
        ),
        direction: { x: cast.directionX, z: cast.directionZ },
        applyDamage: null,
        followPosition: casterView ? () => casterView.model.group.position : undefined,
      });
    },
    handleRemotePlayerAttack(attack) {
      // Purely visual: render another player's bow/book shot flying from where it
      // was fired. Damage is server-authoritative (pvpHit), so applyDamage stays null.
      const character = CHARACTERS[attack.characterId];
      if (!character) return;
      const weapon = WEAPONS[character.weapon];
      if (!weapon.isRanged) return;
      effectSystem.spawnProjectile({
        origin: new THREE.Vector3(
          attack.originX,
          world.getGroundHeight(attack.originX, attack.originZ) + 1.2,
          attack.originZ
        ),
        direction: { x: attack.directionX, z: attack.directionZ },
        speed: weapon.projectileSpeed,
        damage: 0,
        element: character.element,
        hitRadius: RANGED_HIT_RADIUS,
        applyDamage: null,
        damageKind: 'normal',
      });
    },
    setTouchMove(x, z) {
      inputSystem.setTouchMove(x, z);
    },
    pressTouchButton(button) {
      inputSystem.pressTouchButton(button);
    },
    releaseTouchButton(button) {
      inputSystem.releaseTouchButton(button);
    },
    setInputEnabled(enabled) {
      inputSystem.setEnabled(enabled);
    },
    isStunned() {
      return performance.now() < stunActiveUntilPerfMs;
    },
  };

  return game;
}
