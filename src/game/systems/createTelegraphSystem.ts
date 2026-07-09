import * as THREE from 'three';
import { disposeObject } from '../engine/disposeObject';
import type { UnitAttack } from '../../module_bindings/types';

// Attack FSM states mirrored from spacetimedb/src/attacks.ts (u32 in the row).
const ATTACK_STATE_WINDUP = 1;
const ATTACK_STATE_STRIKE = 2;

// Frost icy-cyan (D4-14) — the telegraph must read as "danger, but ours".
const TELEGRAPH_COLOR = 0x86e2ff;
// Outline rim thickness in world units. Must stay >= 0.2u so the ring survives
// the 440px internal pixel buffer at max pixelation (ANIM-02).
const RIM_WIDTH = 0.25;
const RING_SEGMENTS = 48;
const OUTLINE_OPACITY = 0.85;
const FILL_OPACITY = 0.3;
// Rim flash at the strike transition: pop then decay back over this window.
const FLASH_SECONDS = 0.2;
const FLASH_SCALE = 1.08;
// Lift above the terrain so the flat geometry never z-fights the ground.
const GROUND_EPSILON = 0.06;

interface ActiveTelegraph {
  unitKind: number;
  unitId: bigint;
  group: THREE.Group;
  outline: THREE.Mesh;
  outlineMaterial: THREE.MeshBasicMaterial;
  fill: THREE.Mesh;
  state: number;
  // ANIM-01 arrival anchor: fill progress is re-derived every frame from
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
  });
}

export function createTelegraphSystem(
  scene: THREE.Scene,
  getGroundHeight: (x: number, z: number) => number
): TelegraphSystem {
  const telegraphs = new Map<string, ActiveTelegraph>();

  function insert(row: UnitAttack): ActiveTelegraph {
    const group = new THREE.Group();
    // Full-radius outline appears instantly at windup entry (D4-14).
    const outlineMaterial = flatMaterial(OUTLINE_OPACITY);
    const outline = new THREE.Mesh(
      new THREE.RingGeometry(row.radius - RIM_WIDTH, row.radius, RING_SEGMENTS),
      outlineMaterial
    );
    outline.rotation.x = -Math.PI / 2;
    outline.position.y = 0.005; // above the fill so the rim always wins the overdraw
    // Inner disc whose outward fill IS the countdown.
    const fill = new THREE.Mesh(
      new THREE.CircleGeometry(row.radius, RING_SEGMENTS),
      flatMaterial(FILL_OPACITY)
    );
    fill.rotation.x = -Math.PI / 2;
    fill.scale.setScalar(0.0001); // starts empty; never exactly 0 (degenerate matrix)
    group.add(outline, fill);
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
      fill,
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

  function fillFraction(telegraph: ActiveTelegraph): number {
    const duration = Number(telegraph.windupDurationMicros);
    if (duration <= 0) return 1;
    // Re-derive from the row's server duration with the arrival-captured offset
    // (ANIM-01): elapsed micros since the row arrived over windup micros.
    const elapsedMicros = BigInt(
      Math.round((performance.now() - telegraph.arrivalPerfMs) * 1000)
    );
    return THREE.MathUtils.clamp(Number(elapsedMicros) / duration, 0, 1);
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
    for (const [key, telegraph] of telegraphs) {
      if (telegraph.state === ATTACK_STATE_WINDUP && telegraph.flashRemainingSeconds <= 0) {
        telegraph.fill.scale.setScalar(Math.max(0.0001, fillFraction(telegraph)));
      }
      if (telegraph.flashRemainingSeconds > 0) {
        telegraph.flashRemainingSeconds -= deltaSeconds;
        const decay = THREE.MathUtils.clamp(telegraph.flashRemainingSeconds / FLASH_SECONDS, 0, 1);
        telegraph.outlineMaterial.opacity = OUTLINE_OPACITY + (1 - OUTLINE_OPACITY) * decay;
        telegraph.outline.scale.setScalar(1 + (FLASH_SCALE - 1) * decay);
        if (telegraph.flashRemainingSeconds <= 0 && telegraph.fading) remove(key, telegraph);
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
