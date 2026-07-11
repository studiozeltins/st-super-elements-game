import * as THREE from 'three';
import { ATTACK_RENDER } from '../data/attacks';
import { disposeObject } from '../engine/disposeObject';
import type { UnitAttack } from '../../module_bindings/types';
import {
  RIM_WIDTH,
  PROGRESS_RIM_WIDTH,
  CONE_FILL_RINGS,
  flatRing,
  buildLaneOutline,
} from './telegraphShapes';

// Attack FSM states mirrored from spacetimedb/src/attacks.ts (u32 in the row).
const ATTACK_STATE_WINDUP = 1;
const ATTACK_STATE_STRIKE = 2;

// Frost icy-cyan (D4-14) — the telegraph must read as "danger, but ours".
const TELEGRAPH_COLOR = 0x86e2ff;
// RIM_WIDTH / PROGRESS_RIM_WIDTH / CONE_FILL_RINGS + the shape builders live in
// ./telegraphShapes (carved out with the lane branch to hold the ≤300 LOC ceiling).
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

interface ActiveTelegraph {
  unitKind: number;
  unitId: bigint;
  // Which attack this geometry was built for: a chain swap arrives on the SAME
  // unit key with a different attackId — the mesh must be rebuilt, not re-anchored.
  attackId: string;
  group: THREE.Group;
  outline: THREE.Mesh;
  outlineMaterial: THREE.MeshBasicMaterial;
  progress: THREE.Mesh;
  // Windup-fill scale strategy, chosen at insert time so update() never does a
  // per-frame shape lookup (T-06-05): 'uniform' expands XZ together (circle/cone
  // grow from their anchor); 'x' sweeps ONLY along the lane axis so a lane fill
  // runs cast->end at constant width (RESEARCH Pitfall 3).
  fillAxis: 'uniform' | 'x';
  state: number;
  // ANIM-01 arrival anchor: progress is re-derived every frame from
  // (performance.now() - arrivalPerfMs) against the ROW's windup duration
  // (strikeAtMicros - startedAtMicros) — never a free-running client timer.
  arrivalPerfMs: number;
  startedAtMicros: bigint;
  windupDurationMicros: bigint;
  // Last progress scale the drape ran at — skips per-vertex ground sampling on
  // frames where the ring didn't move (locked at 1 after strike).
  lastProgressScale: number;
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

// Depth-test stays ON so units walking over the telegraph draw on top of it
// (they wrote depth in the opaque pass). Raised terrain can't bury it either:
// the geometry is DRAPED per-vertex onto the ground (see drapeToGround).
function flatMaterial(opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: TELEGRAPH_COLOR,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
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
  const drapePoint = new THREE.Vector3();

  // Conforms a flat XZ ring to the terrain: each vertex's world (x, z) is
  // sampled against the ground and its local y set so the surface floats
  // GROUND_EPSILON above the terrain everywhere — terraced hills can never
  // bury the telegraph even with depth-testing on.
  function drapeToGround(mesh: THREE.Mesh, group: THREE.Group) {
    mesh.updateWorldMatrix(true, false);
    const positions = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < positions.count; i++) {
      drapePoint.set(positions.getX(i), 0, positions.getZ(i)).applyMatrix4(mesh.matrixWorld);
      positions.setY(
        i,
        getGroundHeight(drapePoint.x, drapePoint.z) + GROUND_EPSILON - group.position.y
      );
    }
    positions.needsUpdate = true;
  }

  // Anchors the group: circles sit on the LOCKED landing; cone sectors sit at the
  // cast APEX yawed toward the aim (D5-14). Both are locked at windup entry (D5-05)
  // — the telegraph never re-aims mid-windup.
  function anchorGroup(group: THREE.Group, row: UnitAttack) {
    const shape = ATTACK_RENDER[row.attackId]?.shape;
    if (shape === 'cone' || shape === 'lane') {
      // Cone sectors AND lane rectangles anchor at the CAST end, yawed toward the
      // aim. After the geometry's baked -PI/2 X-rotation, local +X maps to world
      // +X, so yawing by atan2(-aimZ, aimX) points the shape (the cone θ=0 axis /
      // the lane's +X length axis) at the aim. Sign convention is DERIVED
      // (RESEARCH A1, MEDIUM confidence) — the pixel-filter visual check is owned
      // by plan 05-05; a flip is a one-line sign fix.
      group.rotation.y = Math.atan2(-(row.landingZ - row.castZ), row.landingX - row.castX);
      group.position.set(row.castX, getGroundHeight(row.castX, row.castZ) + GROUND_EPSILON, row.castZ);
      return;
    }
    group.rotation.y = 0;
    group.position.set(
      row.landingX,
      getGroundHeight(row.landingX, row.landingZ) + GROUND_EPSILON,
      row.landingZ
    );
  }

