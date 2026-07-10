// Static per-attack RENDER data keyed by attackId. The server ATTACKS registry
// (spacetimedb/src/attacks.ts) stays the source of truth for all timing/damage —
// unit_attack rows are denormalized from it; this mirror holds ONLY what the
// renderer needs to pick a telegraph shape/orientation. Guarded by
// serverSync.test.ts parity (INV-5, D5-07 — a runtime import of the server
// module into the client bundle was explicitly rejected).

export interface AttackRenderSpec {
  shape: 'circle' | 'cone';
  /** Cone half-angle in degrees; parity-locked to the server coneMinDot via cos(). */
  coneHalfAngleDegrees?: number;
  /**
   * How long this attack's hit stuns the victim, in seconds; parity-locked to
   * the server stunTicks × the 150ms world tick (D4-09/D5-12). Drives the
   * client-side input-freeze window + STUNNED! popup duration — 0 means the
   * hit knocks back but must NOT freeze inputs or fire the popup.
   */
  stunSeconds: number;
}

export const ATTACK_RENDER: Record<string, AttackRenderSpec> = {
  leapSlam: { shape: 'circle', stunSeconds: 1.05 },
  // 60° half-angle = 120° full swing arc; cos 60° = 0.5 = server coneMinDot (D5-06).
  swordSwing: { shape: 'cone', coneHalfAngleDegrees: 60, stunSeconds: 0.6 },
  swordSwirl: { shape: 'circle', stunSeconds: 0 },
};
