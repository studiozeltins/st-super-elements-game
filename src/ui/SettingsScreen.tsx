interface SettingsScreenProps {
  showFps: boolean;
  showPing: boolean;
  onToggleFps(next: boolean): void;
  onTogglePing(next: boolean): void;
  onClose(): void;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange(next: boolean): void }) {
  return (
    <button
      type="button"
      className={`settings__row${checked ? ' settings__row--on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="settings__label">{label}</span>
      <span className={`settings__switch${checked ? ' settings__switch--on' : ''}`}>
        <span className="settings__knob" />
      </span>
    </button>
  );
}

export function SettingsScreen({ showFps, showPing, onToggleFps, onTogglePing, onClose }: SettingsScreenProps) {
  return (
    <div className="settings" onClick={onClose}>
      <div className="settings__panel" onClick={event => event.stopPropagation()}>
        <div className="settings__header">
          <h2 className="settings__title">IESTATĪJUMI</h2>
          <button type="button" className="settings__close" onClick={onClose} aria-label="Aizvērt">
            ✕
          </button>
        </div>

        <p className="settings__section">ATTĒLOŠANA</p>
        <Toggle label="Rādīt FPS" checked={showFps} onChange={onToggleFps} />
        <Toggle label="Rādīt ping" checked={showPing} onChange={onTogglePing} />

        <p className="settings__hint">ESC — atvērt / aizvērt iestatījumus</p>
      </div>
    </div>
  );
}
