import { CHARACTER_LIST, CHARACTERS } from '../game/data/characters';
import { ELEMENTS } from '../game/data/elements';
import { WEAPONS } from '../game/data/weapons';
import { GACHA_PULL_COST } from '../game/data/constants';
import type { GachaResult } from '../module_bindings/types';

interface GachaScreenProps {
  primogems: number;
  ownedCharacterIds: Set<string>;
  activeCharacterId: string;
  lastPullResult: GachaResult | null;
  onPull(): void;
  onSelectCharacter(characterId: string): void;
  onDismissResult(): void;
  onClose(): void;
}

function StarRow({ stars }: { stars: number }) {
  return <span className="gacha__stars">{'✦'.repeat(stars)}</span>;
}

export function GachaScreen({
  primogems,
  ownedCharacterIds,
  activeCharacterId,
  lastPullResult,
  onPull,
  onSelectCharacter,
  onDismissResult,
  onClose,
}: GachaScreenProps) {
  const pulledCharacter = lastPullResult ? CHARACTERS[lastPullResult.characterId] : null;

  return (
    <div className="gacha">
      <header className="gacha__header">
        <h2 className="gacha__title">VĒLĒŠANĀS</h2>
        <div className="gacha__wallet">
          <span className="gacha__gem">✦</span> {primogems}
        </div>
        <button className="gacha__close" onClick={onClose} aria-label="Aizvērt">
          ✕
        </button>
      </header>

      <div className="gacha__grid">
        {CHARACTER_LIST.map(character => {
          const element = ELEMENTS[character.element];
          const isOwned = ownedCharacterIds.has(character.id);
          const isActive = character.id === activeCharacterId;
          return (
            <button
              key={character.id}
              className={`gacha-card ${isOwned ? 'gacha-card--owned' : ''} ${
                isActive ? 'gacha-card--active' : ''
              }`}
              style={{ '--element-color': element.cssColor } as React.CSSProperties}
              disabled={!isOwned}
              onClick={() => onSelectCharacter(character.id)}
            >
              <span className="gacha-card__element">{element.displayName}</span>
              <span className="gacha-card__name">{character.displayName}</span>
              <span className="gacha-card__title">{character.title}</span>
              <span className="gacha-card__weapon">{WEAPONS[character.weapon].displayName}</span>
              <StarRow stars={character.stars} />
              {isActive && <span className="gacha-card__badge">AKTĪVS</span>}
              {!isOwned && <span className="gacha-card__lock">NAV IEGŪTS</span>}
            </button>
          );
        })}
      </div>

      <footer className="gacha__footer">
        <button className="gacha__pull" onClick={onPull} disabled={primogems < GACHA_PULL_COST}>
          VĒLĒTIES ×1 <span className="gacha__cost">✦ {GACHA_PULL_COST}</span>
        </button>
      </footer>

      {pulledCharacter && lastPullResult && (
        <div className="gacha-result" onClick={onDismissResult}>
          <div
            className={`gacha-result__card gacha-result__card--${pulledCharacter.stars}`}
            style={
              { '--element-color': ELEMENTS[pulledCharacter.element].cssColor } as React.CSSProperties
            }
          >
            <StarRow stars={pulledCharacter.stars} />
            <span className="gacha-result__name">{pulledCharacter.displayName}</span>
            <span className="gacha-result__title">{pulledCharacter.title}</span>
            <span className="gacha-result__note">
              {lastPullResult.wasNew ? 'JAUNS VARONIS' : 'DUBLIKĀTS · ✦ atgriezti'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
