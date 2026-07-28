/**
 * TRACER — thinnest end-to-end WebGPU + Water Pro + Sky Pro + pixel-node path,
 * rendered over a getTerrainHeight-sampled beach slice at the game's tilted
 * top-down camera (SPIKE-01). This is a STANDALONE, throwaway spike entry
 * (waterpro-spike.html) — it imports the game's PURE terrain height fn (read,
 * never mutated) but nothing in src/game imports back, so "zero game code
 * touched" holds. Plan 02 expands: both pixel shapes, sun-rim outline, perf HUD,
 * lit-water + wake/spray de-risk. Here we only prove the chain boots and report
 * which backend resolved.
 *
 * Recipe followed verbatim from
 *   pro/Three.js Water Pro v3.2.1/.../docs/guide/sky-pro-integration.md
 * adapting only the camera (game 45deg tilt, extended far) and appending the
 * pixel node LAST.
 */
import * as THREE from "three/webgpu";
import type { Node } from "three/webgpu";
import { pass } from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { WaterSystem, getPresetParams } from "../vendor/threejs-water-pro";
import { SkySystem, PRESETS } from "../vendor/threejs-sky-pro";
import { ISLANDS } from "../game/world/terrain";
import { pixelFilterNode } from "../game/engine/tsl/pixelFilterNode";
import { setOutlineSunDir } from "../game/engine/tsl/outlineNode";
import { buildBeachSlice } from "./beachSlice";
import { createPerfHud, forceWebGLRequested } from "./perfHud";
import { isDeriskEnabled, installDerisk } from "./derisk";

/**
 * `?tone=neutral|none` swaps ACES filmic tone mapping for neutral, so the
 * side-by-side can judge whether ACES clashes with the flat pixel-art palette
 * (RESEARCH open question 2 / Pitfall 5). Default keeps ACES (Water Pro default).
 */
function toneMappingFromQuery(): THREE.ToneMapping {
  const neutral = /tone=(neutral|none|off)/.test(window.location.search);
  return neutral ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
}

/**
 * Project the sun's world position to screen space and return the normalized
 * screen-space direction toward it — feeds the one-sided rim (like the game's
 * setEdgeSunDir). The rim lands only on the sun-facing side of each silhouette.
 */
function sunScreenDir(
  sunWorld: THREE.Vector3,
  camera: THREE.PerspectiveCamera,
  out: THREE.Vector2,
): THREE.Vector2 {
  const ndc = sunWorld.clone().project(camera); // -> NDC (x,y in [-1,1])
  out.set(ndc.x, ndc.y);
  if (out.lengthSq() < 1e-8) out.set(0, 1);
  return out.normalize();
}

// The game's top-down camera: 45deg FOV, offset+tilt from createGame.ts
// (CAMERA_OFFSET = (7,15,11), lookAt target). far extended 500 -> 20000 so the
// Pro ocean/sky do not clip at the small game scale (RESEARCH Pitfall 1).
const CAMERA_OFFSET = new THREE.Vector3(7, 15, 11);
const CAMERA_FRAMING = 4; // pull back along the same tilt to frame the slice
const CAMERA_FAR = 20000;

// Beach slice framing: the ONLY beach arc is the city island (ISLANDS[0]), -x.
const CITY = ISLANDS[0];
const BEACH_X = CITY.centerX + Math.cos(CITY.beachDir) * CITY.radius; // ~ -54
const BEACH_Z = CITY.centerZ + Math.sin(CITY.beachDir) * CITY.radius; // ~ 0

