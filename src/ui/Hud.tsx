import { useEffect, useRef, useState } from 'react';
import { CHARACTERS } from '../game/data/characters';
import { ELEMENTS } from '../game/data/elements';
import { MAX_HEALTH, RAID_PARTY_SIZE } from '../game/data/constants';
import type { HudState } from '../game/createGame';
import { VirtualJoystick } from './VirtualJoystick';

// A glyph per skill kind so each character box shows its special ability at a glance.
const SKILL_GLYPH: Record<string, string> = {
  projectile: '➹',
  nova: '✷',
  dash: '»',
  ring: '◎',
  volley: '⁘',
};

// Bench health-bar colour ramp for themes that show a labelled member bar
// (e.g. Frost): green when healthy, amber at half, red when low. Kept
// independent of the theme accent so "health = green" always reads true.
function benchHpColor(fraction: number): string {
  if (fraction > 0.5) return '#7ec843';
  if (fraction > 0.25) return '#f5a623';
  return '#ff5c3c';
}

// Action-button glyphs, drawn as inline SVG (Genshin-style, crisp at any size)
// so they inherit the button's colour via currentColor across every theme.
function JumpIcon() {
  // Solid up-arrow lifting off a ground bar.
  return (
    <svg className="ab-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3.4 4.9 10.5a1 1 0 0 0 .71 1.71H8.7V16a1 1 0 0 0 1 1h4.6a1 1 0 0 0 1-1v-3.79h3.09a1 1 0 0 0 .71-1.71z" />
      <rect x="7.2" y="19.2" width="9.6" height="2.2" rx="1.1" />
    </svg>
  );
}

function SkillIcon() {
  // Four-point elemental burst.
  return (
    <svg className="ab-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2c.65 4.6 1.75 5.7 6.3 6.3-4.55.65-5.65 1.75-6.3 6.3-.65-4.55-1.75-5.65-6.3-6.3C10.25 7.7 11.35 6.6 12 2Z" />
      <circle cx="18.5" cy="17" r="1.6" opacity="0.85" />
      <circle cx="5.5" cy="18.5" r="1" opacity="0.7" />
    </svg>
  );
}

function AttackIcon() {
  // Clean single sword (Lucide geometry): blade to the top-right, guard + grip
  // bottom-left. Line art with round joins — reads sharp, not sketchy.
  return (
    <svg
      className="ab-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 3v3l-11 11-3-3L18 3z" />
      <path d="m5 13 6 6" />
      <path d="m4 17 3 3" />
      <path d="M2 22l3-1" />
    </svg>
  );
}

interface HudProps {
  playerName: string;
  health: number;
  gems: number;
  partyCharacterIds: string[];
  /** characterId -> current HP fraction [0..1] for each owned character. */
  partyHealthById: Record<string, number>;
  activeCharacterId: string;
  hudState: HudState;
  /** Number of members in the viewer's player party (Bars). */
  partyCount: number;
  /** Whether the viewer is currently in a player party. */
  inPlayerParty: boolean;
  onSelectPartySlot(slotIndex: number): void;
  onOpenSettings(): void;
  onOpenGacha(tab: 'banners' | 'party'): void;
  onOpenCharacters(): void;
  onOpenParty(): void;
  onJoystickMove(x: number, z: number): void;
  onTouchButton(button: 'attack' | 'skill' | 'jump'): void;
  onTouchButtonRelease(button: 'attack'): void;
}

