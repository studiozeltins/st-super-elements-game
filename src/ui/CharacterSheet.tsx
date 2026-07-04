import { CHARACTERS } from '../game/data/characters';
import { ELEMENTS } from '../game/data/elements';
import { WEAPONS } from '../game/data/weapons';
import { constellationBonuses, MAX_CONSTELLATION } from '../game/data/constellations';
import { loreFor } from '../game/data/characterLore';

interface CharacterSheetProps {
  characterId: string;
  constellation: number;
  isActive: boolean;
  onSetActive(characterId: string): void;
  onClose(): void;
}

const CENTER = 100;
const RING_RADIUS = 72;

export function CharacterSheet({
  characterId,
  constellation,
  isActive,
  onSetActive,
  onClose,
}: CharacterSheetProps) {
  const character = CHARACTERS[characterId];
  if (!character) return null;
  const element = ELEMENTS[character.element];
  const bonuses = constellationBonuses(character);

  const nodes = bonuses.map((bonus, index) => {
    const angle = ((-90 + index * 60) * Math.PI) / 180;
    return {
      ...bonus,
      x: CENTER + RING_RADIUS * Math.cos(angle),
      y: CENTER + RING_RADIUS * Math.sin(angle),
      unlocked: bonus.level <= constellation,
    };
  });

  return (
    <div className="sheet" onClick={onClose}>
      <div
        className="sheet__card"
        style={{ '--element-color': element.cssColor } as React.CSSProperties}
        onClick={event => event.stopPropagation()}
      >
        <button className="sheet__close" onClick={onClose} aria-label="Aizvērt">
          ✕
        </button>

        <header className="sheet__head">
          <span className="sheet__element">{element.displayName}</span>
          <h2 className="sheet__name">{character.displayName}</h2>
          <span className="sheet__title">{character.title}</span>
          <div className="sheet__meta">
            <span className={`sheet__stars rarity-${character.stars}`}>
              {'✦'.repeat(character.stars)}
            </span>
            <span className="sheet__weapon">{WEAPONS[character.weapon].displayName}</span>
            <span className="sheet__level">
              C{constellation} / C{MAX_CONSTELLATION}
            </span>
          </div>
        </header>

        <p className="sheet__lore">{loreFor(characterId)}</p>

        <div className="sheet__body">
          <svg className="sheet__diagram" viewBox="0 0 200 200" role="img" aria-label="Konstelācijas">
            {nodes.map(node => (
              <line
                key={`spoke-${node.level}`}
                x1={CENTER}
                y1={CENTER}
                x2={node.x}
                y2={node.y}
                className={`sheet__spoke ${node.unlocked ? 'sheet__spoke--on' : ''}`}
              />
            ))}
            <circle cx={CENTER} cy={CENTER} r="19" className="sheet__core" />
            <text
              x={CENTER}
              y={CENTER}
              className="sheet__core-text"
              textAnchor="middle"
              dominantBaseline="central"
            >
              {character.displayName[0]}
            </text>
            {nodes.map(node => (
              <g key={`node-${node.level}`}>
                <circle
                  cx={node.x}
                  cy={node.y}
                  r="15"
                  className={`sheet__node ${node.unlocked ? 'sheet__node--on' : ''}`}
                />
                <text
                  x={node.x}
                  y={node.y}
                  className="sheet__node-text"
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {node.level}
                </text>
              </g>
            ))}
          </svg>

          <ol className="sheet__list">
            {bonuses.map(bonus => {
              const unlocked = bonus.level <= constellation;
              return (
                <li
                  key={bonus.level}
                  className={`sheet__con ${unlocked ? 'sheet__con--on' : 'sheet__con--off'}`}
                >
                  <span className="sheet__con-badge">C{bonus.level}</span>
                  <span className="sheet__con-text">
                    <span className="sheet__con-title">
                      {bonus.title}
                      {unlocked ? '' : ' · SLĒGTS'}
                    </span>
                    <span className="sheet__con-effect">{bonus.effect}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="sheet__actions">
          {isActive ? (
            <span className="sheet__active-tag">AKTĪVS VARONIS</span>
          ) : (
            <button
              className="sheet__set"
              onClick={() => {
                onSetActive(characterId);
                onClose();
              }}
            >
              PADARĪT AKTĪVU
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
