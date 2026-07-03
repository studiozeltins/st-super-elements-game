import { useCallback, useEffect, useRef, useState } from 'react';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables, type DbConnection } from './module_bindings';
import type { Player } from './module_bindings/types';
import { createGame, type Game, type HudState } from './game/createGame';
import { CHARACTERS } from './game/data/characters';
import { MAX_HEALTH } from './game/data/constants';
import { JoinScreen } from './ui/JoinScreen';
import { Hud } from './ui/Hud';
import { GachaScreen, type PityInfo, type PullView } from './ui/GachaScreen';

const PARTY_SIZE = 4;

const INITIAL_HUD_STATE: HudState = {
  attackCooldownFraction: 0,
  skillCooldownFraction: 0,
  inSafeZone: true,
  combo: 0,
};

export default function App() {
  const { isActive, identity, getConnection } = useSpacetimeDB();
  const connection = getConnection() as DbConnection | null;
  const myIdentityHex = identity?.toHexString() ?? null;
  const myIdentityRef = useRef<string | null>(null);
  myIdentityRef.current = myIdentityHex;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const partyRef = useRef<string[]>([]);
  const [hudState, setHudState] = useState<HudState>(INITIAL_HUD_STATE);
  const [isGachaOpen, setIsGachaOpen] = useState(false);
  const [pullResults, setPullResults] = useState<PullView[] | null>(null);
  const pullBufferRef = useRef<PullView[]>([]);
  const flushTimerRef = useRef<number | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    if (!connection || !isActive) {
      setIsSubscribed(false);
      return;
    }
    const subscription = connection
      .subscriptionBuilder()
      .onApplied(() => setIsSubscribed(true))
      .subscribe([
        tables.player,
        tables.ownedCharacter,
        tables.skillCast,
        tables.bannerPity,
        tables.weaponItem,
        tables.pullResult,
      ]);
    return () => {
      try {
        subscription.unsubscribe();
      } catch {
        // Subscription may already be gone when the connection dropped.
      }
    };
  }, [connection, isActive]);

  const [players] = useTable(tables.player);
  const [ownedCharacterRows] = useTable(tables.ownedCharacter);
  const [bannerPityRows] = useTable(tables.bannerPity);
  const [weaponItemRows] = useTable(tables.weaponItem);

  useTable(tables.skillCast, {
    onInsert: cast => {
      if (cast.caster.toHexString() === myIdentityRef.current) return;
      gameRef.current?.handleRemoteSkillCast(cast);
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
      });
      if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = window.setTimeout(() => {
        setPullResults([...pullBufferRef.current]);
      }, 120);
    },
  });

  const myPlayer: Player | undefined = players.find(
    row => row.identity.toHexString() === myIdentityHex
  );
  const myCharacterIds = ownedCharacterRows
    .filter(row => row.owner.toHexString() === myIdentityHex)
    .sort((rowA, rowB) => (rowA.id < rowB.id ? -1 : 1))
    .map(row => row.characterId);
  const partyCharacterIds = myCharacterIds.slice(0, PARTY_SIZE);
  partyRef.current = partyCharacterIds;

  const partyHealthById: Record<string, number> = {};
  for (const row of ownedCharacterRows) {
    if (row.owner.toHexString() !== myIdentityHex) continue;
    const maxHealth = CHARACTERS[row.characterId]?.maxHealth ?? MAX_HEALTH;
    partyHealthById[row.characterId] = maxHealth > 0 ? row.currentHealth / maxHealth : 1;
  }

  const pityByBanner: Record<string, PityInfo> = {};
  for (const row of bannerPityRows) {
    if (row.owner.toHexString() !== myIdentityHex) continue;
    pityByBanner[row.bannerId] = {
      pullsSinceFiveStar: row.pullsSinceFiveStar,
      guaranteedFeatured: row.guaranteedFeatured,
      totalPulls: row.totalPulls,
    };
  }

  const myWeaponItems = weaponItemRows
    .filter(row => row.owner.toHexString() === myIdentityHex)
    .map(row => ({ weaponId: row.weaponId, rarity: row.rarity }));

  const pullBanner = useCallback(
    (bannerId: string, count: number) => {
      pullBufferRef.current = [];
      setPullResults(null);
      connection?.reducers.pullBanner({ bannerId, count });
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

  const hasJoined = Boolean(myPlayer);

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
        sendAttackPlayer: (target, damage) =>
          connection.reducers.attackPlayer({ targetIdentity: target.identity, damage }),
        sendTakeDamage: damage => connection.reducers.takeDamage({ damage }),
        sendHeal: amount => connection.reducers.healInSafeZone({ amount }),
        sendHealParty: comboCount => connection.reducers.healParty({ comboCount }),
        sendKillReward: rewardTier => connection.reducers.grantKillReward({ rewardTier }),
        sendFallToDeath: () => connection.reducers.fallToDeath({}),
      },
      setHudState
    );
    game.onPartySlotRequested = slotIndex => {
      const characterId = partyRef.current[slotIndex];
      if (characterId) selectCharacter(characterId);
    };
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
    gameRef.current?.setInputEnabled(!isGachaOpen);
  }, [isGachaOpen]);

  if (!hasJoined) {
    return (
      <JoinScreen
        isConnected={isActive && isSubscribed}
        onJoin={name => connection?.reducers.joinGame({ name })}
      />
    );
  }

  return (
    <div className="app">
      <canvas ref={canvasRef} className="game-canvas" />
      <Hud
        playerName={myPlayer?.name ?? ''}
        health={myPlayer?.currentHealth ?? MAX_HEALTH}
        primogems={myPlayer?.primogems ?? 0}
        partyCharacterIds={partyCharacterIds}
        partyHealthById={partyHealthById}
        activeCharacterId={myPlayer?.activeCharacterId ?? ''}
        hudState={hudState}
        onSelectPartySlot={slotIndex => {
          const characterId = partyCharacterIds[slotIndex];
          if (characterId) selectCharacter(characterId);
        }}
        onOpenGacha={() => setIsGachaOpen(true)}
        onJoystickMove={(x, z) => gameRef.current?.setTouchMove(x, z)}
        onTouchButton={button => gameRef.current?.pressTouchButton(button)}
        onTouchButtonRelease={button => gameRef.current?.releaseTouchButton(button)}
      />
      {isGachaOpen && (
        <GachaScreen
          primogems={myPlayer?.primogems ?? 0}
          ownedCharacterIds={new Set(myCharacterIds)}
          activeCharacterId={myPlayer?.activeCharacterId ?? ''}
          weaponItems={myWeaponItems}
          pityByBanner={pityByBanner}
          pullResults={pullResults}
          onPull={pullBanner}
          onSelectCharacter={selectCharacter}
          onDismissResults={() => setPullResults(null)}
          onClose={() => {
            setIsGachaOpen(false);
            setPullResults(null);
          }}
        />
      )}
    </div>
  );
}