export function Hud({
  playerName,
  health,
  gems,
  partyCharacterIds,
  partyHealthById,
  activeCharacterId,
  hudState,
  partyCount,
  inPlayerParty,
  onSelectPartySlot,
  onOpenSettings,
  onOpenGacha,
  onOpenCharacters,
  onOpenParty,
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
  // Low-HP screen glow (top/left/right edges): a fixed 24px shadow-like gradient
  // fading from the colour at the edge to transparent inward. Appears below 50%
  // and blinks faster as HP drops (500ms @50% → 100ms @10%, floored there).
  // Colour is orange near 50%, red below 40%.
  const lowHp = healthFraction < 0.5;
  const criticalHp = healthFraction <= 0.1;
  const blinkProgress = Math.max(0, Math.min(1, (0.5 - healthFraction) / (0.5 - 0.1)));
  const blinkMs = Math.round(500 - blinkProgress * (500 - 100)); // 500ms @50% → 100ms @10%
  const lowHpColor = healthFraction >= 0.4 ? '#f7b733' : '#e5484d';

  // Health-bar fill: green ≥50%, orange 40–50%, red below 40%.
  const healthColor =
    healthFraction >= 0.5 ? 'var(--accent)' : healthFraction >= 0.4 ? '#f5a623' : 'var(--danger)';

  // Fire a one-shot "skill ready" pulse on any bench slot the moment its cooldown drains.
  const cooldownByChar = hudState.skillCooldownByCharacter;
  const [readyPulses, setReadyPulses] = useState<Record<string, number>>({});
  const prevCdByChar = useRef<Record<string, number>>({});
  useEffect(() => {
    const prev = prevCdByChar.current;
    const readyNow: string[] = [];
    for (const id of new Set([...Object.keys(prev), ...Object.keys(cooldownByChar)])) {
      if ((prev[id] ?? 0) > 0.02 && (cooldownByChar[id] ?? 0) <= 0.02) readyNow.push(id);
    }
    prevCdByChar.current = { ...cooldownByChar };
    if (readyNow.length) {
      setReadyPulses(current => {
        const next = { ...current };
        for (const id of readyNow) next[id] = (next[id] ?? 0) + 1;
        return next;
      });
    }
  }, [cooldownByChar]);

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
          {/* Player-party (Bars) entry chip — distinct from the ⚑ "Komanda"
              character-team quick-button; opens the online-players party surface. */}
          <button type="button" className="hud__party-chip" onClick={onOpenParty} aria-label="Bars">
            {inPlayerParty ? `BARS ${partyCount}/${RAID_PARTY_SIZE}` : 'BARS'}
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
        <span className="hud__gems">✦ {gems}</span>
        <div className="hud__quick">
          <button
            className="hud__quick-btn"
            onClick={() => onOpenGacha('banners')}
            aria-label="Vēlēšanās"
          >
            ✧
          </button>
          <button
            className="hud__quick-btn"
            onClick={() => onOpenGacha('party')}
            aria-label="Komanda"
          >
            ⚑
          </button>
          <button className="hud__quick-btn" onClick={onOpenCharacters} aria-label="Varoņi">
            ❖
          </button>
        </div>
      </div>

      <div className="hud__party">
        {partyCharacterIds.map((characterId, slotIndex) => {
          const character = CHARACTERS[characterId];
          if (!character) return null;
          // Bench-only bar: the active character is the one you're playing, so it
          // is hidden here — only the three swappable members show.
          if (characterId === activeCharacterId) return null;
          const element = ELEMENTS[character.element];
          const hpFraction = Math.max(0, Math.min(1, partyHealthById[characterId] ?? 1));
          // Each bench member shows its own live cooldown (benched skills keep cooling).
          const cooldown = cooldownByChar[characterId] ?? 0;
          const readyPulse = readyPulses[characterId] ?? 0;
          const skillGlyph = SKILL_GLYPH[character.skill.kind] ?? '✦';
          return (
            <button
              key={characterId}
              className={`party-slot ${cooldown > 0.02 ? 'party-slot--cooling' : ''}`}
              style={{ '--element-color': element.cssColor } as React.CSSProperties}
              onClick={() => onSelectPartySlot(slotIndex)}
              aria-label={`${character.displayName} (${slotIndex + 1})`}
            >
              {/* Name (+ skill-type glyph) and health readout shown left of the
                  avatar. Hidden by default (styles/hud/base.css); themes like Frost
                  opt in. The glyph sits after the name so the avatar disc stays clean. */}
              <span className="party-slot__meta" aria-hidden="true">
                <span className="party-slot__nameline">
                  <span className="party-slot__name">{character.displayName}</span>
                  <span className="party-slot__type" title={character.skill.displayName}>
                    {skillGlyph}
                  </span>
                </span>
                <span className="party-slot__meta-hp">
                  <span
                    className="party-slot__meta-hp-fill"
                    style={{ transform: `scaleX(${hpFraction})`, background: benchHpColor(hpFraction) }}
                  />
                </span>
              </span>
              <span className="party-slot__inner">
                <span className="party-slot__initial">{character.displayName[0]}</span>
                <span className="party-slot__skill" title={character.skill.displayName}>
                  {skillGlyph}
                </span>
                {cooldown > 0.02 && (
                  <>
                    <span
                      className="party-slot__cd"
                      style={{ '--cooldown': cooldown } as React.CSSProperties}
                    />
                    {/* The "line that runs around" — a colored ring arc. Base themes
                        shrink it as the skill cools; Frost fills it up (see frost.css). */}
                    <span
                      className="party-slot__ring"
                      style={{ '--cooldown': cooldown } as React.CSSProperties}
                    />
                  </>
                )}
                {readyPulse > 0 && (
                  <span key={readyPulse} className="party-slot__ready" aria-hidden="true" />
                )}
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
            <JumpIcon />
          </button>
          <button
            className={`action-button action-button--skill ${
              hudState.skillCooldownFraction > 0.001 ? 'action-button--cooling' : ''
            }`}
            style={
              {
                '--cooldown': hudState.skillCooldownFraction,
                // Drives the Frost fill-ring + ready glow in the active hero's colour.
                '--element-color': activeElement?.cssColor ?? 'var(--accent)',
              } as React.CSSProperties
            }
            onPointerDown={() => onTouchButton('skill')}
            disabled={hudState.skillCooldownFraction > 0.001}
            aria-label="Prasme"
          >
            <span className="action-button__key">
              <SkillIcon />
            </span>
          </button>
          <button
            className="action-button action-button--attack"
            style={
              {
                '--cooldown': hudState.attackCooldownFraction,
                '--element-color': activeElement?.cssColor ?? 'var(--accent)',
              } as React.CSSProperties
            }
            onPointerDown={() => onTouchButton('attack')}
            onPointerUp={() => onTouchButtonRelease('attack')}
            onPointerLeave={() => onTouchButtonRelease('attack')}
            aria-label="Uzbrukt"
          >
            <AttackIcon />
          </button>
        </div>
      </div>

      <div
        className={`hud__health ${criticalHp ? 'hud__health--critical' : ''}`}
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
            background: healthColor,
          }}
        />
      </div>

      {lowHp && (
        <div
          className="hud__lowhp"
          style={
            {
              animationDuration: `${blinkMs}ms`,
              '--lowhp-color': lowHpColor,
            } as React.CSSProperties
          }
          aria-hidden="true"
        />
      )}

      <div className="hud__hints">WASD kustība · Peles klikšķis uzbrukums · Q prasme · Space lēciens · 1-4 varoņi</div>
    </div>
  );
}
