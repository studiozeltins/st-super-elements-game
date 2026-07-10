import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables, type DbConnection } from './module_bindings';
import type { Player } from './module_bindings/types';
import { createGame, type Game, type HudState } from './game/createGame';
import { CHARACTERS } from './game/data/characters';
import { ELEMENTS } from './game/data/elements';
import { MAX_HEALTH, RAID_PARTY_SIZE } from './game/data/constants';
import { AuthScreen } from './ui/AuthScreen';
import { deriveKey } from './auth/hash';
import { Modal } from './ui/Modal';
import { PlayerSheet } from './ui/PlayerSheet';
import { PartySheet } from './ui/PartySheet';
import { PartyToast } from './ui/PartyToast';
import { PartyFrames } from './ui/PartyFrames';
import { Hud } from './ui/Hud';
import { SettingsScreen } from './ui/SettingsScreen';
import { StatsOverlay } from './ui/StatsOverlay';
import { GachaScreen, type GachaTab, type PityInfo, type PullView } from './ui/GachaScreen';
import { CharacterScreen } from './ui/CharacterScreen';
import { DEFAULT_HUD_THEME, isHudTheme } from './styles/hud/themes';

const PARTY_SIZE = 4;

const INITIAL_HUD_STATE: HudState = {
  attackCooldownFraction: 0,
  skillCooldownFraction: 0,
  skillCooldownByCharacter: {},
  inSafeZone: true,
  combo: 0,
};

