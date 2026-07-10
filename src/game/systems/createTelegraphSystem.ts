import * as THREE from 'three';
import { disposeObject } from '../engine/disposeObject';
import type { UnitAttack } from '../../module_bindings/types';

// Attack FSM states mirrored from spacetimedb/src/attacks.ts (u32 in the row).
const ATTACK_STATE_WINDUP = 1;
const ATTACK_STATE_STRIKE = 2;

// Frost icy-cyan (D4-14) — the telegraph must read as "danger, but ours".
const TELEGRAPH_COLOR = 0x86e2ff;
// Static outer ring thickness in world units: the constant danger edge. Must stay
// >= 0.2u so the ring survives the 440px internal pixel buffer at max pixelation
// (ANIM-02).
const RIM_WIDTH = 0.3;
// Expanding progress ring is slightly thinner so the danger edge stays dominant.
const PROGRESS_RIM_WIDTH = 0.22;
const RING_SEGMENTS = 48;
const OUTLINE_OPACITY = 0.85;
const PROGRESS_OPACITY = 0.6;
// Subtle Frost pulse on the static outer ring: opacity oscillates by this
// fraction of OUTLINE_OPACITY at PULSE_HZ. Flash always overrides the pulse.
const PULSE_DEPTH = 0.15;
const PULSE_HZ = 1.6;
// Rim flash at the strike transition: pop then decay back over this window.
const FLASH_SECONDS = 0.2;
const FLASH_SCALE = 1.08;
// Lift above the terrain so the flat geometry never z-fights the ground.
const GROUND_EPSILON = 0.06;
// Ground telegraphs must NEVER be hidden by raised voxel terrain: depth-test is
// off and a high renderOrder draws them after the world. Outer rim > progress
// ring so the danger edge always wins the overdraw (depth is ignored, draw
// order decides).
const PROGRESS_RENDER_ORDER = 999;
const OUTLINE_RENDER_ORDER = 1000;

interface ActiveTelegraph {
  unitKind: number;
  unitId: bigint;
  group: THREE.Group;
  outline: THREE.Mesh;
  outlineMaterial: THREE.MeshBasicMaterial;
  progress: THREE.Mesh;
  state: number;
  // ANIM-01 arrival anchor: progress is re-derived every frame from
  // (performance.now() - arrivalPerfMs) against the ROW's windup duration
  // (strikeAtMicros - startedAtMicros) — never a free-running client timer.
  arrivalPerfMs: number;
  startedAtMicros: bigint;
  windupDurationMicros: bigint;
  flashRemainingSeconds: number;
  // Row left WINDUP/STRIKE (recovery/idle): keep only until the flash decays.
  fading: boolean;
}

export interface TelegraphSystem {
  /** Reconciles ground telegraphs against unit_attack rows in WINDUP/STRIKE. */
  syncAttacks(
    rows: readonly UnitAttack[],
    isUnitAlive: (unitKind: number, unitId: bigint) => boolean
  ): void;
  update(deltaSeconds: number): void;
  /** Pops the outline rim (opacity + scale) for the given `${unitKind}:${unitId}`. */
  flashStrike(unitKey: string): void;
  dispose(): void;
}

function flatMaterial(opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: TELEGRAPH_COLOR,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: false,
    // Additive = cheap icy glow against Mondstadt-green terrain (Frost language).
    blending: THREE.AdditiveBlending,
  });
}

