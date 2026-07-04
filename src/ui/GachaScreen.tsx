import { useMemo, useState } from 'react';
import { CHARACTERS, CHARACTER_LIST } from '../game/data/characters';
import { ELEMENTS } from '../game/data/elements';
import { WEAPONS } from '../game/data/weapons';
import { BANNERS, WEAPONS_BY_ID, fiveStarChanceForNextPull, HARD_PITY } from '../game/data/gacha';
import { constellationBonuses } from '../game/data/constellations';
import type { CharacterDefinition } from '../game/data/characters';
import { GACHA_PULL_COST } from '../game/data/constants';
import { CharacterPreview } from './CharacterPreview';
import { PullAnimation } from './PullAnimation';
import { CharacterSheet } from './CharacterSheet';

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
}
interface WeaponRow {
  weaponId: string;
  rarity: number;
}

interface GachaScreenProps {
  primogems: number;
  ownedCharacterIds: Set<string>;
  activeCharacterId: string;
  weaponItems: WeaponRow[];
  partyCharacterIds: string[];
  constellationById: Record<string, number>;
  pityByBanner: Record<string, PityInfo>;
  pullResults: PullView[] | null;
  onPull(bannerId: string, count: number): void;
  onSetParty(characterIds: string[]): void;
  onSelectCharacter(characterId: string): void;
  onDismissResults(): void;
  onClose(): void;
}

const DEFAULT_PITY: PityInfo = {
  pullsSinceFiveStar: 0,
  guaranteedFeatured: false,
  totalPulls: 0,
};

/** Inline C0–C6 dots + the currently-active cumulative bonus, shown on cards. */
function ConstellationInline({
  character,
  constellation,
}: {
  character: CharacterDefinition;
  constellation: number;
}) {
  const bonusText =
    constellation > 0
      ? constellationBonuses(character)[constellation - 1].effect
      : 'C0 · bāzes spēks';
  return (
    <span className="con-inline">
      <span className="con-dots" aria-label={`C${constellation}`}>
        {[1, 2, 3, 4, 5, 6].map(level => (
          <i key={level} className={`con-dot ${level <= constellation ? 'con-dot--on' : ''}`} />
        ))}
      </span>
      <span className="con-inline__bonus">{bonusText}</span>
    </span>
  );
}