async function main(): Promise<void> {
  // --- renderer (auto WebGL2 fallback; read backend ONLY after init) ---
  // `?forceWebGL=1` forces the WebGL2 path so a second headed run measures the
  // fallback tier's FPS with the same on-screen instrument (SPIKE-03).
  const forcedWebGL = forceWebGLRequested();
  const renderer = new THREE.WebGPURenderer(
    forcedWebGL ? { forceWebGL: true } : undefined,
  );
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
  renderer.toneMapping = toneMappingFromQuery();
  document.body.appendChild(renderer.domElement);
  await renderer.init();

  // --- scene + game-tilt camera ---
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    CAMERA_FAR,
  );
  const target = new THREE.Vector3(BEACH_X, 0, BEACH_Z);
  camera.position.copy(target).addScaledVector(CAMERA_OFFSET, CAMERA_FRAMING);
  camera.lookAt(target.x, target.y + 1, target.z);

  // Lights for the plain-material beach (Water/Sky light themselves).
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(-40, 60, 30);
  scene.add(sun);

  scene.add(buildBeachSlice());

  // --- Water Pro (FFT ocean on WebGPU, RTT on WebGL2) ---
  const water = await WaterSystem.create(renderer, scene, camera, "medium");
  water.loadPreset(getPresetParams("blackFlag"));

  // --- Sky Pro (atmosphere/clouds/sun; drives water lighting) ---
  // STCK-02 FLAG (build-output smoke, plan 03 Task 3): Sky Pro loads its
  // cloud-noise volumes with `new URL("./data/" + name + ".bin", import.meta.url)`
  // — a DYNAMICALLY-constructed URL Vite's static asset analyzer cannot see, so a
  // real `vite build` emits NO `data/` dir. In the built dist/ the spike chunk is
  // `dist/assets/spike-<hash>.js`, so those loads resolve to
  //   /assets/data/baseShape{16,32,64}.bin  → 404 (files absent).
  // Dev works (served from src/vendor/); the BUILT page's clouds break/black-sky.
  // Fix deferred to Phase 5 (STCK-02 hardening): an inline Vite plugin that copies
  // src/vendor/threejs-sky-pro/data/*.bin into dist/assets/data/. Do NOT over-build
  // it here — this is a recorded flag, not a blocker for the spike's go/no-go.
  const sky = await SkySystem.create({
    renderer,
    camera,
    scene,
    quality: "medium",
  });
  await sky.applyPreset(PRESETS.partlyCloudy);
  // ONE-CALL sky->water coupling; build the provider exactly once.
  water.setSky(sky.createSkyProvider({ envMap: true }));

  // --- SPIKE-04 de-risk (behind ?derisk=1): lit-water params + additive glow
  //     overlay + pooled wake + optional-chained spray. Installed BEFORE
  //     compileAsync so its meshes/generators are compiled with the scene. ---
  const derisk = isDeriskEnabled();
  const deriskHandle = derisk
    ? installDerisk({
        scene,
        water,
        seaLevelY: 0, // beachSlice shifts the terrain so the waterline is y=0
        centerX: BEACH_X,
        centerZ: BEACH_Z,
      })
    : null;

  // --- post chain: water fx -> sky composite -> (bloom) -> pixel node LAST ---
  const postProcessing = new THREE.PostProcessing(renderer);
  const scenePass = pass(water.scene, water.camera);
  let out: Node = scenePass.getTextureNode("output");
  out = water.postProcessing.buildNode(scenePass, out); // fog / underwater / sun shafts
  out = sky.applyTo(out, scenePass); // clouds / god rays (reads depth)
  // Lit-water bloom lifts the sparkle/SSS highlights — only in the de-risk run
  // so it never alters the plain perceptual/perf side-by-side (SPIKE-04). TSL's
  // typed-node overloads reject the base `Node` here (bloom wants Node<"vec4">
  // and `.add` is a fluent-node method) — cast the operands to the loose fluent
  // form (same pattern as the 01-02 salvage nodes). Runtime graph is unchanged.
  if (derisk) {
    const bloomNode = bloom(
      out as unknown as Parameters<typeof bloom>[0],
      0.5,
      0.4,
      0.85,
    );
    out = (out as unknown as { add(n: Node): Node }).add(bloomNode);
  }
  // <<< pixel-art identity, LAST: both shapes (?shape=whole|final) + sun-facing
  // rim reading this scene pass's depth. near/far feed the linear-depth rebuild.
  out = pixelFilterNode(out, scenePass, { near: camera.near, far: camera.far });
  postProcessing.outputNode = out;

  await renderer.compileAsync(scene, camera);

  // --- backend self-report (valid ONLY after init) ---
  // isWebGPUBackend is set at runtime after init (three issue #30024) but is not
  // on the Backend .d.ts surface — cast to read it.
  const usingWebGPU =
    (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ===
    true;
  console.log("[spike] renderer backend:", usingWebGPU ? "WebGPU" : "WebGL2");
  console.log("[spike] water backend  :", water.backend);
  console.log("[spike] spray available:", water.spray !== null);

  // On-screen FPS + backend readout so a screenshot proves which backend
  // produced each number (SPIKE-03). Backend values are read post-init above.
  const perfHud = createPerfHud({
    rendererBackend: usingWebGPU ? "WebGPU" : "WebGL2",
    waterBackend: water.backend,
    sprayAvailable: water.spray !== null,
    forcedWebGL,
  });

  window.addEventListener("resize", () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    water.resize();
    sky.resize(w, h);
  });

  // --- async frame loop: sky FIRST, await water, then postProcessing.render ---
  const sunScreen = new THREE.Vector2(0, 1);
  let last = performance.now();
  let elapsed = 0;
  async function animate(): Promise<void> {
    requestAnimationFrame(animate);
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    elapsed += dt;
    sky.update(dt);
    // Drive the de-risk props (horizontal wake skim + vertical spray bob + glow
    // pulse) BEFORE water.update so this frame's wake injection sees the motion.
    deriskHandle?.update(elapsed);
    await water.update(dt);
    // Feed the sun's screen direction so the rim stays on its sun-facing side.
    sunScreenDir(sun.position, camera, sunScreen);
    setOutlineSunDir(sunScreen.x, sunScreen.y);
    await postProcessing.render(); // NEVER renderer.render() — that skips the node graph
    perfHud.frame(now);
  }
  animate();
}

main().catch((err) => {
  console.error("[spike] boot failed:", err);
  document.body.innerHTML =
    '<pre style="color:#f66;font:14px monospace;padding:16px">' +
    "waterpro-spike boot failed:\n" +
    String(err && (err as Error).stack ? (err as Error).stack : err) +
    "</pre>";
});
