import * as THREE from 'three';

function disposeMaterial(material: THREE.Material) {
  const texturedMaterial = material as THREE.Material & { map?: THREE.Texture | null };
  texturedMaterial.map?.dispose();
  material.dispose();
}

/** Frees GPU resources (geometry, materials, textures) for a whole subtree. */
export function disposeObject(root: THREE.Object3D) {
  root.traverse(node => {
    const renderable = node as THREE.Mesh | THREE.Points | THREE.Sprite;
    if ('geometry' in renderable) renderable.geometry?.dispose();
    if (!('material' in renderable) || !renderable.material) return;
    if (Array.isArray(renderable.material)) {
      renderable.material.forEach(disposeMaterial);
      return;
    }
    disposeMaterial(renderable.material);
  });
  root.removeFromParent();
}
