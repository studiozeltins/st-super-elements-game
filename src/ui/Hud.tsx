import { CHARACTERS } from '../game/data/characters';
import { ELEMENTS } from '../game/data/elements';
import { MAX_HEALTH } from '../game/data/constants';
import type { HudState } from '../game/createGame';
import { VirtualJoystick } from './VirtualJoystick';

interface HudProps {
  playerName: string;
  health: number;
  primogems: number;
  partyCharacterIds: string[];
  activeCharacterId: string;
  hudState: HudState;
  onSelectPartySlot(slotIndex: number): void;
  onOpenGacha(): void;
  onJoystickMove(x: number, z: number): void;
  onTouchButton(button: 'attack' | 'skill' | 'jump'): void;
  onTouchButtonRelease(button: 'attack'): void;
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    void document.exitFullscreen();
    return;
  }
  void document.documentElement.requestFullscreen();
}

export function Hud({
  playerName,
  health,
  primogems,
  partyCharacterIds,
  activeCharacterId,
  hudState,
  onSelectPartySlot,
  onOpenGacha,
  onJoystickMove,
  onTouchButton,
  onTouchButtonRelease,
}: HudProps) {
  const activeCharacter = CHARACTERS[activeCharacterId];
  const activeElement = activeCharacter ? ELEMENTS[activeCharacter.element] : null;
  const healthFraction = Math.max(0, Math.min(1, health / MAX_HEALTH));

  return (
    <div className="hud">
      <div className="hud__top-left">
        <div className="hud__name-row">
          <span className="hud__player-name">{playerName}</span>
          {activeCharacter && activeElement && (
            <span className="hud__character" style={{ color: activeElement.cssColor }}>
              {activeCharacter.displayName}
            </span>
          )}
        </div>
        <div className="hud__health">
          <div
            className="hud__health-fill"
            style={{
              transform: `scaleX(${healthFraction})`,
              background: healthFraction > 0.35 ? 'var(--accent)' : 'var(--danger)',
            }}
          />
        </div>
        <span className={`hud__zone ${hudState.inSafeZone ? 'hud__zone--safe' : 'hud__zone--pvp'}`}>
          {hudState.inSafeZone ? 'DROŠĀ ZONA' : 'PVP ZONA'}
        </span>
      </div>

      <div className="hud__top-right">
        <span className="hud__gems">✦ {primogems}</span>
        <button className="hud__chip" onClick={onOpenGacha}>
          VĒLĒŠANĀS
        </button>
        <button className="hud__chip" onClick={toggleFullscreen}>
          ⛶
        </button>
      </div>

      <div className="hud__party">
        {partyCharacterIds.map((characterId, slotIndex) => {
          const character = CHARACTERS[characterId];
          if (!character) return null;
          const element = ELEMENTS[character.element];
          const isActive = characterId === activeCharacterId;
          return (
            <button
              key={characterId}
              className={`party-slot ${isActive ? 'party-slot--active' : ''}`}
              style={{ '--element-color': element.cssColor } as React.CSSProperties}
              onClick={() => onSelectPartySlot(slotIndex)}
            >
              <span className="party-slot__inner">
                <span className="party-slot__initial">{character.displayName[0]}</span>
                <span className="party-slot__key">{slotIndex + 1}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="hud__touch-controls">
        <VirtualJoystick onMove={onJoystickMove} />
        <div className="hud__actions">
          <button
            className="action-button action-button--jump"
            onPointerDown={() => onTouchButton('jump')}
          >
            ↥
          </button>
          <button
            className="action-button action-button--skill"
            style={{ '--cooldown': hudState.skillCooldownFraction } as React.CSSProperties}
            onPointerDown={() => onTouchButton('skill')}
          >
            E
          </button>
          <button
            className="action-button action-button--attack"
            style={{ '--cooldown': hudState.attackCooldownFraction } as React.CSSProperties}
            onPointerDown={() => onTouchButton('attack')}
            onPointerUp={() => onTouchButtonRelease('attack')}
            onPointerLeave={() => onTouchButtonRelease('attack')}
          >
            ⚔
          </button>
        </div>
      </div>

      <div className="hud__hints">WASD kustība · Peles klikšķis uzbrukums · Q prasme · Space lēciens · 1-4 varoņi</div>
    </div>
  );
}
