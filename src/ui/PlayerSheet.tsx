import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { CHARACTERS, ROLE_META } from '../game/data/characters';
import { ELEMENTS } from '../game/data/elements';
import { Button } from './Button';
import { Modal } from './Modal';

interface PlayerSheetProps {
  /** Target player's display name. */
  name: string;
  /** Target's active character id (drives character name + element color + role badge). */
  activeCharacterId: string;
  /** Whether the target is currently online. */
  online: boolean;
  /** Whether the viewer and the target already share a party (D-02: show only Leave). */
  sharesParty: boolean;
  /** Whether the viewer's own party is full (disables the invite action). */
  partyFull: boolean;
  /** Optional confirm-dialog body describing the consequence of leaving. */
  leaveConfirmBody?: string;
  onInvite(): void;
  onRequestJoin(): void;
  onLeave(): void;
  onClose(): void;
}

// Right-docked slide-out sheet for a tapped player. Focus-trap / ESC / ARIA come
// from Radix Dialog (the same primitive Modal wraps) — no hand-rolled focus. The
// symmetric actions mirror D-02: invite + ask-to-join when unrelated, and only
// "Pamest baru" (behind a confirm) when the viewer already shares the party. The
// role badge reuses the shipped ROLE_META + .sheet__role box — no new server field.
export function PlayerSheet({
  name,
  activeCharacterId,
  online,
  sharesParty,
  partyFull,
  leaveConfirmBody,
  onInvite,
  onRequestJoin,
  onLeave,
  onClose,
}: PlayerSheetProps) {
  const [confirmLeave, setConfirmLeave] = useState(false);
  const character = CHARACTERS[activeCharacterId];
  const element = character ? ELEMENTS[character.element] : null;
  const role = character ? ROLE_META[character.role] : null;

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

          <div className="player-sheet__actions">
            {sharesParty ? (
              <Button variant="danger" onClick={() => setConfirmLeave(true)}>
                Pamest baru
              </Button>
            ) : (
              <>
                <Button variant="primary" disabled={partyFull} onClick={onInvite}>
                  Uzaicināt savā barā
                </Button>
                {partyFull && <span className="player-sheet__hint">Bars ir pilns (4/4)</span>}
                <Button variant="ghost" onClick={onRequestJoin}>
                  Lūgt pievienoties baram
                </Button>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>

      <Modal
        open={confirmLeave}
        onOpenChange={setConfirmLeave}
        title="Pamest baru?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmLeave(false)}>
              Atcelt
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmLeave(false);
                onLeave();
              }}
            >
              Pamest
            </Button>
          </>
        }
      >
        {leaveConfirmBody ? <p className="player-sheet__confirm-body">{leaveConfirmBody}</p> : null}
      </Modal>
    </Dialog.Root>
  );
}
