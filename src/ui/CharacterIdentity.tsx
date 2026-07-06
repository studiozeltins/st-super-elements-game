import { ELEMENTS } from '../game/data/elements';
import type { CharacterDefinition } from '../game/data/characters';

// Reusable identity block: element · name · title · star rarity. Sizing is driven
// by the container (base = compact; add the `cident--lg` class for the big form
// used on the character modal and desktop team slots). The parent must set
// `--element-color` for the element line to pick up the character's colour.
export function CharacterIdentity({
  character,
  className = '',
}: {
  character: CharacterDefinition;
  className?: string;
}) {
  const element = ELEMENTS[character.element];
  return (
    <div className={`cident ${className}`}>
      <span className="cident__element">{element.displayName}</span>
      <span className="cident__name">{character.displayName}</span>
      <span className="cident__title">{character.title}</span>
      <span className={`cident__stars rarity-${character.stars}`}>
        {'✦'.repeat(character.stars)}
      </span>
    </div>
  );
}