export default function App() {
  const { isActive, identity, getConnection } = useSpacetimeDB();
  const connection = getConnection() as DbConnection | null;
  // The device identity (anonymous, per-browser). Accounts sit on top of it: an
  // account_link row maps this device to the account's CANONICAL identity, which
  // is what all gameplay rows are keyed by. myIdentityHex below is the canonical
  // one, so every ownership/event filter downstream keys off the account.
  const deviceIdentityHex = identity?.toHexString() ?? null;
  const myIdentityRef = useRef<string | null>(null);
  // Session eviction tracking: whether we were logged in (to notice the link row
  // vanishing when another device claims the account) and whether the current
  // logout was user-initiated (so we don't show the "kicked" notice for it).
  const wasLoggedInRef = useRef(false);
  const didLogoutRef = useRef(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const partyRef = useRef<string[]>([]);
  const [hudState, setHudState] = useState<HudState>(INITIAL_HUD_STATE);
  const [isGachaOpen, setIsGachaOpen] = useState(false);
  const [gachaTab, setGachaTab] = useState<GachaTab>('banners');
  // The owned-only character detail/management modal (distinct from the VAROŅI
  // collection grid inside the wish screen). Holds the viewed character id.
  const [characterPageId, setCharacterPageId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showFps, setShowFps] = useState(() => localStorage.getItem('settings.showFps') === '1');
  const [showPing, setShowPing] = useState(() => localStorage.getItem('settings.showPing') === '1');
  // Which gameplay-HUD skin is active. Drives `data-hud-theme` on the .app root;
  // the CSS in src/styles/hud/ reskins the HUD accordingly. Persisted per device.
  const [hudTheme, setHudTheme] = useState(() => {
    const saved = localStorage.getItem('settings.hudTheme');
    return isHudTheme(saved) ? saved : DEFAULT_HUD_THEME;
  });
  const [pullResults, setPullResults] = useState<PullView[] | null>(null);
  const pullBufferRef = useRef<PullView[]>([]);
  const flushTimerRef = useRef<number | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  // Player-party (Bars) UI state, lifted here so the HUD chip, the online-players
  // surface, and the slide-out sheet all share it. `sheetTargetHex` stores the
  // tapped player's canonical hex; the row itself is re-derived so the sheet stays
  // reactive to name/character/online changes while open.
  const [sheetTargetHex, setSheetTargetHex] = useState<string | null>(null);
  // Invite ids whose transient toast has been dismissed (expired at ~10s, or acted
  // on). A dismissed toast never re-appears, but the invite stays in the Settings
  // missed-invites list because the server row persists (D-08). Keyed by id string.
  const [dismissedToastIds, setDismissedToastIds] = useState<string[]>([]);
  // Shard loss/gain feedback: a --pulse (gain) / --drain (loss) flash on the shard
  // counter and a self-facing toast on a real shard MOVEMENT. Disambiguated purely
  // client-side (no new broadcast table): a recent pvpHit on me marks a DOWN as a
  // theft (else a PVE drop); a recent local collectShard request marks an UP as a
  // plain pickup (pulse only, no toast) vs. a kill-steal.
  const prevShardsRef = useRef<number | null>(null);
  const lastPvpHitOnMeAtRef = useRef(-Infinity);
  const lastShardPickupAtRef = useRef(-Infinity);
  const [shardFlash, setShardFlash] = useState<{ kind: 'pulse' | 'drain'; key: number } | null>(
    null
  );
  const [shardToast, setShardToast] = useState<{ text: string; key: number } | null>(null);

  // Resolve this device to its account's canonical identity BEFORE building the
  // subscription. The party_invite filter keys off the canonical recipient, and
  // every ownership/event comparison downstream uses this canonical hex — never
  // the per-device anonymous identity.
  const [accountLinks] = useTable(tables.accountLink);
  const myLink = accountLinks.find(link => link.identity.toHexString() === deviceIdentityHex);
  const myIdentityHex = myLink?.canonicalIdentity.toHexString() ?? null;
  const myCanonicalIdentity = myLink?.canonicalIdentity ?? null;
  myIdentityRef.current = myIdentityHex;

  useEffect(() => {
    if (!connection || !isActive || !identity) {
      setIsSubscribed(false);
      return;
    }
    const subscription = connection
      .subscriptionBuilder()
      .onApplied(() => setIsSubscribed(true))
      .subscribe([
        // Only this device's own link row — learns our canonical identity.
        tables.accountLink.where(row => row.identity.eq(identity)),
        tables.player,
        // skillCast / pullResult / rangedAttack / healEvent are EVENT tables:
        // their useTable hooks below open the ONLY subscription. Listing them
        // here too would deliver every event row twice (double VFX/numbers) —
        // same invariant as pvpHit/enemyHit.
        tables.gemDrop,
        tables.shardDrop,
        tables.enemy,
        tables.goliath,
        // unit_attack is a normal CACHED table (rows persist through the FSM
        // cycle), so it takes the manual subscription + plain useTable below.
        tables.unitAttack,
        tables.party,
        tables.partyMember,
        // Owner-scoped tables are filtered SERVER-SIDE to my canonical identity.
        // weapon_item alone holds thousands of rows across all accounts (one per
        // gacha pull); subscribing to the full table made every App render scan
        // and hex-compare all of them (~60k identity serializations/s = the
        // 144→40fps regression). The matching useTable hooks below carry the
        // same filter, so the client cache only ever holds MY rows.
        ...(myCanonicalIdentity
          ? [
              tables.ownedCharacter.where(row => row.owner.eq(myCanonicalIdentity)),
              tables.characterActivation.where(row => row.owner.eq(myCanonicalIdentity)),
              tables.bannerPity.where(row => row.owner.eq(myCanonicalIdentity)),
              tables.weaponItem.where(row => row.owner.eq(myCanonicalIdentity)),
              // Only invites addressed to ME (canonical recipient) — a player must
              // never receive invites meant for others (T-05-05, Information Disclosure).
              tables.partyInvite.where(row => row.recipientIdentity.eq(myCanonicalIdentity)),
            ]
          : []),
      ]);
    return () => {
      try {
        subscription.unsubscribe();
      } catch {
        // Subscription may already be gone when the connection dropped.
      }
    };
    // Re-subscribe once the canonical identity resolves so the party_invite filter
    // binds to the real recipient (myCanonicalIdentity read via closure).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, isActive, identity, myIdentityHex]);

  const [players] = useTable(tables.player);
  // Owner-scoped hooks mirror the manual subscription's server-side filter —
  // disabled until the canonical identity resolves so no hook ever subscribes
  // to (and caches) every account's rows. See the subscribe list above.
  const haveCanonical = myCanonicalIdentity !== null;
  const [ownedCharacterRows] = useTable(
    haveCanonical
      ? tables.ownedCharacter.where(row => row.owner.eq(myCanonicalIdentity))
      : tables.ownedCharacter,
    { enabled: haveCanonical }
  );
  const [activationRows] = useTable(
    haveCanonical
      ? tables.characterActivation.where(row => row.owner.eq(myCanonicalIdentity))
      : tables.characterActivation,
    { enabled: haveCanonical }
  );
  const [bannerPityRows] = useTable(
    haveCanonical
      ? tables.bannerPity.where(row => row.owner.eq(myCanonicalIdentity))
      : tables.bannerPity,
    { enabled: haveCanonical }
  );
  const [weaponItemRows] = useTable(
    haveCanonical
      ? tables.weaponItem.where(row => row.owner.eq(myCanonicalIdentity))
      : tables.weaponItem,
    { enabled: haveCanonical }
  );
  const [gemDropRows] = useTable(tables.gemDrop);
  const [shardDropRows] = useTable(tables.shardDrop);
  const [enemyRows] = useTable(tables.enemy);
  const [goliathRows] = useTable(tables.goliath);
  const [unitAttackRows] = useTable(tables.unitAttack);
  const [parties] = useTable(tables.party);
  const [partyMembers] = useTable(tables.partyMember);
  const [myInvites] = useTable(tables.partyInvite);

  useTable(tables.skillCast, {
    onInsert: cast => {
      if (cast.caster.toHexString() === myIdentityRef.current) return;
      gameRef.current?.handleRemoteSkillCast(cast);
    },
  });
  // Another player fired a ranged shot → render its projectile (the shooter drew
  // its own locally, so skip our own events).
  useTable(tables.rangedAttack, {
    onInsert: attack => {
      if (attack.attacker.toHexString() === myIdentityRef.current) return;
      gameRef.current?.handleRemotePlayerAttack(attack);
    },
  });
  // Each pull emits one pull_result event row; collect a request's rows (they
  // arrive in a burst) and flush them together into the reveal screen.
  useTable(tables.pullResult, {
    onInsert: row => {
      if (row.owner.toHexString() !== myIdentityRef.current) return;
      pullBufferRef.current.push({
        slot: row.slot,
        kind: row.kind,
        itemId: row.itemId,
        rarity: row.rarity,
        isNew: row.isNew,
        isFeatured: row.isFeatured,
        constellation: row.constellation,
        shardMinted: row.shardMinted,
      });
      if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = window.setTimeout(() => {
        setPullResults([...pullBufferRef.current]);
      }, 120);
    },
  });
  // Server-authoritative PVP hit → truthful {amount, isCrit, attacker} for all
  // three viewer roles (D3-05, D2-02). EVENT table: its useTable is the ONLY
  // subscription — it must not also sit in the manual list above (double
  // delivery = double numbers).
  useTable(tables.pvpHit, {
    onInsert: row => {
      const targetHex = row.target.toHexString();
      if (targetHex === myIdentityRef.current) {
        // Victim: mark the PVP context so a coinciding shard DOWN reads as a
        // theft, not a PVE drop (the shard only actually leaves on a fatal hit;
        // a non-fatal hit simply produces no shard diff, so no false toast fires).
        lastPvpHitOnMeAtRef.current = performance.now();
        gameRef.current?.spawnSelfNumber(row.amount, row.isCrit ? 'pvpCrit' : 'pvp');
        return;
      }
      // Someone else got hit — show their health bar (I'm the attacker/bystander).
      gameRef.current?.flashRemoteHealth(targetHex);
      if (row.attacker.toHexString() === myIdentityRef.current) {
        // D3-05: own non-crit already drawn locally in applyPvpDamage — suppress;
        // upgrade to the big crit number at the victim's live position on crit.
        if (row.isCrit) gameRef.current?.spawnPlayerNumber(targetHex, row.amount, 'crit');
        return;
      }
      // Spectator: full shared visibility (D2-02).
      gameRef.current?.spawnPlayerNumber(targetHex, row.amount, row.isCrit ? 'crit' : 'normal');
    },
  });
  // Server-authoritative enemy/goliath hit → the {amount, isCrit, position} truth
  // (Plan 02). EVERY hit — my own and other players' — floats its number at the
  // ENEMY's exact position, colored by the server's isCrit (never a client crit
  // roll). Rendering own hits from the same event (not a player-anchored local
  // prediction) is what puts the crit ON the enemy that took it; LAN latency
  // makes the tiny delay imperceptible.
  //
  // enemy_hit is an EVENT table, so it must NOT also appear in the manual
  // subscription list above — useTable already opens its own subscription, and a
  // second overlapping subscription would deliver each event row twice, firing
  // this onInsert twice (two numbers ~0.16u apart). One subscription = one number.
  useTable(tables.enemyHit, {
    onInsert: hit => {
      gameRef.current?.spawnWorldNumber(
        hit.positionX,
        hit.positionZ,
        hit.amount,
        hit.isCrit ? 'crit' : 'normal'
      );
    },
  });
  // A unit attack landed (leapSlam impact) → the one-shot strike juice: impact
  // burst + telegraph rim flash + small camera shake + slam SFX (ANIM-04).
  //
  // attack_strike is an EVENT table, so it must NOT also appear in the manual
  // subscription list above — useTable already opens its own subscription, and a
  // second overlapping subscription would deliver each event row twice, firing
  // this onInsert twice (double shake/SFX per slam). One subscription = one slam.
  useTable(tables.attackStrike, {
    onInsert: strike => gameRef.current?.handleAttackStrike(strike),
  });
  // A healer restored one of my characters → green +number.
  useTable(tables.healEvent, {
    onInsert: row => {
      if (row.owner.toHexString() !== myIdentityRef.current) return;
      gameRef.current?.spawnSelfNumber(row.amount, 'heal');
    },
  });

  const myPlayer: Player | undefined = players.find(
    row => row.identity.toHexString() === myIdentityHex
  );
  // useTable snapshots are reference-stable until THEIR table changes, so these
  // memos skip the identity hex-compares on the ~16/s unrelated transactions
  // (enemy movement, position echoes). Re-filtering thousands of weapon_item
  // rows on every render was the 144→40fps regression.
  const myCharacterIds = useMemo(
    () =>
      ownedCharacterRows
        .filter(row => row.owner.toHexString() === myIdentityHex)
        .sort((rowA, rowB) => (rowA.id < rowB.id ? -1 : 1))
        .map(row => row.characterId),
    [ownedCharacterRows, myIdentityHex]
  );
  // Prefer the player's chosen party order; fall back to the first owned characters.
  const chosenParty = (myPlayer?.partyOrder ?? []).filter(id => myCharacterIds.includes(id));
  const partyCharacterIds =
    chosenParty.length > 0 ? chosenParty.slice(0, PARTY_SIZE) : myCharacterIds.slice(0, PARTY_SIZE);
  partyRef.current = partyCharacterIds;

  const { partyHealthById, constellationById, transcendById } = useMemo(() => {
    const health: Record<string, number> = {};
    const constellation: Record<string, number> = {};
    const transcend: Record<string, number> = {};
    for (const row of ownedCharacterRows) {
      if (row.owner.toHexString() !== myIdentityHex) continue;
      const maxHealth = CHARACTERS[row.characterId]?.maxHealth ?? MAX_HEALTH;
      health[row.characterId] = maxHealth > 0 ? row.currentHealth / maxHealth : 1;
      constellation[row.characterId] = row.constellation;
      transcend[row.characterId] = row.transcendLevel;
    }
    return { partyHealthById: health, constellationById: constellation, transcendById: transcend };
  }, [ownedCharacterRows, myIdentityHex]);

  // Manually-activated stars per character. No row = full constellation is active
  // (matches the server fallback), so untouched characters behave as before.
  const activatedById = useMemo(() => {
    const activated: Record<string, number> = {};
    for (const row of activationRows) {
      if (row.owner.toHexString() !== myIdentityHex) continue;
      activated[row.characterId] = row.activatedConstellation;
    }
    return activated;
  }, [activationRows, myIdentityHex]);
  const effectiveConstellation = (characterId: string) =>
    activatedById[characterId] ?? constellationById[characterId] ?? 0;

  const pityByBanner = useMemo(() => {
    const pity: Record<string, PityInfo> = {};
    for (const row of bannerPityRows) {
      if (row.owner.toHexString() !== myIdentityHex) continue;
      pity[row.bannerId] = {
        pullsSinceFiveStar: row.pullsSinceFiveStar,
        guaranteedFeatured: row.guaranteedFeatured,
        totalPulls: row.totalPulls,
      };
    }
    return pity;
  }, [bannerPityRows, myIdentityHex]);

  const myWeaponItems = useMemo(
    () =>
      weaponItemRows
        .filter(row => row.owner.toHexString() === myIdentityHex)
        .map(row => ({ weaponId: row.weaponId, rarity: row.rarity })),
    [weaponItemRows, myIdentityHex]
  );

  // ---- Player-party (Bars) derivations — all identity comparisons key off the
  // canonical myIdentityHex, since party_member.identity is the canonical id. ----
  const myMembership = partyMembers.find(
    member => member.identity.toHexString() === myIdentityHex
  );
  const myPartyId = myMembership?.partyId ?? null;
  const myRoster =
    myPartyId !== null ? partyMembers.filter(member => member.partyId === myPartyId) : [];
  const myPartyCount = myRoster.length;
  const isInParty = myPartyId !== null;
  // Stable key of my party's identities → pushed to the game so PVP skips allies.
  const partyAllyKey = myRoster
    .map(member => member.identity.toHexString())
    .sort()
    .join(',');
  const isPartyFull = myPartyCount >= RAID_PARTY_SIZE;
  const myPartyLeaderHex =
    myPartyId !== null
      ? parties.find(party => party.id === myPartyId)?.leaderIdentity.toHexString() ?? null
      : null;
  const iAmLeader = myPartyLeaderHex !== null && myPartyLeaderHex === myIdentityHex;
  // All my party members on one page (leader first, then oldest-joined) for the
  // party-management sheet. Player row supplies name / character / online / health.
  const partyMemberViews = [...myRoster]
    .sort((a, b) => {
      const aLeader = a.identity.toHexString() === myPartyLeaderHex;
      const bLeader = b.identity.toHexString() === myPartyLeaderHex;
      if (aLeader !== bLeader) return aLeader ? -1 : 1;
      return a.joinedAt.microsSinceUnixEpoch < b.joinedAt.microsSinceUnixEpoch ? -1 : 1;
    })
    .map(member => {
      const hex = member.identity.toHexString();
      const player = players.find(p => p.identity.toHexString() === hex);
      return {
        hex,
        name: player?.name ?? 'Spēlētājs',
        activeCharacterId: player?.activeCharacterId ?? '',
        online: player?.online ?? false,
        currentHealth: player?.currentHealth ?? 0,
        isLeader: hex === myPartyLeaderHex,
        isSelf: hex === myIdentityHex,
      };
    });

  // The tapped target for the slide-out sheet, re-derived from the live player rows.
  const sheetTarget = sheetTargetHex
    ? players.find(player => player.identity.toHexString() === sheetTargetHex) ?? null
    : null;
  const targetMembership = sheetTargetHex
    ? partyMembers.find(member => member.identity.toHexString() === sheetTargetHex)
    : undefined;
  const sharesPartyWithTarget =
    isInParty && targetMembership !== undefined && targetMembership.partyId === myPartyId;

  // Invites addressed to me (the subscription already filters to my canonical id;
  // the extra guard keeps the derivation correct against any cache overlap), newest
  // first so the freshest invite tops the toast stack.
  const myPendingInvites = myInvites
    .filter(invite => invite.recipientIdentity.toHexString() === myIdentityHex)
    .sort((a, b) =>
      a.createdAt.microsSinceUnixEpoch < b.createdAt.microsSinceUnixEpoch ? 1 : -1
    );

  // Resolve each pending invite to a display view (kind + other player's name +
  // ready-to-render Latvian message). kind is DISPLAY only: 'request' = the joiner
  // asked to join MY party (name = joiner); 'invite' = a leader invited ME (name =
  // that party's leader). Shared by the toast AND the Settings missed list.
  // Classify each pending row into a resolution FLOW from my current party state.
  // The flow drives both the toast copy and which action buttons render (onClick is
  // attached at render time, where the reducer callbacks are in scope).
  type InviteFlow = 'accept' | 'merge' | 'poach_forward' | 'forward' | 'promote';
  const invitesWithNames = myPendingInvites.map(invite => {
    const kind = invite.kind as 'invite' | 'request' | 'promote';
    const partyLeaderHex = parties
      .find(party => party.id === invite.partyId)
      ?.leaderIdentity.toHexString();
    // For invites the "other" is the inviting party's leader; for request/promote
    // it's the joiner (the one asking).
    const otherHex =
      kind === 'invite' ? partyLeaderHex ?? null : invite.joinerIdentity.toHexString();
    const name =
      players.find(player => player.identity.toHexString() === otherHex)?.name ?? 'Spēlētājs';

    let flow: InviteFlow;
    if (kind === 'promote') {
      flow = 'promote';
    } else if (kind === 'request') {
      // I can accept only if I lead that party; otherwise I relay it to the leader.
      flow = partyLeaderHex === myIdentityHex ? 'accept' : 'forward';
    } else {
      // An invite into another party — resolve by my own standing.
      flow = !isInParty ? 'accept' : iAmLeader ? 'merge' : 'poach_forward';
    }

    const message =
      flow === 'merge'
        ? `${name} aicina apvienot barus`
        : flow === 'poach_forward'
          ? `${name} aicina savā barā — pievienoties vai nodot vadonim?`
          : flow === 'forward'
            ? `${name} lūdz pievienoties — nodot vadonim?`
            : flow === 'promote'
              ? `${name} lūdz iecelt par vadoni`
              : kind === 'request'
                ? `${name} lūdz pievienoties tavam baram`
                : `${name} aicina tevi savā barā`;
    return { id: invite.id, kind, name, message, flow };
  });

  // Live toasts = pending invites not yet toast-dismissed. The Settings missed list
  // shows ALL of invitesWithNames (including dismissed/expired ones).
  const toastInvites = invitesWithNames.filter(
    invite => !dismissedToastIds.includes(invite.id.toString())
  );

  // Drop an invite's toast from view WITHOUT calling any reducer — the server row
  // persists, so it stays actionable in Settings' missed list (D-08).
  const dismissToast = useCallback((inviteId: bigint) => {
    const key = inviteId.toString();
    setDismissedToastIds(prev => (prev.includes(key) ? prev : [...prev, key]));
  }, []);

  const pullBanner = useCallback(
    (bannerId: string, count: number) => {
      pullBufferRef.current = [];
      setPullResults(null);
      connection?.reducers.pullBanner({ bannerId, count });
    },
    [connection]
  );

  const setParty = useCallback(
    (characterIds: string[]) => {
      connection?.reducers.setParty({ characterIds });
    },
    [connection]
  );

  const selectCharacter = useCallback(
    (characterId: string) => {
      connection?.reducers.setActiveCharacter({ characterId });
      gameRef.current?.setActiveCharacter(characterId);
    },
    [connection]
  );

  const setConstellation = useCallback(
    (characterId: string, level: number) => {
      connection?.reducers.setConstellation({ characterId, level });
    },
    [connection]
  );

  const transcendCharacter = useCallback(
    (characterId: string) => {
      connection?.reducers.transcendCharacter({ characterId });
    },
    [connection]
  );

  // ---- Player-party (Bars) reducer callers ----
  // The client only ever supplies targetIdentity/inviteId as a lookup; the server
  // resolves the authenticated actor from ctx.sender (T-05-01, Spoofing).
  const invitePlayer = useCallback(
    (targetIdentity: Player['identity']) => {
      connection?.reducers.invitePlayer({ targetIdentity });
    },
    [connection]
  );
  const requestJoin = useCallback(
    (targetIdentity: Player['identity']) => {
      connection?.reducers.requestJoin({ targetIdentity });
    },
    [connection]
  );
  const acceptInvite = useCallback(
    (inviteId: bigint) => {
      connection?.reducers.acceptInvite({ inviteId });
    },
    [connection]
  );
  const declineInvite = useCallback(
    (inviteId: bigint) => {
      connection?.reducers.declineInvite({ inviteId });
    },
    [connection]
  );
  const forwardRequest = useCallback(
    (inviteId: bigint) => {
      connection?.reducers.forwardRequest({ inviteId });
    },
    [connection]
  );
  const acceptMerge = useCallback(
    (inviteId: bigint) => connection?.reducers.acceptMerge({ inviteId }),
    [connection]
  );
  const acceptPoach = useCallback(
    (inviteId: bigint) => connection?.reducers.acceptPoach({ inviteId }),
    [connection]
  );
  const forwardInviteToLeader = useCallback(
    (inviteId: bigint) => connection?.reducers.forwardInviteToLeader({ inviteId }),
    [connection]
  );
  const acceptPromotion = useCallback(
    (inviteId: bigint) => connection?.reducers.acceptPromotion({ inviteId }),
    [connection]
  );
  const requestPromotion = useCallback(
    () => connection?.reducers.requestPromotion({}),
    [connection]
  );
  const kickMemberByHex = useCallback(
    (hex: string) => {
      const target = players.find(player => player.identity.toHexString() === hex);
      if (target) connection?.reducers.kickMember({ targetIdentity: target.identity });
    },
    [connection, players]
  );
  const disbandPlayerParty = useCallback(() => {
    connection?.reducers.disbandParty({});
  }, [connection]);
  const leavePlayerParty = useCallback(() => {
    connection?.reducers.leaveParty({});
  }, [connection]);
  const promoteLeaderByHex = useCallback(
    (hex: string) => {
      const target = players.find(player => player.identity.toHexString() === hex);
      if (target) connection?.reducers.promoteLeader({ targetIdentity: target.identity });
    },
    [connection, players]
  );

  // Map an invite's resolution flow to the toast's positive action button(s). Each
  // fires its reducer then dismisses the toast; decline is added by PartyToast.
  const toastActionsFor = (flow: InviteFlow, id: bigint) => {
    const act = (fn: (inviteId: bigint) => unknown) => () => {
      fn(id);
      dismissToast(id);
    };
    switch (flow) {
      case 'merge':
        return [{ key: 'merge', icon: '⚑', label: 'Apvienot barus', onClick: act(acceptMerge) }];
      case 'poach_forward':
        return [
          { key: 'poach', icon: '⇄', label: 'Pievienoties (pamest pašreizējo baru)', onClick: act(acceptPoach) },
          { key: 'fwd', icon: '⤴', label: 'Nodot savam vadonim', onClick: act(forwardInviteToLeader) },
        ];
      case 'forward':
        return [{ key: 'fwd', icon: '⤴', label: 'Nodot vadonim', onClick: act(forwardRequest) }];
      case 'promote':
        return [{ key: 'promo', icon: '♛', label: 'Iecelt par vadoni', onClick: act(acceptPromotion) }];
      case 'accept':
      default:
        return [{ key: 'accept', icon: '✓', label: 'Pieņemt', onClick: act(acceptInvite) }];
    }
  };

  const handleRegister = useCallback(
    async (username: string, email: string, password: string) => {
      if (!connection) return;
      setAuthError(null);
      setAuthBusy(true);
      try {
        const derivedKey = deriveKey(username, password);
        await connection.reducers.register({ username, email, derivedKey });
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Reģistrācija neizdevās');
      } finally {
        setAuthBusy(false);
      }
    },
    [connection]
  );

  const handleLogin = useCallback(
    async (username: string, password: string) => {
      if (!connection) return;
      setAuthError(null);
      setAuthBusy(true);
      try {
        const derivedKey = deriveKey(username, password);
        await connection.reducers.login({ username, derivedKey });
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Ienākšana neizdevās');
      } finally {
        setAuthBusy(false);
      }
    },
    [connection]
  );

  const handleLogout = useCallback(() => {
    didLogoutRef.current = true; // suppress the "kicked" notice for a self logout
    connection?.reducers.logout({});
  }, [connection]);

  const isLoggedIn = Boolean(myLink);
  const hasJoined = Boolean(myPlayer);

  // Session eviction: another device logging into this account deletes our
  // account_link row server-side. When that row vanishes while we are still
  // connected (and we didn't log out ourselves), surface a notice and let the
  // render fall back to the auth screen.
  useEffect(() => {
    if (isLoggedIn) {
      wasLoggedInRef.current = true;
      return;
    }
    if (!wasLoggedInRef.current || !isActive) return;
    wasLoggedInRef.current = false;
    if (didLogoutRef.current) {
      didLogoutRef.current = false;
      return;
    }
    setAuthError(
      'Tu tiki izrakstīts, jo šajā kontā pieteicās cita ierīce. Lūdzu piesakies vēlreiz.'
    );
  }, [isLoggedIn, isActive]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !connection || !hasJoined || gameRef.current) return;

    const game = createGame(
      canvas,
      {
        sendPosition: (positionX, positionY, positionZ, rotationY) =>
          connection.reducers.updatePosition({ positionX, positionY, positionZ, rotationY }),
        sendCastSkill: (skillId, originX, originZ, directionX, directionZ) =>
          connection.reducers.castSkill({ skillId, originX, originZ, directionX, directionZ }),
        sendAttackPlayer: (target, isSkill, comboCount) =>
          connection.reducers.attackPlayer({ targetIdentity: target.identity, isSkill, comboCount }),
        sendTakeDamage: damage => connection.reducers.takeDamage({ damage }),
        sendHeal: amount => connection.reducers.healInSafeZone({ amount }),
        sendHealParty: comboCount => connection.reducers.healParty({ comboCount }),
        sendAttackEnemies: (centerX, centerZ, radius, isSkill, comboCount) =>
          connection.reducers.attackEnemies({ centerX, centerZ, radius, isSkill, comboCount }),
        sendAttackRay: (originX, originZ, directionX, directionZ, range, hitRadius, isSkill, comboCount) =>
          connection.reducers.attackRay({ originX, originZ, dirX: directionX, dirZ: directionZ, range, hitRadius, isSkill, comboCount }),
        sendCollectGem: dropId => connection.reducers.collectGem({ dropId }),
        sendCollectShard: dropId => {
          // A pickup is the only shard GAIN the client itself initiates — record it
          // so the diff effect can tell a plain walk-over (pulse only) from a
          // kill-steal (which fires the "Nozagi" toast).
          lastShardPickupAtRef.current = performance.now();
          connection.reducers.collectShard({ dropId });
        },
        sendFallToDeath: () => connection.reducers.fallToDeath({}),
      },
      setHudState
    );
    game.onPartySlotRequested = slotIndex => {
      const characterId = partyRef.current[slotIndex];
      if (characterId) selectCharacter(characterId);
    };
    // Tap/click a remote player's floating nameplate → open their slide-out sheet.
    game.setOnSelectPlayer(hex => setSheetTargetHex(hex));
    game.start();
    gameRef.current = game;

    return () => {
      game.dispose();
      gameRef.current = null;
    };
  }, [connection, hasJoined, selectCharacter]);

  useEffect(() => {
    gameRef.current?.syncRemotePlayers(players, myIdentityHex);
    if (myPlayer) gameRef.current?.syncMyServerRow(myPlayer);
  }, [players, myPlayer, myIdentityHex]);

  useEffect(() => {
    gameRef.current?.syncGemDrops(gemDropRows);
  }, [gemDropRows]);

  useEffect(() => {
    gameRef.current?.syncShardDrops(shardDropRows);
  }, [shardDropRows]);

  useEffect(() => {
    gameRef.current?.setPartyAllies(partyAllyKey ? partyAllyKey.split(',') : []);
  }, [partyAllyKey]);

  useEffect(() => {
    gameRef.current?.syncEnemies(enemyRows);
  }, [enemyRows]);

  useEffect(() => {
    gameRef.current?.syncGoliaths(goliathRows);
  }, [goliathRows]);

  useEffect(() => {
    gameRef.current?.syncUnitAttacks(unitAttackRows);
  }, [unitAttackRows]);

  // Shard counter flash + movement toast, driven by the reactive transcendShards diff.
  useEffect(() => {
    const shards = myPlayer?.transcendShards;
    if (shards === undefined) return;
    const prev = prevShardsRef.current;
    prevShardsRef.current = shards;
    // Skip the first observed value (mount / login) so we don't flash on hydrate.
    if (prev === null || shards === prev) return;
    const now = performance.now();
    const RECENT_MS = 2500;
    if (shards > prev) {
      // Gain: always pulse. A plain ground pickup (recent local collect request) is
      // pulse-only; a gain with no pickup is a kill-steal → killer toast.
      setShardFlash({ kind: 'pulse', key: now });
      const wasPickup = now - lastShardPickupAtRef.current < RECENT_MS;
      if (!wasPickup) setShardToast({ text: 'Nozagi zvaigžņu šķembu!', key: now });
    } else {
      // Loss: drain (shrink, never --danger). A recent fatal pvpHit on me → stolen
      // (victim); otherwise the shard spilled to the ground on a PVE death.
      setShardFlash({ kind: 'drain', key: now });
      const wasPvpKill = now - lastPvpHitOnMeAtRef.current < RECENT_MS;
      setShardToast({
        text: wasPvpKill ? 'Zvaigžņu šķemba nozagta!' : 'Zvaigžņu šķemba nokrita',
        key: now,
      });
    }
  }, [myPlayer?.transcendShards]);

  // Self-clear the counter flash after one animation cycle.
  useEffect(() => {
    if (!shardFlash) return;
    const timer = window.setTimeout(() => setShardFlash(null), 520);
    return () => window.clearTimeout(timer);
  }, [shardFlash]);

  // Auto-dismiss the shard toast (~1.5s); it never blocks.
  useEffect(() => {
    if (!shardToast) return;
    const timer = window.setTimeout(() => setShardToast(null), 1500);
    return () => window.clearTimeout(timer);
  }, [shardToast]);

  useEffect(() => {
    const active = myPlayer?.activeCharacterId;
    if (!active) return;
    // Damage scaling follows the ACTIVE stars, not the unlocked ceiling.
    gameRef.current?.setActiveConstellation(effectiveConstellation(active));
    gameRef.current?.setActiveTranscend(transcendById[active] ?? 0);
  }, [myPlayer, ownedCharacterRows, activationRows, myIdentityHex]);

  useEffect(() => {
    gameRef.current?.setInputEnabled(!isGachaOpen && !isSettingsOpen && !characterPageId);
  }, [isGachaOpen, isSettingsOpen, characterPageId]);

  useEffect(() => {
    localStorage.setItem('settings.showFps', showFps ? '1' : '0');
  }, [showFps]);
  useEffect(() => {
    localStorage.setItem('settings.showPing', showPing ? '1' : '0');
  }, [showPing]);
  useEffect(() => {
    localStorage.setItem('settings.hudTheme', hudTheme);
  }, [hudTheme]);

  // ESC opens settings (closes the gacha screen first if it's open). The Radix
  // dialog handles ESC-to-close itself, so here we only need the open path.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (characterPageId) {
        event.preventDefault();
        setCharacterPageId(null);
        return;
      }
      if (isGachaOpen) {
        event.preventDefault();
        setIsGachaOpen(false);
        return;
      }
      if (!isSettingsOpen) {
        event.preventDefault();
        setIsSettingsOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isGachaOpen, isSettingsOpen, characterPageId]);

  if (!isLoggedIn) {
    return (
      <AuthScreen
        isConnected={isActive && isSubscribed}
        busy={authBusy}
        error={authError}
        onRegister={handleRegister}
        onLogin={handleLogin}
        onClearError={() => setAuthError(null)}
      />
    );
  }

  const shardFlashClass = shardFlash ? `wallet-chip--${shardFlash.kind}` : '';

  return (
    <div className="app" data-hud-theme={hudTheme}>
      <canvas ref={canvasRef} className="game-canvas" />
      {shardToast && (
        <div className="shard-toast" role="status" key={shardToast.key}>
          <span className="shard-toast__glyph">◈</span> {shardToast.text}
        </div>
      )}
      {toastInvites.length > 0 && (
        <div className="party-toast-stack">
          {toastInvites.map(invite => (
            // key = invite id: a new invite mounts a fresh element so the enter
            // animation replays per toast (clone of the shard-toast remount trick).
            <PartyToast
              key={invite.id.toString()}
              inviterName={invite.name}
              message={invite.message}
              inviteId={invite.id}
              actions={toastActionsFor(invite.flow, invite.id)}
              onDecline={id => {
                declineInvite(id);
                dismissToast(id);
              }}
              onExpire={dismissToast}
            />
          ))}
        </div>
      )}
      <Hud
        playerName={myPlayer?.name ?? ''}
        health={myPlayer?.currentHealth ?? MAX_HEALTH}
        gems={myPlayer?.gems ?? 0}
        partyCharacterIds={partyCharacterIds}
        partyHealthById={partyHealthById}
        activeCharacterId={myPlayer?.activeCharacterId ?? ''}
        hudState={hudState}
        statsSlot={
          <StatsOverlay connection={connection} showFps={showFps} showPing={showPing} />
        }
        onSelectPartySlot={slotIndex => {
          const characterId = partyCharacterIds[slotIndex];
          if (characterId) selectCharacter(characterId);
        }}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenGacha={tab => {
          setGachaTab(tab);
          setIsGachaOpen(true);
        }}
        onOpenCharacters={() => {
          const active = myPlayer?.activeCharacterId;
          const first = active && myCharacterIds.includes(active) ? active : myCharacterIds[0];
          if (first) setCharacterPageId(first);
        }}
        onJoystickMove={(x, z) => gameRef.current?.setTouchMove(x, z)}
        onTouchButton={button => gameRef.current?.pressTouchButton(button)}
        onTouchButtonRelease={button => gameRef.current?.releaseTouchButton(button)}
      />
      <PartyFrames
        myRoster={myRoster}
        leaderHex={myPartyLeaderHex}
        players={players}
        myHex={myIdentityHex}
        onSelect={hex => setSheetTargetHex(hex)}
      />
      {isGachaOpen && (
        <GachaScreen
          gems={myPlayer?.gems ?? 0}
          transcendShards={myPlayer?.transcendShards ?? 0}
          shardFlashClass={shardFlashClass}
          ownedCharacterIds={new Set(myCharacterIds)}
          activeCharacterId={myPlayer?.activeCharacterId ?? ''}
          weaponItems={myWeaponItems}
          partyCharacterIds={partyCharacterIds}
          constellationById={constellationById}
          activatedById={activatedById}
          transcendById={transcendById}
          pityByBanner={pityByBanner}
          pullResults={pullResults}
          initialTab={gachaTab}
          onPull={pullBanner}
          onSetParty={setParty}
          onSetConstellation={setConstellation}
          onOpenCharacterPage={setCharacterPageId}
          onDismissResults={() => setPullResults(null)}
          onClose={() => {
            setIsGachaOpen(false);
            setPullResults(null);
          }}
        />
      )}
      {characterPageId && (
        <CharacterScreen
          characterId={characterPageId}
          transcendShards={myPlayer?.transcendShards ?? 0}
          shardFlashClass={shardFlashClass}
          ownedCharacterIds={new Set(myCharacterIds)}
          activeCharacterId={myPlayer?.activeCharacterId ?? ''}
          constellationById={constellationById}
          transcendById={transcendById}
          activatedById={activatedById}
          onView={setCharacterPageId}
          onSetConstellation={setConstellation}
          onTranscend={transcendCharacter}
          onOpenMenu={openTab => {
            setCharacterPageId(null);
            setGachaTab(openTab);
            setIsGachaOpen(true);
          }}
          onClose={() => setCharacterPageId(null)}
        />
      )}
      <SettingsScreen
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        showFps={showFps}
        showPing={showPing}
        onToggleFps={setShowFps}
        onTogglePing={setShowPing}
        hudTheme={hudTheme}
        onHudThemeChange={setHudTheme}
        missedInvites={invitesWithNames.map(invite => ({
          id: invite.id,
          message: invite.message,
        }))}
        onAcceptInvite={acceptInvite}
        onDeclineInvite={declineInvite}
        onLogout={() => {
          setIsSettingsOpen(false);
          handleLogout();
        }}
      />
      {sheetTarget && sharesPartyWithTarget && (
        // Tapping anyone in my party (incl. myself) opens the one-page management
        // sheet — roster + per-member promote + leave/disband, no page switching.
        <PartySheet
          members={partyMemberViews}
          iAmLeader={iAmLeader}
          onPromote={promoteLeaderByHex}
          onKick={kickMemberByHex}
          onLeave={() => {
            leavePlayerParty();
            setSheetTargetHex(null);
          }}
          onDisband={() => {
            disbandPlayerParty();
            setSheetTargetHex(null);
          }}
          onRequestPromotion={() => {
            requestPromotion();
            setSheetTargetHex(null);
          }}
          onClose={() => setSheetTargetHex(null)}
        />
      )}
      {sheetTarget && !sharesPartyWithTarget && (
        <PlayerSheet
          name={sheetTarget.name}
          activeCharacterId={sheetTarget.activeCharacterId}
          currentHealth={sheetTarget.currentHealth}
          online={sheetTarget.online}
          amInParty={isInParty}
          partyFull={isPartyFull}
          onInvite={() => {
            invitePlayer(sheetTarget.identity);
            setSheetTargetHex(null);
          }}
          onRequestJoin={() => {
            requestJoin(sheetTarget.identity);
            setSheetTargetHex(null);
          }}
          onClose={() => setSheetTargetHex(null)}
        />
      )}
    </div>
  );
}
