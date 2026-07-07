// Single source of truth for the health-bar fill color, shared by every HP bar
// (party sheet, party frames, player sheet). Green when healthy, amber mid, red low.
export function hpFillColor(pct: number): string {
  if (pct > 50) return 'var(--hp-ok, #4ade80)';
  if (pct > 20) return 'var(--hp-warn, #facc15)';
  return 'var(--hp-low, #ef4444)';
}
