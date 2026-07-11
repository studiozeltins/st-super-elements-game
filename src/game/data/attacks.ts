import { ELEMENTS } from './elements';

// Static per-attack RENDER data keyed by attackId. The server ATTACKS registry
// (spacetimedb/src/attacks.ts) stays the source of truth for all timing/damage —
// unit_attack rows are denormalized from it; this mirror holds ONLY what the
// renderer needs: telegraph shape/orientation, stun window, and strike-juice
// color. Guarded by serverSync.test.ts parity (INV-5, D5-07 — a runtime import
// of the server module into the client bundle was explicitly rejected).

export interface AttackRenderSpec {
  shape: 'circle' | 'cone' | 'lane';
  /** Cone half-angle in degrees; parity-locked to the server coneMinDot via cos(). */
  coneHalfAngleDegrees?: number;
  /**
   * How long this attack's hit stuns the victim, in seconds; parity-locked to
   * the server stunTicks × the 150ms world tick (D4-09/D5-12). Drives the
   * client-side input-freeze window + STUNNED! popup duration — 0 means the
   * hit knocks back but must NOT freeze inputs or fire the popup.
   */
  stunSeconds: number;
  /**
   * Strike-juice tint (burst + shockwave particles) drawn from the ELEMENTS
   * palette. Pure client render data — attacks carry NO element on the server
   * yet (elemental combat is a deferred feature), so this is a per-attack
   * visual hint, not parity material. Telegraphs stay Frost cyan regardless.
   */
  juiceColor: number;
}

export const ATTACK_RENDER: Record<string, AttackRenderSpec> = {
  // Ground-shattering slam reads as geo/earth amber.
  leapSlam: { shape: 'circle', stunSeconds: 1.05, juiceColor: ELEMENTS.geo.color },
  // 60° half-angle = 120° full swing arc; cos 60° = 0.5 = server coneMinDot (D5-06).
  // Air-cutting arc reads as anemo teal.
  swordSwing: {
    shape: 'cone',
    coneHalfAngleDegrees: 60,
    stunSeconds: 0.6,
    juiceColor: ELEMENTS.anemo.color,
  },
  // Charged full-circle spin reads as electro violet — pops against the green terrain.
  swordSwirl: { shape: 'circle', stunSeconds: 0, juiceColor: ELEMENTS.electro.color },
  // Shield bash reads physical/cryo — icy-white pops without stealing the
  // telegraph cyan (D6-13 discretion; telegraphs stay Frost #86e2ff regardless).
  // stunSeconds parity-locked to server stunTicks 3 x 0.15s tick (D6-10).
  // Carries NO half-width field — DOCUMENTED DEVIATION from D6-13's letter
  // (RESEARCH Pitfall 6): the renderer reads row.radius, which is per-size
  // correct; a scalar mirror cannot parity-lock to the three-value server
  // radiusBySize array and would be dead data.
  shieldDash: { shape: 'lane', stunSeconds: 0.45, juiceColor: ELEMENTS.cryo.color },
};