  function insert(row: UnitAttack): ActiveTelegraph {
    const group = new THREE.Group();
    // Static full-radius outer ring appears instantly at windup entry (D4-14):
    // the constant danger edge.
    const outlineMaterial = flatMaterial(OUTLINE_OPACITY);
    // Shape lookup by attackId; unknown/missing entry → circle (back-compat with
    // rows written before the client updated).
    const render = ATTACK_RENDER[row.attackId];
    let outline: THREE.Mesh;
    let progress: THREE.Mesh;
    let fillAxis: 'uniform' | 'x' = 'uniform';
    if (render?.shape === 'lane') {
      // Lane RECTANGLE (D6-11): the charge path. Geometry derives ENTIRELY from
      // the row — length = |landing - cast|, width = row.radius * 2. row.radius IS
      // the per-size half-width written by enterWindup; there is deliberately NO
      // client mirror half-width field (a scalar cannot parity-lock to the
      // three-value server radiusBySize array and would be dead data — the
      // documented D6-13 deviation, RESEARCH Pitfall 6). Local axes (authored in
      // the XZ plane so the shared drape samples ground per vertex): +X along the
      // lane, Z across the width; anchorGroup yaws +X toward the aim.
      const length = Math.hypot(row.landingX - row.castX, row.landingZ - row.castZ);
      const halfWidth = row.radius;
      // Instant full-lane outline: a single draped mesh tracing the rectangle
      // perimeter in the shared RIM_WIDTH / outlineMaterial (D4-14 Frost reuse).
      outline = new THREE.Mesh(buildLaneOutline(length, halfWidth), outlineMaterial);
      // Fill: ONE plane inset by PROGRESS_RIM_WIDTH across the width, its origin at
      // the CAST end (translate +length/2) so scaling X sweeps cast -> lane end.
      const fillWidth = Math.max(0.001, halfWidth * 2 - 2 * PROGRESS_RIM_WIDTH);
      const fillGeometry = new THREE.PlaneGeometry(
        length,
        fillWidth,
        Math.max(1, Math.round(length)),
        1
      );
      fillGeometry.rotateX(-Math.PI / 2);
      fillGeometry.translate(length / 2, 0, 0);
      progress = new THREE.Mesh(fillGeometry, flatMaterial(PROGRESS_OPACITY));
      // Lane fill scales ONLY along the lane axis (width constant); update() reads
      // this to avoid a growing wedge (RESEARCH Pitfall 3).
      fillAxis = 'x';
    } else if (render?.shape === 'cone' && render.coneHalfAngleDegrees !== undefined) {
      // Cone SECTOR (D5-14): row.radius is reused as cone RANGE (D5-06). The
      // sector is authored centered on geometry angle 0; anchorGroup yaws it.
      const fullAngle = THREE.MathUtils.degToRad(render.coneHalfAngleDegrees * 2);
      // Arc rim at the danger edge — instant at windup entry, like the circle rim.
      outline = new THREE.Mesh(
        flatRing(row.radius - RIM_WIDTH, row.radius, 1, -fullAngle / 2, fullAngle),
        outlineMaterial
      );
      // Progress: FILLED sector built at full size — the shared update() scaling
      // expands it from the apex for free because the group origin IS the apex.
      progress = new THREE.Mesh(
        flatRing(0.001, row.radius, CONE_FILL_RINGS, -fullAngle / 2, fullAngle),
        flatMaterial(PROGRESS_OPACITY)
      );
    } else {
      outline = new THREE.Mesh(flatRing(row.radius - RIM_WIDTH, row.radius), outlineMaterial);
      // Progress ring: built at FULL radius and scaled 0 → 1 over the windup, so
      // it expands from the center and meets the outer ring exactly at strike.
      // Its expansion IS the countdown.
      progress = new THREE.Mesh(
        flatRing(Math.max(0.001, row.radius - PROGRESS_RIM_WIDTH), row.radius),
        flatMaterial(PROGRESS_OPACITY)
      );
    }
    outline.position.y = 0.005;
    // Draping shifts vertex heights after the bounding sphere was computed —
    // skip frustum culling rather than recomputing bounds every re-drape.
    outline.frustumCulled = false;
    progress.frustumCulled = false;
    // Scale only XZ (never Y): draped vertex heights are authored in local
    // space and must not stretch with the countdown expansion. Start the fill
    // empty (never exactly 0 — a degenerate matrix). Lanes keep full width
    // (z = 1) and grow only along the lane axis; circle/cone start near-zero on
    // both XZ so they expand uniformly from their anchor.
    if (fillAxis === 'x') progress.scale.set(0.0001, 1, 1);
    else progress.scale.set(0.0001, 1, 0.0001);
    group.add(outline, progress);
    anchorGroup(group, row);
    scene.add(group);
    drapeToGround(outline, group);
    const telegraph: ActiveTelegraph = {
      unitKind: row.unitKind,
      unitId: row.unitId,
      attackId: row.attackId,
      group,
      outline,
      outlineMaterial,
      progress,
      fillAxis,
      state: row.state,
      arrivalPerfMs: performance.now(),
      startedAtMicros: row.startedAtMicros,
      windupDurationMicros: row.strikeAtMicros - row.startedAtMicros,
      lastProgressScale: -1,
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
    telegraph.outline.scale.set(FLASH_SCALE, 1, FLASH_SCALE);
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
      // Chain swap: a different attack arrived on the SAME key — the old mesh
      // (wrong shape/size/yaw) must never linger through the new windup. A lane
      // re-cast (same attack, fresh startedAtMicros) ALSO rebuilds instead of
      // re-anchoring: a lane bakes |landing - cast| into its geometry, and
      // clampToWorld can shorten a world-edge lane between casts (RESEARCH
      // Pitfall 4), so a re-anchor would leave a stale-length rectangle.
      // Circle/cone geometry depends only on row.radius (constant across re-casts)
      // and takes the cheap re-anchor path below.
      const laneRecast =
        ATTACK_RENDER[row.attackId]?.shape === 'lane' &&
        row.state === ATTACK_STATE_WINDUP &&
        row.startedAtMicros !== existing.startedAtMicros;
      if (row.attackId !== existing.attackId || laneRecast) {
        remove(key, existing);
        telegraphs.set(key, insert(row));
        continue;
      }
      // A same-attack re-cast (new startedAt) re-anchors timing and placement.
      if (row.state === ATTACK_STATE_WINDUP && row.startedAtMicros !== existing.startedAtMicros) {
        existing.arrivalPerfMs = performance.now();
        existing.startedAtMicros = row.startedAtMicros;
        existing.windupDurationMicros = row.strikeAtMicros - row.startedAtMicros;
        anchorGroup(existing.group, row);
        // Moved to new ground — heights baked into the vertices are stale.
        drapeToGround(existing.outline, existing.group);
        existing.lastProgressScale = -1;
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
      const progressScale =
        telegraph.state === ATTACK_STATE_WINDUP
          ? Math.max(0.0001, progressFraction(telegraph))
          : 1;
      if (progressScale !== telegraph.lastProgressScale) {
        // fillAxis stored at insert time keeps this the ONE progress-scaling site
        // with zero per-frame shape lookups (T-06-05): lanes sweep only the lane
        // axis (width constant, RESEARCH Pitfall 3); circle/cone expand uniformly
        // across XZ from their anchor. Fraction stays row-derived (ANIM-01).
        if (telegraph.fillAxis === 'x') telegraph.progress.scale.set(progressScale, 1, 1);
        else telegraph.progress.scale.set(progressScale, 1, progressScale);
        // The fill covers different ground at the new size — re-drape.
        drapeToGround(telegraph.progress, telegraph.group);
        telegraph.lastProgressScale = progressScale;
      }
      if (telegraph.flashRemainingSeconds > 0) {
        telegraph.flashRemainingSeconds -= deltaSeconds;
        const decay = THREE.MathUtils.clamp(telegraph.flashRemainingSeconds / FLASH_SECONDS, 0, 1);
        telegraph.outlineMaterial.opacity = OUTLINE_OPACITY + (1 - OUTLINE_OPACITY) * decay;
        const flashScale = 1 + (FLASH_SCALE - 1) * decay;
        telegraph.outline.scale.set(flashScale, 1, flashScale);
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