export function createTelegraphSystem(
  scene: THREE.Scene,
  getGroundHeight: (x: number, z: number) => number
): TelegraphSystem {
  const telegraphs = new Map<string, ActiveTelegraph>();
  // Shared clock for the outer-ring pulse (cosmetic only — never drives timing).
  let pulseElapsedSeconds = 0;

  function insert(row: UnitAttack): ActiveTelegraph {
    const group = new THREE.Group();
    // Static full-radius outer ring appears instantly at windup entry (D4-14):
    // the constant danger edge.
    const outlineMaterial = flatMaterial(OUTLINE_OPACITY);
    const outline = new THREE.Mesh(
      new THREE.RingGeometry(row.radius - RIM_WIDTH, row.radius, RING_SEGMENTS),
      outlineMaterial
    );
    outline.rotation.x = -Math.PI / 2;
    outline.position.y = 0.005;
    outline.renderOrder = OUTLINE_RENDER_ORDER;
    // Progress ring: built at FULL radius and scaled 0 → 1 over the windup, so
    // it expands from the center and meets the outer ring exactly at strike.
    // Its expansion IS the countdown.
    const progress = new THREE.Mesh(
      new THREE.RingGeometry(
        Math.max(0.001, row.radius - PROGRESS_RIM_WIDTH),
        row.radius,
        RING_SEGMENTS
      ),
      flatMaterial(PROGRESS_OPACITY)
    );
    progress.rotation.x = -Math.PI / 2;
    progress.renderOrder = PROGRESS_RENDER_ORDER;
    progress.scale.setScalar(0.0001); // starts empty; never exactly 0 (degenerate matrix)
    group.add(outline, progress);
    // The landing is LOCKED at windup entry — position once, on the terrain.
    group.position.set(
      row.landingX,
      getGroundHeight(row.landingX, row.landingZ) + GROUND_EPSILON,
      row.landingZ
    );
    scene.add(group);
    const telegraph: ActiveTelegraph = {
      unitKind: row.unitKind,
      unitId: row.unitId,
      group,
      outline,
      outlineMaterial,
      progress,
      state: row.state,
      arrivalPerfMs: performance.now(),
      startedAtMicros: row.startedAtMicros,
      windupDurationMicros: row.strikeAtMicros - row.startedAtMicros,
      flashRemainingSeconds: 0,
      fading: false,
    };
    // Arrived already mid-strike (late join): show it landed, flash immediately.
    if (row.state === ATTACK_STATE_STRIKE) flash(telegraph);
    return telegraph;
  }

  function flash(telegraph: ActiveTelegraph) {
    telegraph.flashRemainingSeconds = FLASH_SECONDS;
    telegraph.outlineMaterial.opacity = 1;
    telegraph.outline.scale.setScalar(FLASH_SCALE);
  }

  function remove(key: string, telegraph: ActiveTelegraph) {
    scene.remove(telegraph.group);
    disposeObject(telegraph.group);
    telegraphs.delete(key);
  }

  function progressFraction(telegraph: ActiveTelegraph): number {
    const duration = Number(telegraph.windupDurationMicros);
    if (duration <= 0) return 1;
    // Re-derive from the row's server duration with the arrival-captured offset
    // (ANIM-01): elapsed micros since the row arrived over windup micros.
    const elapsedMicros = (performance.now() - telegraph.arrivalPerfMs) * 1000;
    return THREE.MathUtils.clamp(elapsedMicros / duration, 0, 1);
  }

  function syncAttacks(
    rows: readonly UnitAttack[],
    isUnitAlive: (unitKind: number, unitId: bigint) => boolean
  ) {
    const seen = new Set<string>();
    for (const row of rows) {
      if (row.state !== ATTACK_STATE_WINDUP && row.state !== ATTACK_STATE_STRIKE) continue;
      if (!isUnitAlive(row.unitKind, row.unitId)) continue;
      const key = `${row.unitKind}:${row.unitId}`;
      seen.add(key);
      const existing = telegraphs.get(key);
      if (!existing) {
        telegraphs.set(key, insert(row));
        continue;
      }
      // A fresh cast (new startedAt) re-anchors timing and re-locks the landing.
      if (row.state === ATTACK_STATE_WINDUP && row.startedAtMicros !== existing.startedAtMicros) {
        existing.arrivalPerfMs = performance.now();
        existing.startedAtMicros = row.startedAtMicros;
        existing.windupDurationMicros = row.strikeAtMicros - row.startedAtMicros;
        existing.group.position.set(
          row.landingX,
          getGroundHeight(row.landingX, row.landingZ) + GROUND_EPSILON,
          row.landingZ
        );
      }
      if (existing.state === ATTACK_STATE_WINDUP && row.state === ATTACK_STATE_STRIKE) {
        flash(existing);
      }
      existing.state = row.state;
      existing.fading = false;
    }
    for (const [key, telegraph] of telegraphs) {
      if (seen.has(key)) continue;
      // No telegraph outlives its goliath: dead/missing unit → gone immediately.
      if (!isUnitAlive(telegraph.unitKind, telegraph.unitId)) {
        remove(key, telegraph);
        continue;
      }
      // Left strike (recovery/idle): linger only while the rim flash decays.
      if (telegraph.flashRemainingSeconds > 0) telegraph.fading = true;
      else remove(key, telegraph);
    }
  }

  function update(deltaSeconds: number) {
    pulseElapsedSeconds += deltaSeconds;
    const pulse =
      1 - PULSE_DEPTH * (0.5 + 0.5 * Math.sin(pulseElapsedSeconds * PULSE_HZ * Math.PI * 2));
    for (const [key, telegraph] of telegraphs) {
      // Progress ring: expands during windup; locked on the danger edge after.
      telegraph.progress.scale.setScalar(
        telegraph.state === ATTACK_STATE_WINDUP
          ? Math.max(0.0001, progressFraction(telegraph))
          : 1
      );
      if (telegraph.flashRemainingSeconds > 0) {
        telegraph.flashRemainingSeconds -= deltaSeconds;
        const decay = THREE.MathUtils.clamp(telegraph.flashRemainingSeconds / FLASH_SECONDS, 0, 1);
        telegraph.outlineMaterial.opacity = OUTLINE_OPACITY + (1 - OUTLINE_OPACITY) * decay;
        telegraph.outline.scale.setScalar(1 + (FLASH_SCALE - 1) * decay);
        if (telegraph.flashRemainingSeconds <= 0 && telegraph.fading) remove(key, telegraph);
      } else {
        telegraph.outlineMaterial.opacity = OUTLINE_OPACITY * pulse;
      }
    }
  }

  return {
    syncAttacks,
    update,
    flashStrike(unitKey) {
      const telegraph = telegraphs.get(unitKey);
      if (telegraph) flash(telegraph);
    },
    dispose() {
      for (const [key, telegraph] of telegraphs) remove(key, telegraph);
    },
  };
}
