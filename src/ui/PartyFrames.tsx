import { CHARACTERS } from '../game/data/characters';
import { ELEMENTS } from '../game/data/elements';
import type { Player, PartyMember } from '../module_bindings/types';

interface PartyFramesProps {
  /** Members of the viewer's party (empty when not in a party → panel hides). */
  myRoster: readonly PartyMember[];
  /** Canonical hex of the party leader (crown row); null when not in a party. */
  leaderHex: string | null;
  /** Live player rows — the source of name / active character / health / online. */
  players: readonly Player[];
  /** Viewer's own canonical hex, so we can label / skip self if desired. */
  myHex: string | null;
  /** Open the slide-out sheet for a tapped member (kick / details). */
  onSelect(hex: string): void;
}

// Persistent left-side party panel, anchored above the mobile controller. One
// borderless Frost-light row per member — a character icon (initial in element
// color), the name, and a slim health bar with numeric cur/max — styled like the
// character switcher, no card chrome. Tapping a row opens the PlayerSheet
// (details + leader kick). Hidden entirely when the viewer is solo. All data
// reads from already-subscribed rows; max health comes from client CHARACTERS.
export function PartyFrames({ myRoster, leaderHex, players, myHex, onSelect }: PartyFramesProps) {
  // Show teammates only — the viewer's own health lives in the main HUD.
  const others = myRoster.filter(m => m.identity.toHexString() !== myHex);
  if (others.length === 0) return null;

  const ordered = [...others].sort((a, b) => {
    const aLeader = a.identity.toHexString() === leaderHex;
    const bLeader = b.identity.toHexString() === leaderHex;
    if (aLeader !== bLeader) return aLeader ? -1 : 1;
    return a.joinedAt.microsSinceUnixEpoch < b.joinedAt.microsSinceUnixEpoch ? -1 : 1;
  });

  return (
    <div className="party-frames" aria-label="Bara biedri">
      {ordered.map(member => {
        const hex = member.identity.toHexString();
        const player = players.find(p => p.identity.toHexString() === hex);
        const online = player?.online ?? false;
        const name = player?.name ?? 'Spēlētājs';
        const character = player ? CHARACTERS[player.activeCharacterId] : undefined;
        const element = character ? ELEMENTS[character.element] : null;
        const elementColor = element?.cssColor ?? 'var(--muted)';
        const initial = (character?.displayName ?? name).charAt(0).toUpperCase();
        const maxHealth = character?.maxHealth ?? 0;
        const curHealth = Math.max(0, Math.round(player?.currentHealth ?? 0));
        const pct = maxHealth > 0 ? Math.min(100, Math.max(0, (curHealth / maxHealth) * 100)) : 0;
        const isLeader = hex === leaderHex;

        return (
          <button
            type="button"
            key={hex}
            className={`party-frames__row ${online ? '' : 'party-frames__row--offline'}`}
            onClick={() => onSelect(hex)}
            aria-label={`${name}${isLeader ? ' (vadonis)' : ''} — ${curHealth}/${maxHealth} HP`}
          >
            <span className="party-frames__icon" style={{ color: elementColor }} aria-hidden="true">
              {initial}
            </span>
            <span className="party-frames__body">
              <span className="party-frames__name">
                {isLeader && (
                  <span className="party-frames__crown" aria-hidden="true">
                    ♛
                  </span>
                )}
                <span className="party-frames__label">{name}</span>
                <span className="party-frames__hp-num">
                  {curHealth}/{maxHealth}
                </span>
              </span>
              <span className="party-frames__hp-track">
                <span
                  className="party-frames__hp-fill"
                  style={{
                    width: `${pct}%`,
                    background:
                      pct > 50
                        ? 'var(--hp-ok, #4ade80)'
                        : pct > 20
                          ? 'var(--hp-warn, #facc15)'
                          : 'var(--hp-low, #ef4444)',
                  }}
                />
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
