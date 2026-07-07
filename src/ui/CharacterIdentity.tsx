import { ELEMENTS } from '../game/data/elements';
import { ROLE_META, type CharacterDefinition } from '../game/data/characters';

// The one reusable character-identity block: element · name · title · star rarity,
// with an optional tag row (combat role + transcend/Būsts level). Every place that
// shows a character's identity uses this, so the layout + fonts stay consistent.
// Sizing comes from the container (add `cident--lg` for the big form). The parent
// must set `--element-color` for the element line to pick up the character colour.
export function CharacterIdentity({
  character,
  className = '',
  /** Show the combat-role chip (dps/healer/support/tank). Off in compact slots. */
  showRole = false,
  /** Installed transcend levels; shows a "C6 · Bn" chip when > 0. */
  transcendLevel = 0,
}: {
  character: CharacterDefinition;
  className?: string;
  showRole?: boolean;
  transcendLevel?: number;
}) {
  const element = ELEMENTS[character.element];
  const role = ROLE_META[character.role];
  const hasTags = (showRole && role) || transcendLevel > 0;
  return (
    <div className={`cident ${className}`}>
      <span className="cident__element">{element.displayName}</span>
      <span className="cident__name">{character.displayName}</span>
      <span className="cident__title">{character.title}</span>
      <span className={`cident__stars rarity-${character.stars}`}>{'✦'.repeat(character.stars)}</span>
      {hasTags && (
        <div className="cident__tags">
          {showRole && role && (
            <span
              className="cident__role"
              style={{ color: `var(${role.token})` }}
              aria-label={`Loma: ${role.aria}`}
            >
              {role.label}
            </span>
          )}
          {transcendLevel > 0 && (
            <span className="cident__boost" aria-label={`Būsts B${transcendLevel}`}>
              C6 · B{transcendLevel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
