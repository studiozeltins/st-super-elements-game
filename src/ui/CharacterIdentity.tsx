import { ELEMENTS } from '../game/data/elements';
import { ROLE_META, type CharacterDefinition } from '../game/data/characters';
import { ConstellationRing } from './ConstellationRing';
import { CharacterBadges } from './CharacterChip';

// The one reusable character-identity block: an optional constellation ring beside
// element · name · title · star rarity, always followed by the shared [C][B][L]
// progress badges (plus an optional combat-role chip). Every place that shows a
// character's identity uses this so the layout + fonts stay consistent. Sizing
// comes from the container (add `cident--lg` for the big form). The parent must
// set `--element-color`.
export function CharacterIdentity({
  character,
  className = '',
  /** Show the combat-role chip (dps/healer/support/tank). Off in compact slots. */
  showRole = false,
  /** Installed transcend levels — the B badge value ([B0] when none). */
  transcendLevel = 0,
  /** Render the constellation ring to the left of the text. */
  showRing = false,
  /** Unlocked constellation ceiling — the C badge value ([C0] when none) + ring. */
  unlocked = 0,
  /** Currently-active stars (ring only). */
  activated = 0,
  /** Click the purple "Bn" badge → dedicated Būsts tab/page. */
  onBoostClick,
  /** Click the gold "Cn" badge → dedicated constellation tab/page. */
  onConClick,
}: {
  character: CharacterDefinition;
  className?: string;
  showRole?: boolean;
  transcendLevel?: number;
  showRing?: boolean;
  unlocked?: number;
  activated?: number;
  onBoostClick?: () => void;
  onConClick?: () => void;
}) {
  const element = ELEMENTS[character.element];
  const role = ROLE_META[character.role];
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
          <CharacterBadges
            constellation={unlocked}
            transcend={transcendLevel}
            level={1}
            onConstellationClick={onConClick}
            onTranscendClick={onBoostClick}
          />
        </div>
      </div>
    </div>
  );
}
