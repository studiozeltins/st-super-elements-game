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
}

export const ATTACK_RENDER: Record<string, AttackRenderSpec> = {
  leapSlam: { shape: 'circle' },
  // 60° half-angle = 120° full swing arc; cos 60° = 0.5 = server coneMinDot (D5-06).
  swordSwing: { shape: 'cone', coneHalfAngleDegrees: 60 },
  swordSwirl: { shape: 'circle' },
};
