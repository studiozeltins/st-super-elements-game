import * as Dialog from '@radix-ui/react-dialog';
import { CHARACTERS, healSpecFor } from '../game/data/characters';
import { ELEMENTS } from '../game/data/elements';
import { WEAPONS } from '../game/data/weapons';
import { constellationBonuses } from '../game/data/constellations';
import {
  MAX_TRANSCEND_LEVEL,
  TRANSCEND_DAMAGE_STEP,
  TRANSCEND_HEAL_STEP,
} from '../game/data/constants';
import { loreFor } from '../game/data/characterLore';
import { CharacterPreview } from './CharacterPreview';
import { CharacterIdentity } from './CharacterIdentity';

interface CharacterInfoSheetProps {
  /** Character to show, or null to keep the sheet closed. */
  characterId: string | null;
  /** True when the player owns this character (team page); false = banner preview. */
  owned?: boolean;
  /** Character level (static 1 for now). */
  level?: number;
  /** Unlocked constellation ceiling. */
  unlocked?: number;
  /** Currently-active constellation. */
  activated?: number;
  /** Installed transcend (Būsts) levels past C6. */
  transcendLevel?: number;
  /** Open the full character page (owned only). Omit to hide that footer action. */
  onOpenFull?(characterId: string): void;
  onClose(): void;
}

const RESIST_LABELS: Record<string, string> = {
  contact: 'Tuvcīņa',
  ranged: 'Šāviens',
  melee: 'Zobens',
  skill: 'Prasme',
};

