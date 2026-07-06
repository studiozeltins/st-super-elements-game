import { Modal } from './Modal';
import { Toggle } from './Toggle';
import { Button } from './Button';
import { fullscreenSupported, toggleFullscreen } from './fullscreen';
import { HUD_THEMES } from '../styles/hud/themes';

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
}: SettingsScreenProps) {
  const activeTheme = HUD_THEMES.find(t => t.id === hudTheme) ?? HUD_THEMES[0];
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="IESTATĪJUMI">
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
