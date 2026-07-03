import * as THREE from 'three';
import { MAX_PIXELATION_FACTOR, PIXEL_TARGET_INTERNAL_WIDTH } from '../data/constants';

export interface PixelRenderer {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  resize(): void;
  render(scene: THREE.Scene): void;
  dispose(): void;
}

/**
 * Renders internally at reduced resolution; CSS upscales the canvas with
 * `image-rendering: pixelated` for the pixel-art look. The pixelation factor
 * adapts to screen size — a phone renders near-native so text stays readable,
 * a desktop gets the full chunky-pixel look. Low internal resolution is also
 * what keeps the frame budget at 60-144 fps.
 */
export function createPixelRenderer(canvas: HTMLCanvasElement): PixelRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);

  function resize() {
    const displayWidth = canvas.clientWidth || window.innerWidth;
    const displayHeight = canvas.clientHeight || window.innerHeight;
    const pixelationFactor = Math.min(
      MAX_PIXELATION_FACTOR,
      Math.max(1, displayWidth / PIXEL_TARGET_INTERNAL_WIDTH)
    );
    const internalWidth = Math.max(1, Math.floor(displayWidth / pixelationFactor));
    const internalHeight = Math.max(1, Math.floor(displayHeight / pixelationFactor));
    renderer.setSize(internalWidth, internalHeight, false);
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
      renderer.render(scene, camera);
    },
    dispose() {
      window.removeEventListener('resize', resize);
      renderer.dispose();
    },
  };
}