// Read-only detail sheet, sliding in from the right (Radix Dialog: focus trap,
// ESC, ARIA). Purely informational — all management stays on the team / full
// character screen. Content is a flat stack of blocks (never nested blocks).
export function CharacterInfoSheet({
  characterId,
  owned = false,
  level = 1,
  unlocked = 0,
  activated = 0,
  transcendLevel = 0,
  onOpenFull,
  onClose,
}: CharacterInfoSheetProps) {
  const character = characterId ? CHARACTERS[characterId] : null;
  const open = Boolean(character);
  // Būsts preview (read-only): damage applies to all, healing only to healers.
  const isHealer = character ? healSpecFor(character.id).type !== 'none' : false;
  const transcendDmgPct = Math.round(transcendLevel * TRANSCEND_DAMAGE_STEP * 100);
  const transcendHealPct = Math.round(transcendLevel * TRANSCEND_HEAL_STEP * 100);

  return (
    <Dialog.Root open={open} onOpenChange={next => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="csheet__overlay" />
        <Dialog.Content
          className="csheet"
          aria-describedby={undefined}
          style={
            character
              ? ({ '--element-color': ELEMENTS[character.element].cssColor } as React.CSSProperties)
              : undefined
          }
        >
          {character && (
            <>
              <div className="csheet__stage">
                <CharacterPreview characterId={character.id} />
                <Dialog.Close asChild>
                  <button type="button" className="csheet__close" aria-label="Aizvērt">
                    ✕
                  </button>
                </Dialog.Close>
                <span className={`csheet__pill ${owned ? 'csheet__pill--own' : ''}`}>
                  {owned ? `LĪMENIS ${level}` : '◈ VĒL NEPIEDER'}
                </span>
                <Dialog.Title asChild>
                  <span className="csheet__sr-title">{character.displayName}</span>
                </Dialog.Title>
                <div className="csheet__id">
                  <CharacterIdentity
                    character={character}
                    className="cident--lg"
                    showRole
                    transcendLevel={transcendLevel}
                    showRing
                    unlocked={unlocked}
                    activated={activated}
                    onBoostClick={
                      owned && onOpenFull ? () => onOpenFull(character.id) : undefined
                    }
                  />
                </div>
              </div>

              <div className="csheet__scroll">
                {/* Block: core stats */}
                <span className="csheet__section">PAMATA STATISTIKA</span>
                <div className="csheet__stats">
                  <div className="csheet__stat">
                    <span className="csheet__stat-label">LĪMENIS</span>
                    <span className="csheet__stat-value">{level}</span>
                  </div>
                  <div className="csheet__stat">
                    <span className="csheet__stat-label">DZĪVĪBA</span>
                    <span className="csheet__stat-value">{character.maxHealth}</span>
                  </div>
                  <div className="csheet__stat">
                    <span className="csheet__stat-label">UZBRUKUMS</span>
                    <span className="csheet__stat-value">{WEAPONS[character.weapon].damage}</span>
                  </div>
                  <div className="csheet__stat">
                    <span className="csheet__stat-label">ĀTRUMS</span>
                    <span className="csheet__stat-value">{character.moveSpeed.toFixed(1)}</span>
                  </div>
                  <div className="csheet__stat">
                    <span className="csheet__stat-label">REĢENER.</span>
                    <span className="csheet__stat-value">{character.healthRegen}/s</span>
                  </div>
                  <div className="csheet__stat">
                    <span className="csheet__stat-label">ZVAIGZNES</span>
                    <span className="csheet__stat-value">
                      {owned ? `C${activated}/${unlocked}` : 'C0'}
                    </span>
                  </div>
                </div>

                {/* Block: weapon */}
                <span className="csheet__section">
                  IEROCIS · {WEAPONS[character.weapon].displayName}
                </span>
                <div className="csheet__stats">
                  <div className="csheet__stat">
                    <span className="csheet__stat-label">BOJĀJUMS</span>
                    <span className="csheet__stat-value">{WEAPONS[character.weapon].damage}</span>
                  </div>
                  <div className="csheet__stat">
                    <span className="csheet__stat-label">INTERVĀLS</span>
                    <span className="csheet__stat-value">
                      {WEAPONS[character.weapon].cooldownSeconds.toFixed(2)}s
                    </span>
                  </div>
                  <div className="csheet__stat">
                    <span className="csheet__stat-label">DISTANCE</span>
                    <span className="csheet__stat-value">
                      {WEAPONS[character.weapon].range.toFixed(1)}
                    </span>
                  </div>
                </div>

                {/* Block: skill */}
                <span className="csheet__section">PRASME · {character.skill.displayName}</span>
                <div className="csheet__stats">
                  <div className="csheet__stat">
                    <span className="csheet__stat-label">BOJĀJUMS</span>
                    <span className="csheet__stat-value">{character.skill.damage}</span>
                  </div>
                  <div className="csheet__stat">
                    <span className="csheet__stat-label">PĀRLĀDE</span>
                    <span className="csheet__stat-value">
                      {character.skill.cooldownSeconds.toFixed(0)}s
                    </span>
                  </div>
                  <div className="csheet__stat">
                    <span className="csheet__stat-label">RĀDIUSS</span>
                    <span className="csheet__stat-value">{character.skill.radius.toFixed(1)}</span>
                  </div>
                </div>

                {/* Block: resistances */}
                {character.resistances && (
                  <>
                    <span className="csheet__section">PRETESTĪBAS</span>
                    <ul className="csheet__resists">
                      {Object.entries(character.resistances).map(([channel, multiplier]) => (
                        <li key={channel} className="csheet__resist">
                          <span>{RESIST_LABELS[channel] ?? channel}</span>
                          <span className="csheet__resist-val">
                            −{Math.round((1 - multiplier) * 100)}%
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {/* Block: lore */}
                <span className="csheet__section">STĀSTS</span>
                <p className="csheet__lore">{loreFor(character.id)}</p>

                {/* Block: constellations (2-col grid — less vertical space) */}
                <span className="csheet__section">ZVAIGZNES</span>
                <ol className="csheet__cons">
                  {constellationBonuses(character).map(bonus => {
                    const on = owned && bonus.level <= activated;
                    return (
                      <li key={bonus.level} className={`csheet__con ${on ? 'csheet__con--on' : ''}`}>
                        <span className="csheet__con-badge">C{bonus.level}</span>
                        <span className="csheet__con-effect">{bonus.effect}</span>
                      </li>
                    );
                  })}
                </ol>

                {/* Block: transcendence (Būsts) — the boost past C6. */}
                <span className="csheet__section">BŪSTS</span>
                <div className="csheet__stats">
                  <div className="csheet__stat">
                    <span className="csheet__stat-label">LĪMENIS</span>
                    <span className="csheet__stat-value">
                      B{transcendLevel}/{MAX_TRANSCEND_LEVEL}
                    </span>
                  </div>
                  <div className="csheet__stat">
                    <span className="csheet__stat-label">BOJĀJUMS</span>
                    <span className="csheet__stat-value">+{transcendDmgPct}%</span>
                  </div>
                  {isHealer && (
                    <div className="csheet__stat">
                      <span className="csheet__stat-label">DZIEDIN.</span>
                      <span className="csheet__stat-value">+{transcendHealPct}%</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Sticky footer: always closes; owned characters can jump to the
                  full character page for management. */}
              <div className="csheet__footer">
                <Dialog.Close asChild>
                  <button type="button" className="csheet__btn csheet__btn--ghost">
                    AIZVĒRT
                  </button>
                </Dialog.Close>
                {owned && onOpenFull && (
                  <button
                    type="button"
                    className="csheet__btn csheet__btn--primary"
                    onClick={() => onOpenFull(character.id)}
                  >
                    VAROŅA LAPA ▸
                  </button>
                )}
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
