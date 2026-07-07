import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CHARACTERS, CHARACTER_LIST } from '../game/data/characters';
import { ELEMENTS } from '../game/data/elements';
import { WEAPONS } from '../game/data/weapons';
import { BANNERS, WEAPONS_BY_ID, fiveStarChanceForNextPull, HARD_PITY } from '../game/data/gacha';
import { GACHA_PULL_COST } from '../game/data/constants';
import { CharacterPreview } from './CharacterPreview';
import { PullAnimation } from './PullAnimation';
import { CharacterInfoSheet } from './CharacterInfoSheet';
import { ConstellationRing } from './ConstellationRing';
import { CharacterIdentity } from './CharacterIdentity';
import { useTeamDrag } from './useTeamDrag';
import { useDragScroll } from './useDragScroll';
import { MAIN_MENU } from './menu';

const PARTY_SIZE = 4;

export interface PityInfo {
  pullsSinceFiveStar: number;
  guaranteedFeatured: boolean;
  totalPulls: number;
}
export interface PullView {
  slot: number;
  kind: string;
  itemId: string;
  rarity: number;
  isNew: boolean;
  isFeatured: boolean;
  constellation: number;
  /** Shards minted by this specific pull (C6-overflow dupe); 0 otherwise. */
  shardMinted: number;
}
interface WeaponRow {
  weaponId: string;
  rarity: number;
}

interface GachaScreenProps {
  gems: number;
  transcendShards: number;
  /** Transient flash modifier on the shard chip (`wallet-chip--pulse|--drain`), driven by App. */
  shardFlashClass?: string;
  ownedCharacterIds: Set<string>;
  activeCharacterId: string;
  weaponItems: WeaponRow[];
  partyCharacterIds: string[];
  constellationById: Record<string, number>;
  activatedById: Record<string, number>;
  pityByBanner: Record<string, PityInfo>;
  pullResults: PullView[] | null;
  /** Which tab to open on. */
  initialTab?: GachaTab;
  onPull(bannerId: string, count: number): void;
  onSetParty(characterIds: string[]): void;
  onSetConstellation(characterId: string, level: number): void;
  /** Open the owned-only character detail/management modal. */
  onOpenCharacterPage(characterId: string): void;
  onDismissResults(): void;
  onClose(): void;
}

const DEFAULT_PITY: PityInfo = {
  pullsSinceFiveStar: 0,
  guaranteedFeatured: false,
  totalPulls: 0,
};

export type GachaTab = 'banners' | 'party' | 'characters' | 'inventory';

