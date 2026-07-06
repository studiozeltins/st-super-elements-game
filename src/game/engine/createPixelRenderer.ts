import * as THREE from 'three';
import { MAX_PIXELATION_FACTOR, OVERLAY_LAYER, PIXEL_TARGET_INTERNAL_WIDTH } from '../data/constants';

export interface PixelRenderer {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  resize(): void;
  render(scene: THREE.Scene): void;
  dispose(): void;
}

/**
 * Two-pass renderer that keeps the world chunky-pixel but draws UI billboards
 * crisp.
 *
 * Pass 1 renders the world (layer 0) into a small render target — the low
 * internal resolution is what makes the pixels and keeps the frame budget. The
 * target aims at PIXEL_TARGET_INTERNAL_WIDTH, so a phone renders near-native
 * (readable) and a desktop gets the full chunky look.
 *
 * Pass 2 blits that target to the full-resolution canvas with a nearest-filter
 * quad — this is the actual pixelation (no CSS upscaling needed anymore).
 *
 * Pass 3 renders only OVERLAY_LAYER objects (health bars, damage numbers, name
 * tags) straight to the canvas at native resolution, on top of the blitted
 * world. Those stay sharp because they never pass through the low-res target.
 */
export function createPixelRenderer(canvas: HTMLCanvasElement): PixelRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);

  // Low-res world buffer. Nearest filtering is what upscales into visible pixels.
  const worldTarget = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
  });

  // A screen-filling quad that draws the world target onto the canvas.
  const blitCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const blitScene = new THREE.Scene();
  const blitMaterial = new THREE.MeshBasicMaterial({
    map: worldTarget.texture,
    depthTest: false,
    depthWrite: false,
  });
  const blitQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blitMaterial);
  // Push the quad off the camera's near plane (both would sit at z=0) so it is
  // inside the frustum and actually drawn — otherwise it clips and the canvas
  // shows only the clear colour.
  blitQuad.position.z = -0.5;
  blitScene.add(blitQuad);

  function resize() {
    const displayWidth = canvas.clientWidth || window.innerWidth;
    const displayHeight = canvas.clientHeight || window.innerHeight;
    const pixelationFactor = Math.min(
      MAX_PIXELATION_FACTOR,
      Math.max(1, displayWidth / PIXEL_TARGET_INTERNAL_WIDTH)
    );
    const internalWidth = Math.max(1, Math.floor(displayWidth / pixelationFactor));
    const internalHeight = Math.max(1, Math.floor(displayHeight / pixelationFactor));
    // Canvas backing store renders at native (× DPR) resolution — the overlay
    // pass draws here directly and stays crisp. The world target stays small.
    renderer.setSize(displayWidth, displayHeight, false);
    worldTarget.setSize(internalWidth, internalHeight);
    camera.aspect = displayWidth / displayHeight;
    camera.updateProjectionMatrix();
  }

  resize();
  window.addEventListener('resize', resize);

  return {
    renderer,
    camera,
    resize,
    render(scene) {
      // Pass 1: world (layer 0) → low-res target.
      camera.layers.set(0);
      renderer.setRenderTarget(worldTarget);
      renderer.render(scene, camera);

      // Pass 2: upscale the pixelated world onto the canvas.
      renderer.setRenderTarget(null);
      renderer.render(blitScene, blitCamera);

      // Pass 3: crisp overlay billboards on top, native resolution, no colour clear.
      // scene.background is a solid Color, which forces WebGLBackground to clear the
      // canvas even with autoClear off — that would repaint sky over the blitted
      // world and leave only these sprites. Null it for this pass, then restore.
      const savedBackground = scene.background;
      scene.background = null;
      renderer.autoClear = false;
      camera.layers.set(OVERLAY_LAYER);
      renderer.clearDepth();
      renderer.render(scene, camera);
      renderer.autoClear = true;
      scene.background = savedBackground;
      camera.layers.set(0);
    },
    dispose() {
      window.removeEventListener('resize', resize);
      worldTarget.dispose();
      blitMaterial.dispose();
      blitQuad.geometry.dispose();
      renderer.dispose();
    },
  };
}
