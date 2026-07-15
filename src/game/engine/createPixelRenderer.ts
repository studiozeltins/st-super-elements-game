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
  // Basic (unfiltered) shadows give HARD pixel edges — the crisp look the pixel
  // filter wants, no PCF blur mushing the shadow into a soft blob. The old
  // "Basic == blocky" note was from a world-spanning shadow camera; the current
  // player-following ±45 camera at 2048 (createMondstadtWorld) is dense enough
  // that unfiltered edges read clean, not blocky (Phase 09.1 SHADOW-03 gap fix).
  renderer.shadowMap.type = THREE.BasicShadowMap;
  // The sun DIRECTION now drifts on a slow 20-min arc (Phase 09.1), but the
  // per-frame angular delta is sub-texel, so the existing every-other-frame depth
  // refresh (frameParity below) keeps up with ZERO new GPU cost. autoUpdate=false
  // avoids each renderer.render() rebuilding the sun depth map over the WHOLE scene
  // twice per frame. Do NOT force needsUpdate every frame — that doubles the biggest
  // GPU cost (a SHADOW-03 regression); the throttle is enough for the slow arc.
  renderer.shadowMap.autoUpdate = false;

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);

  let pixelated = true;
  let frameParity = false;
  let overlayCullTarget: THREE.Object3D | null = null;

  // Low-res world buffer. Nearest filtering is what upscales into visible pixels.
  // A depth texture is attached so the blit can detect silhouette EDGES from depth
  // discontinuities (the outline pass) — computed at the low internal resolution,
  // so the outlines are chunky pixel edges that match the art.
  const depthTexture = new THREE.DepthTexture(1, 1);
  const worldTarget = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthTexture,
  });

  // A screen-filling quad that draws the world target onto the canvas AND draws a
  // dark outline where depth jumps (object silhouettes) — an "edge highlight" that
  // is only on the edges, not the whole face.
  const blitCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const blitScene = new THREE.Scene();
  const blitMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: worldTarget.texture },
      tDepth: { value: depthTexture },
      uTexel: { value: new THREE.Vector2(1 / 320, 1 / 240) },
      uNear: { value: camera.near },
      uFar: { value: camera.far },
      uEdge: { value: new THREE.Color(0xaab6c8) },
      uEdgeStrength: { value: 0.6 },
      uThreshold: { value: 0.28 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform sampler2D tDepth;
      uniform vec2 uTexel;
      uniform float uNear, uFar, uThreshold, uEdgeStrength;
      uniform vec3 uEdge;
      varying vec2 vUv;
      float lin(vec2 uv) {
        float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
        return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
      }
      void main() {
        vec3 col = texture2D(tDiffuse, vUv).rgb;
        float c = lin(vUv);
        float diff = max(
          max(abs(c - lin(vUv - vec2(uTexel.x, 0.0))), abs(c - lin(vUv + vec2(uTexel.x, 0.0)))),
          max(abs(c - lin(vUv - vec2(0.0, uTexel.y))), abs(c - lin(vUv + vec2(0.0, uTexel.y))))
        );
        // Relative depth jump → silhouette edge. Skip the far sky (c huge).
        float edge = (c < uFar * 0.7) ? step(uThreshold, diff / c) : 0.0;
        col += uEdge * (edge * uEdgeStrength); // additive light rim — visible day AND night
        gl_FragColor = vec4(col, 1.0);
      }
    `,
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
    if (pixelated) {
      worldTarget.setSize(internalWidth, internalHeight);
      blitMaterial.uniforms.uTexel.value.set(1 / internalWidth, 1 / internalHeight);
    }
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
      depthTexture.dispose();
      worldTarget.dispose();
      blitMaterial.dispose();
      blitQuad.geometry.dispose();
      renderer.dispose();
    },
  };
}