export function GachaScreen({
  gems,
  transcendShards,
  shardFlashClass = '',
  ownedCharacterIds,
  activeCharacterId,
  weaponItems,
  partyCharacterIds,
  constellationById,
  activatedById,
  pityByBanner,
  pullResults,
  initialTab = 'banners',
  onPull,
  onSetParty,
  onSetConstellation,
  onOpenCharacterPage,
  onDismissResults,
  onClose,
}: GachaScreenProps) {
  const [tab, setTab] = useState<GachaTab>(initialTab);
  // Right-sliding detail sheet — shared by banner previews (unowned) and team taps.
  const [infoCharacterId, setInfoCharacterId] = useState<string | null>(null);
  const [infoOwned, setInfoOwned] = useState(false);
  const openInfo = (characterId: string, owned: boolean) => {
    setInfoOwned(owned);
    setInfoCharacterId(characterId);
  };

  // Drag a roster chip → drop into a slot. The character moves there (removed from
  // any previous slot); dropping past the last member appends it.
  const assignToSlot = (characterId: string, slotIndex: number) => {
    const filtered = partyCharacterIds.filter(id => id !== characterId);
    const next = [...filtered];
    if (slotIndex < next.length) next[slotIndex] = characterId;
    else next.push(characterId);
    onSetParty(next.slice(0, PARTY_SIZE));
  };
  const removeFromSlot = (slotIndex: number) => {
    if (partyCharacterIds.length <= 1) return; // keep at least one member
    onSetParty(partyCharacterIds.filter((_, index) => index !== slotIndex));
  };
  const teamDrag = useTeamDrag({
    onAssign: assignToSlot,
    onTap: characterId => openInfo(characterId, true),
  });
  // Open the owned-character modal (main-menu 'profile') for the active character.
  const openOwnedModal = () => {
    const first = ownedCharacterIds.has(activeCharacterId)
      ? activeCharacterId
      : [...ownedCharacterIds][0];
    if (first) onOpenCharacterPage(first);
  };

  const bannerScroll = useDragScroll();
  // Team roster: wheel-to-horizontal only — click-drag is reserved for the chip's
  // own drag-to-slot gesture, so panning by drag would conflict.
  const teamScroll = useDragScroll({ drag: false });

  const [bannerId, setBannerId] = useState(BANNERS[0].id);

  const banner = BANNERS.find(entry => entry.id === bannerId) ?? BANNERS[0];
  const featured = CHARACTERS[banner.featuredCharacterId];
  const featuredElement = ELEMENTS[featured.element];
  const pity = pityByBanner[banner.id] ?? DEFAULT_PITY;

  const fiveStarChance = fiveStarChanceForNextPull(pity.pullsSinceFiveStar);
  const pullsToHardPity = Math.max(0, HARD_PITY - pity.pullsSinceFiveStar);
  const pityFraction = Math.min(1, pity.pullsSinceFiveStar / HARD_PITY);
  const pityProgress = pityFraction * 100;

  const canPullOne = gems >= GACHA_PULL_COST;
  const canPullTen = gems >= GACHA_PULL_COST * 10;

  // Freeze the wallet the instant a pull starts: the server updates gems (spent)
  // and shards (C6-dupe overflow) immediately, but we don't want the header to
  // visibly tick before the reveal animation has played. Snapshot on click, show
  // the snapshot until the reveal is dismissed.
  const [pullSnapshot, setPullSnapshot] = useState<{ gems: number; shards: number } | null>(null);
  const startPull = (id: string, count: number) => {
    setPullSnapshot({ gems, shards: transcendShards });
    onPull(id, count);
  };
  const shownGems = pullSnapshot?.gems ?? gems;
  const shownShards = pullSnapshot?.shards ?? transcendShards;

  const weaponInventory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of weaponItems) counts.set(item.weaponId, (counts.get(item.weaponId) ?? 0) + 1);
    return [...counts.entries()]
      .map(([id, count]) => ({ entry: WEAPONS_BY_ID[id], count }))
      .filter(row => row.entry)
      .sort((a, b) => b.entry.rarity - a.entry.rarity || a.entry.displayName.localeCompare(b.entry.displayName));
  }, [weaponItems]);

  return (
    <div className="gacha">
      {/* Thumb-reachable close for phones in portrait — top-right X is a stretch there. */}
      <button className="gacha__close-fab" onClick={onClose} aria-label="Aizvērt">
        ✕
      </button>
      <header className="gacha__header">
        {/* Title tracks the active section (rail label), so it never stays "VĒLĒŠANĀS". */}
        <h2 className="gacha__title">
          {MAIN_MENU.find(entry => entry.id === tab)?.label ?? 'VĒLĒŠANĀS'}
        </h2>
        {/* Banner selector — scrolls in the middle of the header (banners tab). */}
        {tab === 'banners' ? (
          <nav
            className="gacha__banner-list drag-scroll"
            aria-label="Baneru saraksts"
            ref={bannerScroll.ref as React.RefObject<HTMLElement>}
            {...bannerScroll.handlers}
          >
            {BANNERS.map(entry => {
              const entryChar = CHARACTERS[entry.featuredCharacterId];
              const entryElement = ELEMENTS[entryChar.element];
              return (
                <button
                  key={entry.id}
                  className={`banner-chip ${entry.id === bannerId ? 'banner-chip--on' : ''}`}
                  style={{ '--element-color': entryElement.cssColor } as React.CSSProperties}
                  onClick={() => setBannerId(entry.id)}
                >
                  <span className="banner-chip__name">{entry.displayName}</span>
                  <span className="banner-chip__char">{entryChar.displayName}</span>
                </button>
              );
            })}
          </nav>
        ) : tab === 'party' ? (
          <nav
            className={`team-roster ${teamDrag.isDragging ? 'team-roster--dragging' : ''}`}
            aria-label="Pieejamie varoņi · turi un velc slotā"
            ref={teamScroll.ref as React.RefObject<HTMLElement>}
            {...teamScroll.handlers}
          >
            {CHARACTER_LIST.filter(character => ownedCharacterIds.has(character.id)).map(character => {
              const element = ELEMENTS[character.element];
              const inParty = partyCharacterIds.includes(character.id);
              return (
                <button
                  key={character.id}
                  className={`team-chip rarity-${character.stars} ${inParty ? 'team-chip--in' : ''} ${
                    teamDrag.dragId === character.id ? 'team-chip--dragging' : ''
                  }`}
                  style={{ '--element-color': element.cssColor } as React.CSSProperties}
                  {...teamDrag.chipHandlers(character.id, character.displayName[0], element.cssColor)}
                >
                  <span className="team-chip__ring">
                    <ConstellationRing
                      variant="chip"
                      letter={character.displayName[0]}
                      unlocked={constellationById[character.id] ?? 0}
                      activated={activatedById[character.id] ?? constellationById[character.id] ?? 0}
                    />
                  </span>
                  <span className="team-chip__text">
                    <span className="team-chip__name">{character.displayName}</span>
                    <span className="team-chip__level">Līm. 1</span>
                  </span>
                </button>
              );
            })}
          </nav>
        ) : (
          <span className="gacha__spacer" />
        )}
        <div className="gacha__wallet">
          {/* Scarce transcend-shard balance — read-only from the subscribed player
              row, shown on every tab, left of the swapping gems/owned readout. */}
          <span
            className={`wallet-chip ${shardFlashClass}`.trim()}
            data-shard-anchor
            aria-label={`Zvaigžņu šķembas: ${shownShards}`}
          >
            <span className="gacha__gem">◈</span> {shownShards}
          </span>
          {tab === 'characters' ? (
            <>
              <span className="gacha__gem">❖</span> {[...ownedCharacterIds].length}/
              {CHARACTER_LIST.length}
            </>
          ) : (
            <>
              <span className="gacha__gem">✦</span> {shownGems}
            </>
          )}
        </div>
        <button className="gacha__close" onClick={onClose} aria-label="Aizvērt">
          ✕
        </button>
      </header>

      <div className="gacha__main">
        {/* Main menu rail (always visible). 'profile' opens the character modal. */}
        <nav className="cscreen__rail cscreen__rail--main" aria-label="Galvenā izvēlne">
          {MAIN_MENU.map(entry => {
            const isProfile = entry.id === 'profile';
            const on = !isProfile && tab === entry.id;
            return (
              <button
                key={entry.id}
                className={`rail-tab ${on ? 'rail-tab--on' : ''}`}
                onClick={() => (isProfile ? openOwnedModal() : setTab(entry.id as GachaTab))}
                aria-pressed={on}
              >
                <span className="rail-tab__glyph">{entry.glyph}</span>
                <span className="rail-tab__label">{entry.label}</span>
              </button>
            );
          })}
        </nav>

      {tab === 'banners' ? (
        <div className="gacha__body">
          <div
            className="banner"
            style={{ '--element-color': featuredElement.cssColor } as React.CSSProperties}
          >
            <div className="banner__info">
              <p className="banner__lore">{banner.lore}</p>

              <div className="pity">
                <div className="pity__row">
                  <span className="pity__label">GARANTIJAS PROGRESS</span>
                  <span className="pity__value">{pityProgress.toFixed(2)}%</span>
                </div>
                <div className="pity__bar">
                  <span className="pity__fill" style={{ transform: `scaleX(${pityFraction})` }} />
                </div>
                <div className="pity__row pity__row--muted">
                  <span>5★ izredzes {(fiveStarChance * 100).toFixed(2)}%</span>
                  <span>
                    Vēlēšanās {pity.pullsSinceFiveStar} · garantija pēc {pullsToHardPity}
                  </span>
                </div>
                {pity.guaranteedFeatured && (
                  <span className="pity__guarantee">
                    NĀKAMAIS 5★ = GARANTĒTS {featured.displayName}
                  </span>
                )}
              </div>

              <div className="pull-actions">
                <button
                  className="pull-btn"
                  disabled={!canPullOne}
                  onClick={() => startPull(banner.id, 1)}
                >
                  <span className="pull-btn__count">VĒLĒTIES ×1</span>
                  <span className="pull-btn__cost">✦ {GACHA_PULL_COST}</span>
                </button>
                <button
                  className="pull-btn pull-btn--ten"
                  disabled={!canPullTen}
                  onClick={() => startPull(banner.id, 10)}
                >
                  <span className="pull-btn__count">VĒLĒTIES ×10</span>
                  <span className="pull-btn__cost">✦ {GACHA_PULL_COST * 10}</span>
                </button>
              </div>
            </div>

            <button
              type="button"
              className="banner__stage"
              onClick={() => openInfo(featured.id, false)}
              aria-label={`${featured.displayName} — sīkāk`}
            >
              <CharacterPreview characterId={featured.id} />
              <span className="banner__stage-hint">SĪKĀK ▸</span>
              <div className="banner__caption">
                <span className="banner__tagline">{banner.subtitle}</span>
                <span className="banner__name">{featured.displayName}</span>
                <span className="banner__meta">
                  {featuredElement.displayName} · {WEAPONS[featured.weapon].displayName}
                </span>
                <span className="banner__stars">{'✦'.repeat(5)}</span>
              </div>
            </button>
          </div>
        </div>
      ) : tab === 'party' ? (
        <div className="gacha__body">
          <span className="team-hint">
            Turi un velc varoni no augšas · nomet slotā ({partyCharacterIds.length}/{PARTY_SIZE})
          </span>
          <div className="team-slots">
            {Array.from({ length: PARTY_SIZE }).map((_, slotIndex) => {
              const characterId = partyCharacterIds[slotIndex];
              const character = characterId ? CHARACTERS[characterId] : null;
              const element = character ? ELEMENTS[character.element] : null;
              const isActive = Boolean(characterId) && characterId === activeCharacterId;
              const isOver = teamDrag.overSlot === slotIndex;
              return (
                <div
                  key={slotIndex}
                  data-slot={slotIndex}
                  className={`team-slot ${character ? '' : 'team-slot--empty'} ${
                    isOver ? 'team-slot--over' : ''
                  } ${isActive ? 'team-slot--active' : ''}`}
                  style={
                    element ? ({ '--element-color': element.cssColor } as React.CSSProperties) : undefined
                  }
                >
                  {character && element ? (
                    <>
                      <div className="team-slot__header">
                        <span className="team-slot__ring">
                          <ConstellationRing
                            variant="chip"
                            letter={character.displayName[0]}
                            unlocked={constellationById[character.id] ?? 0}
                            activated={
                              activatedById[character.id] ?? constellationById[character.id] ?? 0
                            }
                          />
                        </span>
                        <CharacterIdentity character={character} className="team-slot__id" />
                      </div>
                      <button
                        className="team-slot__stage"
                        onClick={() => openInfo(character.id, true)}
                        aria-label={`${character.displayName} — sīkāk`}
                      >
                        <CharacterPreview characterId={character.id} />
                      </button>
                      <span className="team-slot__index">{slotIndex + 1}</span>
                      {isActive && <span className="team-slot__active">AKTĪVS</span>}
                      {partyCharacterIds.length > 1 && (
                        <button
                          className="team-slot__remove"
                          onClick={() => removeFromSlot(slotIndex)}
                          aria-label="Izņemt no komandas"
                        >
                          ✕
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="team-slot__index">{slotIndex + 1}</span>
                      <span className="team-slot__hint">＋</span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : tab === 'characters' ? (
        <div className="gacha__body gacha__body--inventory">
          <section className="inv">
            <h3 className="inv__heading">
              VAROŅI · KOLEKCIJA ({[...ownedCharacterIds].length}/{CHARACTER_LIST.length})
            </h3>
            <div className="inv__grid">
              {CHARACTER_LIST.map(character => {
                const element = ELEMENTS[character.element];
                const isOwned = ownedCharacterIds.has(character.id);
                const isActive = character.id === activeCharacterId;
                return (
                  <button
                    key={character.id}
                    className={`inv-card ${isOwned ? '' : 'inv-card--locked'} ${
                      isActive ? 'inv-card--active' : ''
                    }`}
                    style={{ '--element-color': element.cssColor } as React.CSSProperties}
                    onClick={() => openInfo(character.id, isOwned)}
                  >
                    <span className={`inv-card__rarity rarity-${character.stars}`}>
                      {'✦'.repeat(character.stars)}
                    </span>
                    <span className="inv-card__name">{character.displayName}</span>
                    <span className="inv-card__sub">{element.displayName}</span>
                    {isOwned && (constellationById[character.id] ?? 0) > 0 && (
                      <span className="inv-card__con">C{constellationById[character.id]}</span>
                    )}
                    {isActive && <span className="inv-card__badge">AKTĪVS</span>}
                    {!isOwned && <span className="inv-card__lock">◈</span>}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      ) : (
        <div className="gacha__body gacha__body--inventory">
          <section className="inv">
            <h3 className="inv__heading">IEROČI ({weaponItems.length})</h3>
            {weaponInventory.length === 0 ? (
              <p className="inv__empty">Vēl nav ieroču. Vēlies, lai iegūtu.</p>
            ) : (
              <div className="inv__grid">
                {weaponInventory.map(({ entry, count }) => (
                  <div key={entry.id} className="inv-card inv-card--weapon">
                    <span className={`inv-card__rarity rarity-${entry.rarity}`}>
                      {'✦'.repeat(entry.rarity)}
                    </span>
                    <span className="inv-card__name">{entry.displayName}</span>
                    <span className="inv-card__sub">{WEAPONS[entry.type].displayName}</span>
                    {count > 1 && <span className="inv-card__badge">×{count}</span>}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
      </div>

      <CharacterInfoSheet
        characterId={infoCharacterId}
        owned={infoOwned}
        level={1}
        unlocked={infoCharacterId ? constellationById[infoCharacterId] ?? 0 : 0}
        activated={
          infoCharacterId
            ? activatedById[infoCharacterId] ?? constellationById[infoCharacterId] ?? 0
            : 0
        }
        onOpenFull={characterId => {
          setInfoCharacterId(null);
          onOpenCharacterPage(characterId);
        }}
        onClose={() => setInfoCharacterId(null)}
      />

      {/* Floating drag ghost that follows the pointer while dragging a team chip. */}
      {teamDrag.ghost &&
        createPortal(
          <div
            className="team-ghost"
            style={{
              left: teamDrag.ghost.x,
              top: teamDrag.ghost.y,
              // @ts-expect-error custom property
              '--element-color': teamDrag.ghost.color,
            }}
          >
            {teamDrag.ghost.letter}
          </div>,
          document.body
        )}

      {pullResults && pullResults.length > 0 && (
        <PullAnimation
          results={pullResults}
          wallet={{ transcendShards }}
          onClose={() => {
            onDismissResults();
            setPullSnapshot(null);
          }}
        />
      )}
    </div>
  );
}
