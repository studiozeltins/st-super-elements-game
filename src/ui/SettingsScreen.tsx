import type { CSSProperties } from 'react';
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
  pixelFilter: boolean;
  onTogglePixelFilter(next: boolean): void;
  reduceMotion: boolean;
  onToggleReduceMotion(next: boolean): void;
  hudTheme: string;
  onHudThemeChange(next: string): void;
  /** Audio bus levels as stored gains [0,1]; the slider maps ↔ integer percent. */
  musicVolume: number;
  sfxVolume: number;
  ambientVolume: number;
  /** Mute flags (independent of volume, D-13); a muted bus keeps its stored level. */
  musicMuted: boolean;
  sfxMuted: boolean;
  ambientMuted: boolean;
  onMusicVolumeChange(next: number): void;
  onSfxVolumeChange(next: number): void;
  onAmbientVolumeChange(next: number): void;
  onToggleMusicMuted(next: boolean): void;
  onToggleSfxMuted(next: boolean): void;
  onToggleAmbientMuted(next: boolean): void;
  onLogout(): void;
  /** All pending party invites for the viewer (incl. dismissed/expired toasts). */
  missedInvites: readonly MissedInvite[];
  onAcceptInvite(inviteId: bigint): void;
  onDeclineInvite(inviteId: bigint): void;
}

/**
 * One volume row: label · native range slider (accent-filled) · live % readout.
 * The slider stays keyboard-operable while its bus is muted (dims only) — mute is
 * independent of volume (D-13), so dragging a muted slider updates the stored gain
 * without auto-unmuting. `--fill` drives the webkit filled-track gradient.
 */
function VolumeField({
  label,
  volume,
  muted,
  onChange,
}: {
  label: string;
  volume: number;
  muted: boolean;
  onChange(next: number): void;
}) {
  const pct = Math.round(volume * 100);
  return (
    <label className="settings__field">
      <span>{label}</span>
      <input
        type="range"
        className={muted ? 'settings__slider settings__slider--muted' : 'settings__slider'}
        min={0}
        max={100}
        step={1}
        value={pct}
        aria-label={label}
        onChange={event => onChange(Number(event.target.value) / 100)}
        style={{ '--fill': `${pct}%` } as CSSProperties}
      />
      <span className="settings__value">{pct}%</span>
    </label>
  );
}

export function SettingsScreen({
  open,
  onOpenChange,
  showFps,
  showPing,
  onToggleFps,
  onTogglePing,
  pixelFilter,
  onTogglePixelFilter,
  reduceMotion,
  onToggleReduceMotion,
  hudTheme,
  onHudThemeChange,
  musicVolume,
  sfxVolume,
  ambientVolume,
  musicMuted,
  sfxMuted,
  ambientMuted,
  onMusicVolumeChange,
  onSfxVolumeChange,
  onAmbientVolumeChange,
  onToggleMusicMuted,
  onToggleSfxMuted,
  onToggleAmbientMuted,
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
      <Toggle label="Pikseļu filtrs" checked={pixelFilter} onChange={onTogglePixelFilter} />
      <Toggle label="Samazināt kustību" checked={reduceMotion} onChange={onToggleReduceMotion} />
      {fullscreenSupported && (
        <Button variant="ghost" block onClick={toggleFullscreen}>
          ⛶ Pilnekrāns
        </Button>
      )}

      {/* Audio — Music/SFX volume + mute, live-apply through the Game bus setters
          (D-13). Toggles are affirmative (checked = audible); App persists the
          inverse as the mute flag. Order: volume then its mute, per bus. */}
      <p className="settings__section">SKAŅA</p>
      <VolumeField
        label="Mūzikas skaļums"
        volume={musicVolume}
        muted={musicMuted}
        onChange={onMusicVolumeChange}
      />
      <Toggle label="Mūzika" checked={!musicMuted} onChange={next => onToggleMusicMuted(!next)} />
      <VolumeField
        label="Efektu skaļums"
        volume={sfxVolume}
        muted={sfxMuted}
        onChange={onSfxVolumeChange}
      />
      <Toggle
        label="Skaņas efekti"
        checked={!sfxMuted}
        onChange={next => onToggleSfxMuted(!next)}
      />
      <VolumeField
        label="Vides skaļums"
        volume={ambientVolume}
        muted={ambientMuted}
        onChange={onAmbientVolumeChange}
      />
      <Toggle label="Vide" checked={!ambientMuted} onChange={next => onToggleAmbientMuted(!next)} />

      <p className="settings__section">KONTS</p>
      <Button variant="danger" block onClick={onLogout}>
        IZIET NO KONTA
      </Button>

      <p className="settings__hint">ESC — atvērt / aizvērt iestatījumus</p>
    </Modal>
  );
}
