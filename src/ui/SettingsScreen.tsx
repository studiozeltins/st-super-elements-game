import { Modal } from './Modal';
import { Toggle } from './Toggle';
import { Button } from './Button';
import { fullscreenSupported, toggleFullscreen } from './fullscreen';
import { HUD_THEMES } from '../styles/hud/themes';

interface MissedInvite {
  /** Invite row id — passed verbatim to the accept/decline reducers. */
  id: bigint;
  /** Ready-to-render Latvian message (same copy as the toast, by kind). */
  message: string;
}

interface SettingsScreenProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  showFps: boolean;
  showPing: boolean;
  onToggleFps(next: boolean): void;
  onTogglePing(next: boolean): void;
  hudTheme: string;
  onHudThemeChange(next: string): void;
  onLogout(): void;
  /** All pending party invites for the viewer (incl. dismissed/expired toasts). */
  missedInvites: readonly MissedInvite[];
  onAcceptInvite(inviteId: bigint): void;
  onDeclineInvite(inviteId: bigint): void;
}

export function SettingsScreen({
  open,
  onOpenChange,
  showFps,
  showPing,
  onToggleFps,
  onTogglePing,
  hudTheme,
  onHudThemeChange,
  onLogout,
  missedInvites,
  onAcceptInvite,
  onDeclineInvite,
}: SettingsScreenProps) {
  const activeTheme = HUD_THEMES.find(t => t.id === hudTheme) ?? HUD_THEMES[0];
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="IESTATĪJUMI">
      {/* Calm, non-intrusive fallback for invites whose toast was missed/dismissed
          (D-07). Shows ALL pending invites since the server row persists (D-08);
          Accept/Decline call the SAME reducers as the toast. */}
      <p className="settings__section">NOKAVĒTIE AICINĀJUMI</p>
      {missedInvites.length === 0 ? (
        <p className="missed-invites__empty">Nav nokavētu aicinājumu.</p>
      ) : (
        <ul className="missed-invites">
          {missedInvites.map(invite => (
            <li key={invite.id.toString()} className="missed-invites__item">
              <span className="missed-invites__msg">{invite.message}</span>
              <div className="missed-invites__actions">
                <Button variant="primary" onClick={() => onAcceptInvite(invite.id)}>
                  Pieņemt
                </Button>
                <Button variant="ghost" onClick={() => onDeclineInvite(invite.id)}>
                  Noraidīt
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="settings__section">SASKARNE</p>
      {/* Live HUD-skin picker — swaps the gameplay overlay on the fly. */}
      <label className="settings__field">
        <span>UI dizains</span>
        <select
          className="settings__select"
          value={hudTheme}
          onChange={event => onHudThemeChange(event.target.value)}
        >
          {HUD_THEMES.map(theme => (
            <option key={theme.id} value={theme.id}>
              {theme.label}
            </option>
          ))}
        </select>
      </label>
      <p className="settings__theme-blurb">{activeTheme.blurb}</p>

      <p className="settings__section">ATTĒLOŠANA</p>
      <Toggle label="Rādīt FPS" checked={showFps} onChange={onToggleFps} />
      <Toggle label="Rādīt ping" checked={showPing} onChange={onTogglePing} />
      {fullscreenSupported && (
        <Button variant="ghost" block onClick={toggleFullscreen}>
          ⛶ Pilnekrāns
        </Button>
      )}

      <p className="settings__section">KONTS</p>
      <Button variant="danger" block onClick={onLogout}>
        IZIET NO KONTA
      </Button>

      <p className="settings__hint">ESC — atvērt / aizvērt iestatījumus</p>
    </Modal>
  );
}
