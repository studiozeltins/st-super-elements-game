import { CHARACTERS, ROLE_META } from '../game/data/characters';
import { ELEMENTS } from '../game/data/elements';
import type { Player, PartyMember } from '../module_bindings/types';

interface PartyRosterProps {
  /** Members of the viewer's party (empty when not in a party). */
  myRoster: readonly PartyMember[];
  /** Canonical hex of the party leader (crown row); null when not in a party. */
  leaderHex: string | null;
  /** Live player rows — the source of name / active character / online per member. */
  players: readonly Player[];
}

// Compact party roster: one row per member with an online dot, name, active
// character (in its element color), a role badge (reusing ROLE_META + the shipped
// .sheet__role box — no new server field), and a leader crown. Leader is rendered
// first, then members by joinedAt. Offline members dim to 0.5 with a hollow dot.
// Renders an empty state when the viewer is in no party. All data reads from
// already-subscribed rows (player.online / player.activeCharacterId).
export function PartyRoster({ myRoster, leaderHex, players }: PartyRosterProps) {
  if (myRoster.length === 0) {
    return (
      <div className="party-roster__empty">
        <p className="party-roster__empty-head">Tu neesi nevienā barā</p>
        <p className="party-roster__empty-body">
          Piesit spēlētājam, lai izveidotu baru vai tam pievienotos.
        </p>
      </div>
    );
  }

  // Leader first, then remaining members oldest-joined first (D-10 ordering).
  const ordered = [...myRoster].sort((a, b) => {
    const aLeader = a.identity.toHexString() === leaderHex;
    const bLeader = b.identity.toHexString() === leaderHex;
    if (aLeader !== bLeader) return aLeader ? -1 : 1;
    return a.joinedAt.microsSinceUnixEpoch < b.joinedAt.microsSinceUnixEpoch ? -1 : 1;
  });

  return (
    <div className="party-roster">
      {ordered.map(member => {
        const hex = member.identity.toHexString();
        const player = players.find(p => p.identity.toHexString() === hex);
        const online = player?.online ?? false;
        const name = player?.name ?? 'Spēlētājs';
        const character = player ? CHARACTERS[player.activeCharacterId] : undefined;
        const element = character ? ELEMENTS[character.element] : null;
        const role = character ? ROLE_META[character.role] : null;
        const isLeader = hex === leaderHex;
        return (
          <div
            key={hex}
            className={`party-roster__row ${online ? '' : 'party-roster__row--offline'}`}
          >
            <span
              className="party-roster__dot"
              aria-label={online ? 'Tiešsaistē' : 'Nesaistē'}
            >
              {online ? '●' : '○'}
            </span>
            <span className="party-roster__name">{name}</span>
            {character && element && (
              <span className="party-roster__char" style={{ color: element.cssColor }}>
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
            {isLeader && (
              <span
                className="party-roster__crown"
                style={{ color: 'var(--gold)' }}
                aria-label="Bara vadonis"
              >
                ♛
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
