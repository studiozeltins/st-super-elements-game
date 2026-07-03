import { useCallback, useEffect, useRef, useState } from 'react';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables, type DbConnection } from './module_bindings';
import type { GachaResult, Player } from './module_bindings/types';
import { createGame, type Game, type HudState } from './game/createGame';
import { MAX_HEALTH } from './game/data/constants';
import { JoinScreen } from './ui/JoinScreen';
import { Hud } from './ui/Hud';
import { GachaScreen } from './ui/GachaScreen';

const PARTY_SIZE = 4;

const INITIAL_HUD_STATE: HudState = {
  attackCooldownFraction: 0,
  skillCooldownFraction: 0,
  inSafeZone: true,
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
  const [lastPullResult, setLastPullResult] = useState<GachaResult | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    if (!connection || !isActive) return;
    connection
      .subscriptionBuilder()
      .onApplied(() => setIsSubscribed(true))
      .subscribe([tables.player, tables.ownedCharacter, tables.skillCast, tables.gachaResult]);
  }, [connection, isActive]);

  const [players] = useTable(tables.player);
  const [ownedCharacterRows] = useTable(tables.ownedCharacter);

  useTable(tables.skillCast, {
    onInsert: cast => {
      if (cast.caster.toHexString() === myIdentityRef.current) return;
      gameRef.current?.handleRemoteSkillCast(cast);
    },
  });
  useTable(tables.gachaResult, {
    onInsert: result => {
      if (result.owner.toHexString() !== myIdentityRef.current) return;
      setLastPullResult(result);
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
        sendKillReward: () => connection.reducers.grantKillReward({}),
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
          lastPullResult={lastPullResult}
          onPull={() => connection?.reducers.pullGacha({})}
          onSelectCharacter={selectCharacter}
          onDismissResult={() => setLastPullResult(null)}
          onClose={() => {
            setIsGachaOpen(false);
            setLastPullResult(null);
          }}
        />
      )}
    </div>
  );
}
