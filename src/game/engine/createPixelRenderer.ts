import * as THREE from 'three';
import { PIXELATION_FACTOR } from '../data/constants';

export interface PixelRenderer {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  resize(): void;
  render(scene: THREE.Scene): void;
  dispose(): void;
}

/**
 * Renders internally at 1/PIXELATION_FACTOR resolution; CSS upscales the
 * canvas with `image-rendering: pixelated` for the pixel-art look. The low
 * internal resolution is also what keeps the frame budget at 60-144 fps.
 */
export function createPixelRenderer(canvas: HTMLCanvasElement): PixelRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 300);

  function resize() {
    const displayWidth = canvas.clientWidth || window.innerWidth;
    const displayHeight = canvas.clientHeight || window.innerHeight;
    const internalWidth = Math.max(1, Math.floor(displayWidth / PIXELATION_FACTOR));
    const internalHeight = Math.max(1, Math.floor(displayHeight / PIXELATION_FACTOR));
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
