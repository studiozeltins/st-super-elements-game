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
import * as THREE from 'three/webgpu';
import type { Node } from 'three/webgpu';
import { pass } from 'three/tsl';
import { WaterSystem, getPresetParams } from '../vendor/threejs-water-pro';
import { SkySystem, PRESETS } from '../vendor/threejs-sky-pro';
import { getTerrainHeight, terrainColorAt, SEA_LEVEL, ISLANDS } from '../game/world/terrain';
import { pixelFilterNode } from '../game/engine/tsl/pixelFilterNode';

// The game's top-down camera: 45deg FOV, offset+tilt from createGame.ts
// (CAMERA_OFFSET = (7,15,11), lookAt target). far extended 500 -> 20000 so the
// Pro ocean/sky do not clip at the small game scale (RESEARCH Pitfall 1).
const CAMERA_OFFSET = new THREE.Vector3(7, 15, 11);
const CAMERA_FRAMING = 4; // pull back along the same tilt to frame the slice
const CAMERA_FAR = 20000;

// Beach slice: the ONLY beach arc is the city island (ISLANDS[0]), facing -x.
const CITY = ISLANDS[0];
const BEACH_X = CITY.centerX + Math.cos(CITY.beachDir) * CITY.radius; // ~ -54
const BEACH_Z = CITY.centerZ + Math.sin(CITY.beachDir) * CITY.radius; // ~ 0
const SLICE_SIZE = 90;
const SLICE_SEG = 96;

/**
 * Build the representative beach mesh: a PlaneGeometry whose per-vertex Y is the
 * real terrain height, shifted so SEA_LEVEL maps to y=0 (where Water Pro renders
 * its ocean plane). Vertex colours come from the game's terrainColorAt so the
 * sand/cliff palette reads. Plain MeshStandardMaterial is enough to give the
 * pixel filter real depth discontinuities (D-03); the custom terrain shader is
 * a Phase 3 concern.
 */
function buildBeachSlice(): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(SLICE_SIZE, SLICE_SIZE, SLICE_SEG, SLICE_SEG);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) {
    const worldX = positions.getX(i) + BEACH_X;
    const worldZ = positions.getZ(i) + BEACH_Z;
    const height = getTerrainHeight(worldX, worldZ);
    positions.setY(i, height - SEA_LEVEL); // waterline -> 0
    const color = terrainColorAt(worldX, worldZ, height);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.computeVertexNormals();
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(BEACH_X, 0, BEACH_Z);
  return mesh;
}

async function main(): Promise<void> {
  // --- renderer (auto WebGL2 fallback; read backend ONLY after init) ---
  const renderer = new THREE.WebGPURenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  document.body.appendChild(renderer.domElement);
  await renderer.init();

  // --- scene + game-tilt camera ---
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    CAMERA_FAR
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
  const water = await WaterSystem.create(renderer, scene, camera, 'medium');
  water.loadPreset(getPresetParams('blackFlag'));

  // --- Sky Pro (atmosphere/clouds/sun; drives water lighting) ---
  const sky = await SkySystem.create({ renderer, camera, scene, quality: 'medium' });
  await sky.applyPreset(PRESETS.partlyCloudy);
  // ONE-CALL sky->water coupling; build the provider exactly once.
  water.setSky(sky.createSkyProvider({ envMap: true }));

  // --- post chain: water fx -> sky composite -> pixel node LAST ---
  const postProcessing = new THREE.PostProcessing(renderer);
  const scenePass = pass(water.scene, water.camera);
  let out: Node = scenePass.getTextureNode('output');
  out = water.postProcessing.buildNode(scenePass, out); // fog / underwater / sun shafts
  out = sky.applyTo(out, scenePass); // clouds / god rays (reads depth)
  out = pixelFilterNode(out); // <<< pixel-art identity, LAST (plan 02 adds the sun-rim + scenePass depth)
  postProcessing.outputNode = out;

  await renderer.compileAsync(scene, camera);

  // --- backend self-report (valid ONLY after init) ---
  // isWebGPUBackend is set at runtime after init (three issue #30024) but is not
  // on the Backend .d.ts surface — cast to read it.
  const usingWebGPU =
    (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend === true;
  console.log('[spike] renderer backend:', usingWebGPU ? 'WebGPU' : 'WebGL2');
  console.log('[spike] water backend  :', water.backend);
  console.log('[spike] spray available:', water.spray !== null);

  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    water.resize();
    sky.resize(w, h);
  });

  // --- async frame loop: sky FIRST, await water, then postProcessing.render ---
  let last = performance.now();
  async function animate(): Promise<void> {
    requestAnimationFrame(animate);
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    sky.update(dt);
    await water.update(dt);
    await postProcessing.render(); // NEVER renderer.render() — that skips the node graph
  }
  animate();
}

main().catch((err) => {
  console.error('[spike] boot failed:', err);
  document.body.innerHTML =
    '<pre style="color:#f66;font:14px monospace;padding:16px">' +
    'waterpro-spike boot failed:\n' +
    String(err && (err as Error).stack ? (err as Error).stack : err) +
    '</pre>';
});
