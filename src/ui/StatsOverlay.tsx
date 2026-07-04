import type { DbConnection } from '../module_bindings';
import { useFps, usePing } from '../hooks/useStats';

interface StatsOverlayProps {
  connection: DbConnection | null;
  showFps: boolean;
  showPing: boolean;
}

// Self-contained corner overlay: runs its own FPS/ping sampling so frequent
// updates re-render only this component, not the whole app.
export function StatsOverlay({ connection, showFps, showPing }: StatsOverlayProps) {
  const fps = useFps(showFps);
  const ping = usePing(connection, showPing);

  if (!showFps && !showPing) return null;

  return (
    <div className="stats-overlay">
      {showFps && (
        <span className="stats-overlay__item">
          <b>{fps}</b> FPS
        </span>
      )}
      {showPing && (
        <span className="stats-overlay__item">
          <b>{ping == null ? '—' : ping}</b> ms
        </span>
      )}
    </div>
  );
}
