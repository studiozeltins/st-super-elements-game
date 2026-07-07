import { ELEMENTS } from '../game/data/elements';
import { ROLE_META, type CharacterDefinition } from '../game/data/characters';
import { ConstellationRing } from './ConstellationRing';

// The one reusable character-identity block: an optional constellation ring beside
// element · name · title · star rarity, with an optional tag row (combat role +
// transcend/Būsts level). Every place that shows a character's identity uses this
// so the layout + fonts stay consistent. Sizing comes from the container (add
// `cident--lg` for the big form). The parent must set `--element-color`.
export function CharacterIdentity({
  character,
  className = '',
  /** Show the combat-role chip (dps/healer/support/tank). Off in compact slots. */
  showRole = false,
  /** Installed transcend levels; shows a "C6 · Bn" chip when > 0. */
  transcendLevel = 0,
  /** Render the constellation ring to the left of the text. */
  showRing = false,
  /** Ring data (unlocked ceiling + currently-active stars). */
  unlocked = 0,
  activated = 0,
  /** If given, the Būsts chip becomes a button opening the dedicated tab/page. */
  onBoostClick,
}: {
  character: CharacterDefinition;
  className?: string;
  showRole?: boolean;
  transcendLevel?: number;
  showRing?: boolean;
  unlocked?: number;
  activated?: number;
  onBoostClick?: () => void;
}) {
  const element = ELEMENTS[character.element];
  const role = ROLE_META[character.role];
  const hasTags = (showRole && role) || transcendLevel > 0;
  return (
    <div className={`cident ${className}`}>
      {showRing && (
        <span className="cident__ring">
          <ConstellationRing
            variant="chip"
            letter={character.displayName[0]}
            unlocked={unlocked}
            activated={activated}
          />
        </span>
      )}
      <div className="cident__text">
        <span className="cident__element">{element.displayName}</span>
        <span className="cident__name">{character.displayName}</span>
        <span className="cident__title">{character.title}</span>
        <span className={`cident__stars rarity-${character.stars}`}>
          {'✦'.repeat(character.stars)}
        </span>
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
            {transcendLevel > 0 &&
              (onBoostClick ? (
                <button
                  type="button"
                  className="cident__boost cident__boost--btn"
                  onClick={onBoostClick}
                  aria-label={`Būsts B${transcendLevel} — atvērt`}
                >
                  <span className="cident__boost-c6">C6</span> ·{' '}
                  <span className="cident__boost-b">B{transcendLevel}</span>
                </button>
              ) : (
                <span className="cident__boost" aria-label={`Būsts B${transcendLevel}`}>
                  <span className="cident__boost-c6">C6</span> ·{' '}
                  <span className="cident__boost-b">B{transcendLevel}</span>
                </span>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
