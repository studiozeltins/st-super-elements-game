import { CHARACTERS, ROLE_META } from '../game/data/characters';
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
// clickable namecard per member: online dot, name, role badge (ROLE_META), a
// health bar with numeric cur/max, and a leader crown. Tapping a card opens the
// PlayerSheet (details + leader kick). Hidden entirely when the viewer is solo.
// All data reads from already-subscribed rows (player.currentHealth /
// activeCharacterId); max health comes from the client CHARACTERS table.
export function PartyFrames({ myRoster, leaderHex, players, myHex, onSelect }: PartyFramesProps) {
  if (myRoster.length === 0) return null;

  const ordered = [...myRoster].sort((a, b) => {
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
        const role = character ? ROLE_META[character.role] : null;
        const maxHealth = character?.maxHealth ?? 0;
        const curHealth = Math.max(0, Math.round(player?.currentHealth ?? 0));
        const pct = maxHealth > 0 ? Math.min(100, Math.max(0, (curHealth / maxHealth) * 100)) : 0;
        const isLeader = hex === leaderHex;
        const isMe = hex === myHex;

        return (
          <button
            type="button"
            key={hex}
            className={`party-frames__card ${online ? '' : 'party-frames__card--offline'}`}
            onClick={() => onSelect(hex)}
            aria-label={`${name}${isLeader ? ' (vadonis)' : ''} — ${curHealth}/${maxHealth} HP`}
          >
            <div className="party-frames__top">
              {isLeader && (
                <span className="party-frames__crown" style={{ color: 'var(--gold)' }} aria-hidden="true">
                  ♛
                </span>
              )}
              <span
                className="party-frames__dot"
                aria-hidden="true"
                data-online={online ? 'true' : 'false'}
              >
                {online ? '●' : '○'}
              </span>
              <span className="party-frames__name">
                {name}
                {isMe && <span className="party-frames__me"> (tu)</span>}
              </span>
              {role && (
                <span
                  className="party-frames__role"
                  style={{ color: `var(${role.token})` }}
                  aria-label={`Loma: ${role.aria}`}
                >
                  {role.label}
                </span>
              )}
            </div>
            <div className="party-frames__hp">
              <div className="party-frames__hp-track">
                <div
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
              </div>
              <span className="party-frames__hp-num">
                {curHealth}
                <span className="party-frames__hp-sep">/</span>
                {maxHealth}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
