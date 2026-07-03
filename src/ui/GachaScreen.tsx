import { useMemo, useState } from 'react';
import { CHARACTERS, CHARACTER_LIST } from '../game/data/characters';
import { ELEMENTS } from '../game/data/elements';
import { WEAPONS } from '../game/data/weapons';
import { BANNERS, WEAPONS_BY_ID, fiveStarChanceForNextPull, HARD_PITY } from '../game/data/gacha';
import { GACHA_PULL_COST } from '../game/data/constants';
import { CharacterPreview } from './CharacterPreview';
import { PullAnimation } from './PullAnimation';

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
  pityByBanner: Record<string, PityInfo>;
  pullResults: PullView[] | null;
  onPull(bannerId: string, count: number): void;
  onSelectCharacter(characterId: string): void;
  onDismissResults(): void;
  onClose(): void;
}

const DEFAULT_PITY: PityInfo = {
  pullsSinceFiveStar: 0,
  guaranteedFeatured: false,
  totalPulls: 0,
};

export function GachaScreen({
  primogems,
  ownedCharacterIds,
  activeCharacterId,
  weaponItems,
  pityByBanner,
  pullResults,
  onPull,
  onSelectCharacter,
  onDismissResults,
  onClose,
}: GachaScreenProps) {
  const [tab, setTab] = useState<'banners' | 'inventory'>('banners');
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
              <p className="banner__lore">{banner.lore}</p>

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

      {pullResults && pullResults.length > 0 && (
        <PullAnimation results={pullResults} onClose={onDismissResults} />
      )}
    </div>
  );
}
