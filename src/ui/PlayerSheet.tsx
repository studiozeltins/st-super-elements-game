import * as Dialog from '@radix-ui/react-dialog';
import { CHARACTERS, ROLE_META } from '../game/data/characters';
import { ELEMENTS } from '../game/data/elements';
import { Button } from './Button';
import { hpFillColor } from './hp';

interface PlayerSheetProps {
  /** Target player's display name. */
  name: string;
  /** Target's active character id (drives character name + element color + role badge). */
  activeCharacterId: string;
  /** Target's live health (of the active character); drives the detail HP bar + numbers. */
  currentHealth?: number;
  /** Whether the target is currently online. */
  online: boolean;
  /** Whether the VIEWER is already in a party (disables ask-to-join — can't join two). */
  amInParty?: boolean;
  /** Whether the viewer's own party is full (disables the invite action). */
  partyFull: boolean;
  onInvite(): void;
  onRequestJoin(): void;
  onClose(): void;
}

// Right-docked slide-out sheet for a tapped player OUTSIDE my party (in-party taps
// open PartySheet instead). Two symmetric moves: pull them into my party, or ask to
// join theirs. Focus-trap / ESC / ARIA come from Radix Dialog; the role badge reuses
// the shipped ROLE_META + .sheet__role box.
export function PlayerSheet({
  name,
  activeCharacterId,
  currentHealth,
  online,
  amInParty = false,
  partyFull,
  onInvite,
  onRequestJoin,
  onClose,
}: PlayerSheetProps) {
  const character = CHARACTERS[activeCharacterId];
  const element = character ? ELEMENTS[character.element] : null;
  const role = character ? ROLE_META[character.role] : null;
  const maxHealth = character?.maxHealth ?? 0;
  const curHealth = Math.max(0, Math.round(currentHealth ?? 0));
  const hpPct = maxHealth > 0 ? Math.min(100, Math.max(0, (curHealth / maxHealth) * 100)) : 0;

  return (
    <Dialog.Root
      open
      onOpenChange={next => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="player-sheet__scrim" />
        <Dialog.Content
          className="player-sheet__panel"
          aria-describedby={undefined}
          onOpenAutoFocus={event => {
            // Auto-focus the first ENABLED action (UI-SPEC), not the ✕ close button.
            event.preventDefault();
            const panel = event.currentTarget as HTMLElement;
            panel
              .querySelector<HTMLButtonElement>('.player-sheet__actions button:not([disabled])')
              ?.focus();
          }}
        >
          <div className="player-sheet__head">
            <Dialog.Title className="player-sheet__name">{name}</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" className="icon-btn" aria-label="Aizvērt">
                ✕
              </button>
            </Dialog.Close>
          </div>

          <div className="player-sheet__meta">
            {character && element && (
              <span className="player-sheet__character" style={{ color: element.cssColor }}>
                {character.displayName}
              </span>
            )}
            {role && (
              <span
                className="sheet__role"
                style={{ color: `var(${role.token})` }}
                aria-label={`Loma: ${role.aria}`}
              >
                {role.label}
              </span>
            )}
            <span
              className={`player-sheet__online ${online ? '' : 'player-sheet__online--off'}`}
              aria-label={online ? 'Tiešsaistē' : 'Nesaistē'}
            >
              {online ? '●' : '○'}
            </span>
          </div>

          {character && (
            <div className="player-sheet__hp" aria-label={`Veselība: ${curHealth} no ${maxHealth}`}>
              <div className="player-sheet__hp-track">
                <div
                  className="player-sheet__hp-fill"
                  style={{ width: `${hpPct}%`, background: hpFillColor(hpPct) }}
                />
              </div>
              <span className="player-sheet__hp-num">
                {curHealth} / {maxHealth} HP
              </span>
            </div>
          )}

          {/* Pull them into MINE (I lead — server merges their squad if they're a
              leader, poach/forward if a member), or ask to join THEIRS (they lead).
              We only gate the impossible: no invite when full, no join when I'm partied. */}
          <div className="player-sheet__actions">
            <Button variant="primary" disabled={partyFull} onClick={onInvite}>
              Aicināt savā barā
            </Button>
            {partyFull && <span className="player-sheet__hint">Bars ir pilns (4/4)</span>}
            <Button variant="ghost" disabled={amInParty} onClick={onRequestJoin}>
              Lūgt pievienoties viņa baram
            </Button>
            {amInParty && <span className="player-sheet__hint">Tu jau esi barā</span>}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
