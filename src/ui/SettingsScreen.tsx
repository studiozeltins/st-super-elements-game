import { Modal } from './Modal';
import { Toggle } from './Toggle';
import { Button } from './Button';
import { fullscreenSupported, toggleFullscreen } from './fullscreen';

interface SettingsScreenProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  showFps: boolean;
  showPing: boolean;
  onToggleFps(next: boolean): void;
  onTogglePing(next: boolean): void;
  onLogout(): void;
}

export function SettingsScreen({
  open,
  onOpenChange,
  showFps,
  showPing,
  onToggleFps,
  onTogglePing,
  onLogout,
}: SettingsScreenProps) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="IESTATĪJUMI">
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
