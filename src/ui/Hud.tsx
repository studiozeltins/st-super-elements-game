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
  /** characterId -> current HP fraction [0..1] for each owned character. */
  partyHealthById: Record<string, number>;
  activeCharacterId: string;
  hudState: HudState;
  onSelectPartySlot(slotIndex: number): void;
  onOpenSettings(): void;
  onOpenGacha(): void;
  onJoystickMove(x: number, z: number): void;
  onTouchButton(button: 'attack' | 'skill' | 'jump'): void;
  onTouchButtonRelease(button: 'attack'): void;
}

export function Hud({
  playerName,
  health,
  primogems,
  partyCharacterIds,
  partyHealthById,
  activeCharacterId,
  hudState,
  onSelectPartySlot,
  onOpenSettings,
  onOpenGacha,
  onJoystickMove,
  onTouchButton,
  onTouchButtonRelease,
}: HudProps) {
  const activeCharacter = CHARACTERS[activeCharacterId];
  const activeElement = activeCharacter ? ELEMENTS[activeCharacter.element] : null;
  const maxHealth = activeCharacter?.maxHealth ?? MAX_HEALTH;
  const healthFraction = Math.max(0, Math.min(1, health / maxHealth));

  // Low-HP screen border: appears below 40%, blinks faster the lower it gets,
  // and at <=5% locks solid red at double thickness (see .hud__lowhp CSS).
  const lowHp = healthFraction < 0.4;
  const criticalHp = healthFraction <= 0.05;
  // Ramp to super-fast by 10% HP (stays there down to the 5% solid lock).
  const blinkProgress = Math.max(0, Math.min(1, (0.4 - healthFraction) / (0.4 - 0.1)));
  const blinkMs = Math.round(700 - blinkProgress * (700 - 130)); // 700ms @40% → 130ms @10%

  return (
    <div className="hud">
      <div className="hud__top-left">
        <div className="hud__id-row">
          <button className="icon-btn hud__gear" onClick={onOpenSettings} aria-label="Iestatījumi">
            ⚙
          </button>
          <span className="hud__player-name">{playerName}</span>
          {activeCharacter && activeElement && (
            <span className="hud__character" style={{ color: activeElement.cssColor }}>
              {activeCharacter.displayName}
            </span>
          )}
        </div>
        <div className="hud__meta-row">
          <span className={`hud__zone ${hudState.inSafeZone ? 'hud__zone--safe' : 'hud__zone--pvp'}`}>
            {hudState.inSafeZone ? 'DROŠĀ ZONA' : 'PVP ZONA'}
          </span>
          <button className="hud__chip hud__wish" onClick={onOpenGacha}>
            VĒLĒŠANĀS
          </button>
        </div>
      </div>

      {hudState.combo > 1 && (
        <div
          className={`hud__combo ${hudState.combo >= 25 ? 'hud__combo--hot' : ''}`}
          key={hudState.combo}
        >
          <span className="hud__combo-count">{hudState.combo}</span>
          <span className="hud__combo-label">KOMBO</span>
        </div>
      )}

      <div className="hud__top-right">
        <span className="hud__gems">✦ {primogems}</span>
      </div>

      <div className="hud__party">
        {partyCharacterIds.map((characterId, slotIndex) => {
          const character = CHARACTERS[characterId];
          if (!character) return null;
          const element = ELEMENTS[character.element];
          const isActive = characterId === activeCharacterId;
          const hpFraction = Math.max(0, Math.min(1, partyHealthById[characterId] ?? 1));
          return (
            <button
              key={characterId}
              className={`party-slot ${isActive ? 'party-slot--active' : ''}`}
              style={{ '--element-color': element.cssColor } as React.CSSProperties}
              onClick={() => onSelectPartySlot(slotIndex)}
              aria-label={`${character.displayName} (${slotIndex + 1})`}
              aria-pressed={isActive}
            >
              <span className="party-slot__inner">
                <span className="party-slot__initial">{character.displayName[0]}</span>
                <span className="party-slot__key">{slotIndex + 1}</span>
                <span className="party-slot__hp">
                  <span
                    className="party-slot__hp-fill"
                    style={{
                      transform: `scaleX(${hpFraction})`,
                      background: hpFraction > 0.35 ? 'var(--accent)' : 'var(--danger)',
                    }}
                  />
                </span>
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
            aria-label="Lēkt"
          >
            ↥
          </button>
          <button
            className="action-button action-button--skill"
            style={{ '--cooldown': hudState.skillCooldownFraction } as React.CSSProperties}
            onPointerDown={() => onTouchButton('skill')}
            aria-label="Prasme"
          >
            E
          </button>
          <button
            className="action-button action-button--attack"
            style={{ '--cooldown': hudState.attackCooldownFraction } as React.CSSProperties}
            onPointerDown={() => onTouchButton('attack')}
            onPointerUp={() => onTouchButtonRelease('attack')}
            onPointerLeave={() => onTouchButtonRelease('attack')}
            aria-label="Uzbrukt"
          >
            ⚔
          </button>
        </div>
      </div>

      <div
        className={`hud__health ${healthFraction <= 0.05 ? 'hud__health--critical' : ''}`}
        role="progressbar"
        aria-label="Veselība"
        aria-valuemin={0}
        aria-valuemax={maxHealth}
        aria-valuenow={Math.round(health)}
      >
        <div
          className="hud__health-fill"
          style={{
            transform: `scaleX(${healthFraction})`,
            background: healthFraction > 0.4 ? 'var(--accent)' : 'var(--danger)',
          }}
        />
      </div>

      {lowHp && (
        <div
          className={`hud__lowhp ${criticalHp ? 'hud__lowhp--critical' : ''}`}
          style={{ animationDuration: `${blinkMs}ms` }}
          aria-hidden="true"
        />
      )}

      <div className="hud__hints">WASD kustība · Peles klikšķis uzbrukums · Q prasme · Space lēciens · 1-4 varoņi</div>
    </div>
  );
}
