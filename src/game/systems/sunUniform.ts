import * as THREE from 'three';

/**
 * Shared sun-direction uniform (world space, toward the sun). Material shaders
 * that draw a sun-facing edge highlight on their INTERNAL detail — cobble stones,
 * roof tiles — reference this by object so they all track the one moving sun. The
 * game loop updates `.value` each frame from the sun light's direction. Held by
 * reference (never reassigned), like the wind/scorch uniforms.
 */
export const sunDirUniform: { value: THREE.Vector3 } = {
  value: new THREE.Vector3(0.5, 0.7, 0.5).normalize(),
};
