import { useCallback, useEffect, useRef, useState } from 'react';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables, type DbConnection } from './module_bindings';
import type { Player } from './module_bindings/types';
import { createGame, type Game, type HudState } from './game/createGame';
import { CHARACTERS } from './game/data/characters';
import { MAX_HEALTH } from './game/data/constants';
import { AuthScreen } from './ui/AuthScreen';
import { deriveKey } from './auth/hash';
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
        tables.ownedCharacter,
        tables.characterActivation,
        tables.skillCast,
        tables.bannerPity,
        tables.weaponItem,
        tables.pullResult,
        tables.pvpHit,
        tables.rangedAttack,
        tables.healEvent,
        tables.gemDrop,
        tables.enemy,
        tables.goliath,
      ]);
    return () => {
      try {
        subscription.unsubscribe();
      } catch {
        // Subscription may already be gone when the connection dropped.
      }
    };
  }, [connection, isActive, identity]);

  const [players] = useTable(tables.player);
  const [ownedCharacterRows] = useTable(tables.ownedCharacter);
  const [activationRows] = useTable(tables.characterActivation);
  const [bannerPityRows] = useTable(tables.bannerPity);
  const [weaponItemRows] = useTable(tables.weaponItem);
  const [gemDropRows] = useTable(tables.gemDrop);
  const [enemyRows] = useTable(tables.enemy);
  const [goliathRows] = useTable(tables.goliath);
  const [accountLinks] = useTable(tables.accountLink);

  // Resolve this device to its account's canonical identity. All downstream
  // ownership/event filters use myIdentityHex, so they key off the account, not
  // the per-device anonymous identity.
  const myLink = accountLinks.find(link => link.identity.toHexString() === deviceIdentityHex);
  const myIdentityHex = myLink?.canonicalIdentity.toHexString() ?? null;
  myIdentityRef.current = myIdentityHex;

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
      // The table is delivered through two subscriptions, so each row can fire
      // onInsert twice; slot is unique per request, so dedupe on it.
      if (pullBufferRef.current.some(view => view.slot === row.slot)) return;
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
  // Another player hit me → purple number over my character.
  useTable(tables.pvpHit, {
    onInsert: row => {
      const targetHex = row.target.toHexString();
      if (targetHex === myIdentityRef.current) {
        gameRef.current?.spawnSelfNumber(row.amount, 'pvp');
      } else {
        // Someone else got hit — show their health bar (I'm the attacker/bystander).
        gameRef.current?.flashRemoteHealth(targetHex);
      }
    },
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
  const myCharacterIds = ownedCharacterRows
    .filter(row => row.owner.toHexString() === myIdentityHex)
    .sort((rowA, rowB) => (rowA.id < rowB.id ? -1 : 1))
    .map(row => row.characterId);
  // Prefer the player's chosen party order; fall back to the first owned characters.
  const chosenParty = (myPlayer?.partyOrder ?? []).filter(id => myCharacterIds.includes(id));
  const partyCharacterIds =
    chosenParty.length > 0 ? chosenParty.slice(0, PARTY_SIZE) : myCharacterIds.slice(0, PARTY_SIZE);
  partyRef.current = partyCharacterIds;

  const partyHealthById: Record<string, number> = {};
  for (const row of ownedCharacterRows) {
    if (row.owner.toHexString() !== myIdentityHex) continue;
    const maxHealth = CHARACTERS[row.characterId]?.maxHealth ?? MAX_HEALTH;
    partyHealthById[row.characterId] = maxHealth > 0 ? row.currentHealth / maxHealth : 1;
  }

  const constellationById: Record<string, number> = {};
  const transcendById: Record<string, number> = {};
  for (const row of ownedCharacterRows) {
    if (row.owner.toHexString() !== myIdentityHex) continue;
    constellationById[row.characterId] = row.constellation;
    transcendById[row.characterId] = row.transcendLevel;
  }

  // Manually-activated stars per character. No row = full constellation is active
  // (matches the server fallback), so untouched characters behave as before.
  const activatedById: Record<string, number> = {};
  for (const row of activationRows) {
    if (row.owner.toHexString() !== myIdentityHex) continue;
    activatedById[row.characterId] = row.activatedConstellation;
  }
  const effectiveConstellation = (characterId: string) =>
    activatedById[characterId] ?? constellationById[characterId] ?? 0;

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
        sendAttackPlayer: (target, damage) =>
          connection.reducers.attackPlayer({ targetIdentity: target.identity, damage }),
        sendTakeDamage: damage => connection.reducers.takeDamage({ damage }),
        sendHeal: amount => connection.reducers.healInSafeZone({ amount }),
        sendHealParty: comboCount => connection.reducers.healParty({ comboCount }),
        sendAttackEnemies: (centerX, centerZ, radius, damage, comboCount) =>
          connection.reducers.attackEnemies({ centerX, centerZ, radius, damage, comboCount }),
        sendAttackRay: (originX, originZ, directionX, directionZ, range, hitRadius, damage, comboCount) =>
          connection.reducers.attackRay({ originX, originZ, dirX: directionX, dirZ: directionZ, range, hitRadius, damage, comboCount }),
        sendCollectGem: dropId => connection.reducers.collectGem({ dropId }),
        sendCollectShard: dropId => connection.reducers.collectShard({ dropId }),
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
    gameRef.current?.syncGemDrops(gemDropRows);
  }, [gemDropRows]);

  useEffect(() => {
    gameRef.current?.syncEnemies(enemyRows);
  }, [enemyRows]);

  useEffect(() => {
    gameRef.current?.syncGoliaths(goliathRows);
  }, [goliathRows]);

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

  return (
    <div className="app" data-hud-theme={hudTheme}>
      <canvas ref={canvasRef} className="game-canvas" />
      <Hud
        playerName={myPlayer?.name ?? ''}
        health={myPlayer?.currentHealth ?? MAX_HEALTH}
        gems={myPlayer?.gems ?? 0}
        partyCharacterIds={partyCharacterIds}
        partyHealthById={partyHealthById}
        activeCharacterId={myPlayer?.activeCharacterId ?? ''}
        hudState={hudState}
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
      {isGachaOpen && (
        <GachaScreen
          gems={myPlayer?.gems ?? 0}
          transcendShards={myPlayer?.transcendShards ?? 0}
          ownedCharacterIds={new Set(myCharacterIds)}
          activeCharacterId={myPlayer?.activeCharacterId ?? ''}
          weaponItems={myWeaponItems}
          partyCharacterIds={partyCharacterIds}
          constellationById={constellationById}
          activatedById={activatedById}
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
      <StatsOverlay connection={connection} showFps={showFps} showPing={showPing} />
      <SettingsScreen
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        showFps={showFps}
        showPing={showPing}
        onToggleFps={setShowFps}
        onTogglePing={setShowPing}
        hudTheme={hudTheme}
        onHudThemeChange={setHudTheme}
        onLogout={() => {
          setIsSettingsOpen(false);
          handleLogout();
        }}
      />
    </div>
  );
}
