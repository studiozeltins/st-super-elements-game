/**
 * SPIKE-04 de-risk section — proves the two no-native-API asks with a real
 * technique on-screen, behind `?derisk=1` so it never affects the plain
 * perceptual/perf runs.
 *
 * The two asks and the techniques that stand in for missing native APIs:
 *
 *  1. "Lit / emissive water" — Water Pro has NO emissiveNode. Lit look =
 *     sparkle + SSS + lifted intrinsic waterColor + bloom (bloom is added to
 *     the post chain by the caller). Localized GLOW = an ADDITIVE transparent
 *     overlay mesh riding just above the surface (REAC-03/04 precursor), not a
 *     water-material emissive term.
 *
 *  2. "Projectile reactivity" — skim wake + impact spray. Wake is driven by
 *     HORIZONTAL motion only (Pitfall 4: a vertical-only mover leaves no wake),
 *     from a FIXED pool of <=16 generators reused via updateGenerator — never
 *     add/remove per projectile (REAC-01). Vertical impacts use
 *     `water.spray?.addEmitter`, optional-chained because `water.spray` is null
 *     on the WebGL2 fallback and must not crash it.
 *
 * Isolated throwaway spike glue: imports only the vendored Water Pro type and
 * three; nothing in src/game imports back.
 */
import * as THREE from "three/webgpu";
import type { WaterSystem } from "../vendor/threejs-water-pro";

/** True when the spike was launched with `?derisk=1`. */
export function isDeriskEnabled(): boolean {
  return /[?&]derisk=1(?:&|$)/.test(window.location.search);
}

/** Fixed wake-generator pool size. MUST stay <= 16 (REAC-01 invariant). */
const WAKE_POOL_SIZE = 8;

export interface DeriskOptions {
  scene: THREE.Scene;
  water: WaterSystem;
  /** World Y of the Water Pro ocean plane (waterline = 0 in the spike frame). */
  seaLevelY: number;
  /** Centre of the beach region to stage the de-risk props near. */
  centerX: number;
  centerZ: number;
}

export interface DeriskHandle {
  /** Call once per frame with accumulated elapsed seconds. */
  update(elapsed: number): void;
  dispose(): void;
}

/**
 * Install the SPIKE-04 de-risk section into an already-built Water Pro scene.
 * Returns a handle whose `update(elapsed)` must be called each frame.
 */
export function installDerisk(opts: DeriskOptions): DeriskHandle {
  const { scene, water, seaLevelY, centerX, centerZ } = opts;

  // --- (1) Lit water: sparkle / SSS / lifted intrinsic colour. Bloom is added
  //     to the post chain by the caller (gated on the same ?derisk=1). ---
  water.sparkle.intensity = 0.9;
  water.sss.intensity = 1.6;
  water.color.waterColor = new THREE.Color("#124973");

  // --- (2) Additive emissive GLOW overlay. No emissiveNode on Water Pro, so a
  //     localized "lit" patch is a transparent additive mesh riding the surface. ---
  const glowGeo = new THREE.PlaneGeometry(10, 10);
  glowGeo.rotateX(-Math.PI / 2);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0x66ccff,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.6,
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.position.set(centerX, seaLevelY + 0.02, centerZ);
  scene.add(glow);

  // --- (3) Pooled projectile wake. Each proxy is registered ONCE; the pool is
  //     reused forever. Proxies skim HORIZONTALLY low over the sea each frame. ---
  const wakeProxies: THREE.Object3D[] = [];
  const wakeIds: number[] = [];
  for (let i = 0; i < WAKE_POOL_SIZE; i++) {
    const proxy = new THREE.Object3D();
    proxy.position.set(centerX, seaLevelY + 0.1, centerZ);
    scene.add(proxy);
    wakeProxies.push(proxy);
    wakeIds.push(
      water.wake.addGenerator(proxy, {
        depth: 0.6,
        radius: 2.0,
        teleportThreshold: 8.0,
        active: true,
      }),
    );
  }

  // --- (4) Vertical impact spray. Optional-chained — null on WebGL2, and the
  //     fallback must not crash. One proxy bobs through the surface; its base
  //     probe fires on each down-crossing. ---
  const sprayProxy = new THREE.Object3D();
  sprayProxy.position.set(centerX + 14, seaLevelY + 2, centerZ);
  scene.add(sprayProxy);
  water.spray?.addEmitter(sprayProxy, {
    probes: [{ local: new THREE.Vector3(0, 0, 0) }],
    velocityThreshold: 1.0,
  });

  function update(elapsed: number): void {
    // Pulse the glow so it reads as an active emissive patch, not a flat decal.
    glowMat.opacity = 0.45 + 0.2 * (0.5 + 0.5 * Math.sin(elapsed * 2.0));

    // Skim each wake proxy in a phase-offset horizontal circle low over the sea.
    // Horizontal motion is what injects wake (Pitfall 4); keep every proxy active.
    for (let i = 0; i < WAKE_POOL_SIZE; i++) {
      const phase = elapsed * 0.8 + (i / WAKE_POOL_SIZE) * Math.PI * 2;
      const r = 8 + i * 0.6;
      const proxy = wakeProxies[i];
      proxy.position.set(
        centerX + Math.cos(phase) * r,
        seaLevelY + 0.1,
        centerZ + Math.sin(phase) * r,
      );
      proxy.updateMatrixWorld();
      water.wake.updateGenerator(wakeIds[i], { active: true });
    }

    // Bob the spray proxy vertically through the surface for repeated impacts.
    sprayProxy.position.y = seaLevelY + Math.sin(elapsed * 1.5) * 1.6;
    sprayProxy.updateMatrixWorld();
  }

  function dispose(): void {
    for (const id of wakeIds) water.wake.removeGenerator(id);
    scene.remove(glow);
    glowGeo.dispose();
    glowMat.dispose();
  }

  return { update, dispose };
}