export function GachaScreen({
  primogems,
  ownedCharacterIds,
  activeCharacterId,
  weaponItems,
  partyCharacterIds,
  constellationById,
  pityByBanner,
  pullResults,
  onPull,
  onSetParty,
  onSelectCharacter,
  onDismissResults,
  onClose,
}: GachaScreenProps) {
  const [tab, setTab] = useState<'banners' | 'party' | 'inventory'>('banners');
  // Drag-and-drop party editing. Source is either a roster character or a slot.
  const [dragItem, setDragItem] = useState<
    { from: 'roster'; id: string } | { from: 'slot'; index: number } | null
  >(null);
  const [overSlot, setOverSlot] = useState<number | null>(null);
  const [sheetCharacterId, setSheetCharacterId] = useState<string | null>(null);

  const dropOnSlot = (slotIndex: number) => {
    setOverSlot(null);
    if (!dragItem) return;
    const party = [...partyCharacterIds];
    if (dragItem.from === 'roster') {
      if (slotIndex < party.length) party[slotIndex] = dragItem.id;
      else if (party.length < 4) party.push(dragItem.id);
    } else if (slotIndex < party.length) {
      [party[dragItem.index], party[slotIndex]] = [party[slotIndex], party[dragItem.index]];
    } else {
      const [moved] = party.splice(dragItem.index, 1);
      party.push(moved);
    }
    setDragItem(null);
    onSetParty(party);
  };

  const dropOnRoster = () => {
    if (dragItem?.from === 'slot' && partyCharacterIds.length > 1) {
      onSetParty(partyCharacterIds.filter((_, i) => i !== dragItem.index));
    }
    setDragItem(null);
  };
  const [bannerId, setBannerId] = useState(BANNERS[0].id);

  const banner = BANNERS.find(entry => entry.id === bannerId) ?? BANNERS[0];
  const featured = CHARACTERS[banner.featuredCharacterId];
  const featuredElement = ELEMENTS[featured.element];
  const pity = pityByBanner[banner.id] ?? DEFAULT_PITY;

  const fiveStarChance = fiveStarChanceForNextPull(pity.pullsSinceFiveStar);
  const pullsToHardPity = Math.max(0, HARD_PITY - pity.pullsSinceFiveStar);
  const pityFraction = Math.min(1, pity.pullsSinceFiveStar / HARD_PITY);
  const pityProgress = pityFraction * 100;

  const canPullOne = primogems >= GACHA_PULL_COST;
  const canPullTen = primogems >= GACHA_PULL_COST * 10;

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
      <header className="gacha__header">
        <h2 className="gacha__title">VĒLĒŠANĀS</h2>
        <nav className="gacha__tabs">
          <button
            className={`gacha__tab ${tab === 'banners' ? 'gacha__tab--on' : ''}`}
            onClick={() => setTab('banners')}
          >
            BANERI
          </button>
          <button
            className={`gacha__tab ${tab === 'party' ? 'gacha__tab--on' : ''}`}
            onClick={() => setTab('party')}
          >
            KOMANDA
          </button>
          <button
            className={`gacha__tab ${tab === 'inventory' ? 'gacha__tab--on' : ''}`}
            onClick={() => setTab('inventory')}
          >
            INVENTĀRS
          </button>
        </nav>
        <div className="gacha__wallet">
          <span className="gacha__gem">✦</span> {primogems}
        </div>
        <button className="gacha__close" onClick={onClose} aria-label="Aizvērt">
          ✕
        </button>
      </header>

      {tab === 'banners' ? (
        <div className="gacha__body">
          <div className="banner-switch">
            {BANNERS.map(entry => {
              const entryChar = CHARACTERS[entry.featuredCharacterId];
              const entryElement = ELEMENTS[entryChar.element];
              return (
                <button
                  key={entry.id}
                  className={`banner-switch__item ${entry.id === bannerId ? 'banner-switch__item--on' : ''}`}
                  style={{ '--element-color': entryElement.cssColor } as React.CSSProperties}
                  onClick={() => setBannerId(entry.id)}
                >
                  <span className="banner-switch__name">{entry.displayName}</span>
                  <span className="banner-switch__char">{entryChar.displayName}</span>
                </button>
              );
            })}
          </div>

          <div
            className="banner"
            style={{ '--element-color': featuredElement.cssColor } as React.CSSProperties}
          >
            <div className="banner__stage">
              <CharacterPreview characterId={featured.id} />
              <p className="banner__lore">{banner.lore}</p>
              <div className="banner__caption">
                <span className="banner__tagline">{banner.subtitle}</span>
                <span className="banner__name">{featured.displayName}</span>
                <span className="banner__meta">
                  {featuredElement.displayName} · {WEAPONS[featured.weapon].displayName}
                </span>
                <span className="banner__stars">{'✦'.repeat(5)}</span>
              </div>
            </div>

            <div className="banner__panel">
              <div className="banner__controls">
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
                    onClick={() => onPull(banner.id, 1)}
                  >
                    <span className="pull-btn__count">VĒLĒTIES ×1</span>
                    <span className="pull-btn__cost">✦ {GACHA_PULL_COST}</span>
                  </button>
                  <button
                    className="pull-btn pull-btn--ten"
                    disabled={!canPullTen}
                    onClick={() => onPull(banner.id, 10)}
                  >
                    <span className="pull-btn__count">VĒLĒTIES ×10</span>
                    <span className="pull-btn__cost">✦ {GACHA_PULL_COST * 10}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : tab === 'party' ? (
        <div className="gacha__body gacha__body--inventory">
          <section className="inv">
            <h3 className="inv__heading">KOMANDA · VELC UN NOMET ({partyCharacterIds.length}/4)</h3>
            <div className="party-slots">
              {Array.from({ length: 4 }).map((_, slotIndex) => {
                const characterId = partyCharacterIds[slotIndex];
                const character = characterId ? CHARACTERS[characterId] : null;
                const element = character ? ELEMENTS[character.element] : null;
                const isActive = Boolean(characterId) && characterId === activeCharacterId;
                return (
                  <div
                    key={slotIndex}
                    className={`party-drop ${character ? '' : 'party-drop--empty'} ${
                      overSlot === slotIndex ? 'party-drop--over' : ''
                    } ${isActive ? 'party-drop--active' : ''}`}
                    style={
                      element
                        ? ({ '--element-color': element.cssColor } as React.CSSProperties)
                        : undefined
                    }
                    onDragOver={event => {
                      event.preventDefault();
                      setOverSlot(slotIndex);
                    }}
                    onDragLeave={() => setOverSlot(prev => (prev === slotIndex ? null : prev))}
                    onDrop={() => dropOnSlot(slotIndex)}
                    onClick={() => characterId && setSheetCharacterId(characterId)}
                  >
                    <span className="party-drop__index">{slotIndex + 1}</span>
                    {character && element ? (
                      <div
                        className="party-drop__face"
                        draggable
                        onDragStart={event => {
                          event.dataTransfer.setData('text/plain', characterId as string);
                          setDragItem({ from: 'slot', index: slotIndex });
                        }}
                        onDragEnd={() => {
                          setDragItem(null);
                          setOverSlot(null);
                        }}
                      >
                        <span className="inv-card__name">{character.displayName}</span>
                        <span className="inv-card__sub">{element.displayName}</span>
                        <ConstellationInline
                          character={character}
                          constellation={constellationById[characterId as string] ?? 0}
                        />
                        {isActive && <span className="party-drop__active">AKTĪVS</span>}
                      </div>
                    ) : (
                      <span className="party-drop__hint">Tukšs</span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="inv" onDragOver={event => event.preventDefault()} onDrop={dropOnRoster}>
            <h3 className="inv__heading">PIEEJAMIE VAROŅI · velc slotā (nomet šeit, lai izņemtu)</h3>
            <div className="inv__grid">
              {CHARACTER_LIST.filter(
                character =>
                  ownedCharacterIds.has(character.id) && !partyCharacterIds.includes(character.id)
              ).map(character => {
                const element = ELEMENTS[character.element];
                return (
                  <div
                    key={character.id}
                    className="inv-card inv-card--draggable"
                    style={{ '--element-color': element.cssColor } as React.CSSProperties}
                    draggable
                    onClick={() => setSheetCharacterId(character.id)}
                    onDragStart={event => {
                      event.dataTransfer.setData('text/plain', character.id);
                      setDragItem({ from: 'roster', id: character.id });
                    }}
                    onDragEnd={() => {
                      setDragItem(null);
                      setOverSlot(null);
                    }}
                  >
                    <span className={`inv-card__rarity rarity-${character.stars}`}>
                      {'✦'.repeat(character.stars)}
                    </span>
                    <span className="inv-card__name">{character.displayName}</span>
                    <span className="inv-card__sub">{element.displayName}</span>
                    <ConstellationInline
                      character={character}
                      constellation={constellationById[character.id] ?? 0}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      ) : (
        <div className="gacha__body gacha__body--inventory">
          <section className="inv">
            <h3 className="inv__heading">VAROŅI</h3>
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
                    disabled={!isOwned}
                    onClick={() => onSelectCharacter(character.id)}
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

      {sheetCharacterId && (
        <CharacterSheet
          characterId={sheetCharacterId}
          constellation={constellationById[sheetCharacterId] ?? 0}
          isActive={sheetCharacterId === activeCharacterId}
          onSetActive={onSelectCharacter}
          onClose={() => setSheetCharacterId(null)}
        />
      )}

      {pullResults && pullResults.length > 0 && (
        <PullAnimation results={pullResults} onClose={onDismissResults} />
      )}
    </div>
  );
}
