import { CHARACTERS } from '../game/data/characters';
import { ELEMENTS } from '../game/data/elements';
import { ConstellationRing } from './ConstellationRing';

/**
 * [C5][B3][L1] mini-cards — the compact character progress readout used on
 * every character card in the game (roster chips, team select, collection).
 * C = constellation (gold), B = transcend boost (purple), L = level (cyan).
 */
export function CharacterBadges({
  constellation = 0,
  transcend = 0,
  level = 1,
}: {
  constellation?: number;
  transcend?: number;
  level?: number;
}) {
  return (
    <span className="cbadges">
      {constellation > 0 && <span className="cbadge cbadge--c">C{constellation}</span>}
      {transcend > 0 && <span className="cbadge cbadge--b">B{transcend}</span>}
      <span className="cbadge cbadge--l">L{level}</span>
    </span>
  );
}

/**
 * The ONE horizontal character chip: constellation ring + name + [C][B][L]
 * badges, rarity-colored left border (5★ gold, 4★ blue), element color on the
 * ring letter disc. Used by the character-screen roster AND the team-select
 * roster — selection/party/drag states come in as modifiers.
 */
export function CharacterChip({
  characterId,
  constellation = 0,
  activated,
  transcend = 0,
  selected = false,
  inParty = false,
  dragging = false,
  activeDot = false,
  onClick,
  handlers,
}: {
  characterId: string;
  constellation?: number;
  /** Currently-active stars; defaults to the full unlocked ceiling. */
  activated?: number;
  transcend?: number;
  /** Highlight as the currently-viewed character (character screen). */
  selected?: boolean;
  /** Inset ring for party members (team select). */
  inParty?: boolean;
  dragging?: boolean;
  /** ● marker for the in-world active character. */
  activeDot?: boolean;
  onClick?: () => void;
  /** Extra pointer handlers (team-drag) spread onto the button. */
  handlers?: Record<string, (event: React.PointerEvent) => void>;
}) {
  const character = CHARACTERS[characterId];
  if (!character) return null;
  const element = ELEMENTS[character.element];

  return (
    <button
      className={`cchip rarity-${character.stars} ${selected ? 'cchip--on' : ''} ${
        inParty ? 'cchip--in' : ''
      } ${dragging ? 'cchip--dragging' : ''}`}
      style={{ '--element-color': element.cssColor } as React.CSSProperties}
      onClick={onClick}
      {...handlers}
    >
      <span className="cchip__ring">
        <ConstellationRing
          variant="chip"
          letter={character.displayName[0]}
          unlocked={constellation}
          activated={activated ?? constellation}
        />
      </span>
      <span className="cchip__text">
        <span className="cchip__name">{character.displayName}</span>
        <CharacterBadges constellation={constellation} transcend={transcend} level={1} />
      </span>
      {activeDot && <span className="cchip__active">●</span>}
    </button>
  );
}
