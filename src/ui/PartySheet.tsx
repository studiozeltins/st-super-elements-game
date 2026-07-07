import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { CHARACTERS } from '../game/data/characters';
import { ELEMENTS } from '../game/data/elements';
import { RowConfirm, InlineAction } from './PartyConfirm';
import { hpFillColor } from './hp';

export interface PartyMemberView {
  /** Canonical identity hex — the promote target key. */
  hex: string;
  name: string;
  activeCharacterId: string;
  online: boolean;
  currentHealth?: number;
  isLeader: boolean;
  isSelf: boolean;
}

interface PartySheetProps {
  /** All members of the viewer's party, leader first (rendered on one page). */
  members: readonly PartyMemberView[];
  /** Whether the viewer is the party leader (gates promote + disband). */
  iAmLeader: boolean;
  onPromote(hex: string): void;
  /** Leader only: remove a member from the party. */
  onKick(hex: string): void;
  onLeave(): void;
  onDisband(): void;
  /** Non-leader only: ask the current leader to hand over the crown. */
  onRequestPromotion(): void;
  onClose(): void;
}

// A single pending inline confirmation. Only one action can be mid-confirm at a
// time — opening another replaces it. `hex` scopes a promote to one member row.
type Pending =
  | { kind: 'promote'; hex: string }
  | { kind: 'kick'; hex: string }
  | { kind: 'leave' }
  | { kind: 'disband' }
  | { kind: 'ask-promote' }
  | null;

// Frost party-management sheet: every member on one page (no per-player switching).
// Each teammate row carries a leader-only promote button; the footer carries leave
// (auto-promotes the oldest member) and leader-only disband. All mutating actions
// use a two-tap inline ✓/✕ confirm rather than a separate modal.
export function PartySheet({
  members,
  iAmLeader,
  onPromote,
  onKick,
  onLeave,
  onDisband,
  onRequestPromotion,
  onClose,
}: PartySheetProps) {
  const [pending, setPending] = useState<Pending>(null);

  const isPromoting = (hex: string) => pending?.kind === 'promote' && pending.hex === hex;
  const isKicking = (hex: string) => pending?.kind === 'kick' && pending.hex === hex;

  return (
    <Dialog.Root
      open
      onOpenChange={next => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="player-sheet__scrim" />
        <Dialog.Content className="player-sheet__panel" aria-describedby={undefined}>
          <div className="player-sheet__head">
            <Dialog.Title className="player-sheet__name">Bars {members.length}/4</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" className="icon-btn" aria-label="Aizvērt">
                ✕
              </button>
            </Dialog.Close>
          </div>

          <div className="party-sheet__list">
            {members.map(member => {
              const character = CHARACTERS[member.activeCharacterId];
              const element = character ? ELEMENTS[character.element] : null;
              const elementColor = element?.cssColor ?? 'var(--muted)';
              const initial = (character?.displayName ?? member.name).charAt(0).toUpperCase();
              const maxHealth = character?.maxHealth ?? 0;
              const curHealth = Math.max(0, Math.round(member.currentHealth ?? 0));
              const pct =
                maxHealth > 0 ? Math.min(100, Math.max(0, (curHealth / maxHealth) * 100)) : 0;
              const canPromote = iAmLeader && !member.isLeader;

              return (
                <div
                  key={member.hex}
                  className={`party-sheet__row ${member.online ? '' : 'party-sheet__row--offline'}`}
                >
                  <span
                    className="party-frames__icon"
                    style={{ color: elementColor }}
                    aria-hidden="true"
                  >
                    {initial}
                  </span>
                  <span className="party-sheet__body">
                    <span className="party-sheet__name-row">
                      {member.isLeader && (
                        <span className="party-frames__crown" aria-hidden="true">
                          ♛
                        </span>
                      )}
                      <span className="party-sheet__label">
                        {member.name}
                        {member.isSelf && ' (tu)'}
                      </span>
                      <span className="party-sheet__hp-num">
                        {curHealth}/{maxHealth}
                      </span>
                      <span
                        className={`party-sheet__dot ${member.online ? '' : 'party-sheet__dot--off'}`}
                        aria-label={member.online ? 'Tiešsaistē' : 'Nesaistē'}
                      >
                        ●
                      </span>
                    </span>
                    <span className="party-frames__hp-track">
                      <span
                        className="party-frames__hp-fill"
                        style={{ width: `${pct}%`, background: hpFillColor(pct) }}
                      />
                    </span>
                  </span>

                  {canPromote && (
                    <span className="party-sheet__row-actions">
                      {isPromoting(member.hex) ? (
                        <RowConfirm
                          label={`Iecelt ${member.name} par vadoni?`}
                          onConfirm={() => {
                            onPromote(member.hex);
                            setPending(null);
                          }}
                          onCancel={() => setPending(null)}
                        />
                      ) : isKicking(member.hex) ? (
                        <RowConfirm
                          label={`Izmest ${member.name} no bara?`}
                          onConfirm={() => {
                            onKick(member.hex);
                            setPending(null);
                          }}
                          onCancel={() => setPending(null)}
                        />
                      ) : (
                        <>
                          <button
                            type="button"
                            className="party-sheet__promote"
                            aria-label={`Iecelt ${member.name} par vadoni`}
                            title="Iecelt par vadoni"
                            onClick={() => setPending({ kind: 'promote', hex: member.hex })}
                          >
                            ♛
                          </button>
                          <button
                            type="button"
                            className="party-sheet__kick"
                            aria-label={`Izmest ${member.name} no bara`}
                            title="Izmest no bara"
                            onClick={() => setPending({ kind: 'kick', hex: member.hex })}
                          >
                            ⊘
                          </button>
                        </>
                      )}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="party-sheet__actions">
            <InlineAction
              label="Pamest baru"
              confirmLabel="Pamest? Vecākais biedrs kļūs par vadoni."
              active={pending?.kind === 'leave'}
              variant="danger"
              onArm={() => setPending({ kind: 'leave' })}
              onCancel={() => setPending(null)}
              onConfirm={() => {
                onLeave();
                setPending(null);
              }}
            />
            {iAmLeader ? (
              <InlineAction
                label="Izformēt baru"
                confirmLabel="Izformēt baru pavisam?"
                active={pending?.kind === 'disband'}
                variant="ghost"
                onArm={() => setPending({ kind: 'disband' })}
                onCancel={() => setPending(null)}
                onConfirm={() => {
                  onDisband();
                  setPending(null);
                }}
              />
            ) : (
              <InlineAction
                label="Lūgt kļūt par vadoni"
                confirmLabel="Lūgt vadonim nodot vadību?"
                active={pending?.kind === 'ask-promote'}
                variant="ghost"
                onArm={() => setPending({ kind: 'ask-promote' })}
                onCancel={() => setPending(null)}
                onConfirm={() => {
                  onRequestPromotion();
                  setPending(null);
                }}
              />
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
