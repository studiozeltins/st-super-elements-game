import * as THREE from 'three';
import { MAX_PIXELATION_FACTOR, OVERLAY_LAYER, PIXEL_TARGET_INTERNAL_WIDTH } from '../data/constants';

export interface PixelRenderer {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  resize(): void;
  render(scene: THREE.Scene): void;
  setPixelated(enabled: boolean): void;
  /**
   * A big static subtree (the world) to hide during the overlay pass, so
   * pass 3 does not walk thousands of prop nodes to find a few sprites.
   */
  setOverlayCullTarget(target: THREE.Object3D | null): void;
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
  // The sun and all shadow-casting geometry are static (only units move a little),
  // and each renderer.render() below would otherwise rebuild the 2048² sun depth
  // map over the WHOLE scene. Drive it once per frame instead of twice.
  renderer.shadowMap.autoUpdate = false;

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);

  let pixelated = true;
  let frameParity = false;
  let overlayCullTarget: THREE.Object3D | null = null;

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
    if (pixelated) worldTarget.setSize(internalWidth, internalHeight);
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
      // Rebuild the sun shadow map every OTHER frame — the whole world redraws
      // into the depth map on update, and 30Hz shadows on slow-moving units are
      // imperceptible while halving the biggest single GPU cost.
      frameParity = !frameParity;
      if (frameParity) renderer.shadowMap.needsUpdate = true;

      // Scene matrices are computed exactly ONCE per frame, here. The auto
      // update would otherwise re-compose every dynamic node's matrices again
      // on each render pass below (world + overlay).
      scene.matrixWorldAutoUpdate = false;
      scene.updateMatrixWorld();

      camera.layers.set(0);
      if (pixelated) {
        // Pass 1: world (layer 0) → low-res target.
        renderer.setRenderTarget(worldTarget);
        renderer.render(scene, camera);

        // Pass 2: upscale the pixelated world onto the canvas.
        renderer.setRenderTarget(null);
        renderer.render(blitScene, blitCamera);
      } else {
        // Native path: world straight to the canvas, no low-res target, no blit.
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
      }

      // Overlay pass: crisp billboards on top, native resolution, no colour clear.
      // scene.background is a solid Color, which forces WebGLBackground to clear the
      // canvas even with autoClear off — that would repaint sky over the world
      // and leave only these sprites. Null it for this pass, then restore.
      const savedBackground = scene.background;
      scene.background = null;
      renderer.autoClear = false;
      camera.layers.set(OVERLAY_LAYER);
      renderer.clearDepth();
      if (overlayCullTarget) overlayCullTarget.visible = false;
      renderer.render(scene, camera);
      if (overlayCullTarget) overlayCullTarget.visible = true;
      renderer.autoClear = true;
      scene.background = savedBackground;
      camera.layers.set(0);
    },
    setOverlayCullTarget(target) {
      overlayCullTarget = target;
    },
    setPixelated(enabled) {
      if (pixelated === enabled) return;
      pixelated = enabled;
      // Release the low-res buffer while native rendering; resize() restores it.
      if (enabled) resize();
      else worldTarget.setSize(1, 1);
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
