// iOS Safari does not support the Fullscreen API on regular elements (only
// <video>), so requestFullscreen is undefined there. We gate the control on
// support and fall back to the webkit-prefixed call where it exists.
const el = typeof document !== 'undefined' ? document.documentElement : null;

export const fullscreenSupported = Boolean(
  el && (el.requestFullscreen || (el as unknown as { webkitRequestFullscreen?: unknown }).webkitRequestFullscreen)
);

export function toggleFullscreen() {
  const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
  const root = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  const isFullscreen = doc.fullscreenElement || doc.webkitFullscreenElement;
  if (isFullscreen) {
    if (doc.exitFullscreen) void doc.exitFullscreen();
    else doc.webkitExitFullscreen?.();
    return;
  }
  if (root.requestFullscreen) void root.requestFullscreen();
  else root.webkitRequestFullscreen?.();
}
