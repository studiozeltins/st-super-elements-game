import * as THREE from 'three';
import { ENEMY_ARCHETYPES } from '../data/enemyArchetypes';
import { GOLIATH_ARCHETYPES_BY_SIZE } from '../data/goliathArchetypes';
import { createEnemyModel, disposeEnemyModel, type EnemyModel } from './createEnemyModel';
import { createGoliathModel } from './createGoliathModel';

/**
 * Builds ONE model of every enemy archetype and every goliath size. Constructing
 * each variant once is what actually warms the model builders: their per-(part,
 * size) voxel geometry and per-archetype materials are cached in module-level
 * Maps (voxelPartGeometries / sharedArmorMaterials / sharedBodyMaterials) and
 * shared by every future spawn, so the first LIVE spawn of a type never pays the
 * cold voxel-cluster build again. Boss enemies reuse the same geometry/material
 * as their base archetype (only the group scale differs), so scale 1 covers them.
 * Returned so the caller can compile + upload them before disposing.
 */
export function buildAllEntityVariants(): EnemyModel[] {
  const models: EnemyModel[] = [];
  for (const archetype of Object.values(ENEMY_ARCHETYPES)) {
    models.push(createEnemyModel(archetype, 1));
  }
  for (const archetype of GOLIATH_ARCHETYPES_BY_SIZE) {
    models.push(createGoliathModel(archetype));
  }
  return models;
}

/**
 * The slice of THREE.WebGLRenderer prewarm needs. Kept minimal so a test can
 * inject a stub without a real WebGL context.
 */
export interface PrewarmRenderer {
  shadowMap: { needsUpdate: boolean };
  compile(scene: THREE.Scene, camera: THREE.Camera): void;
  render(scene: THREE.Scene, camera: THREE.Camera): void;
}

/**
 * Moves the one-time cost of first-appearing every enemy/goliath type OUT of the
 * first fight — where it landed as a ~400ms frame freeze the moment goliaths
 * spawned — and into load. Builds one of each variant (warming the shared
 * geometry/material caches), adds them to the REAL lit scene so three.js compiles
 * the correct lit + shadow-cast shader programs and uploads the shared geometry
 * to the GPU (compile + one throwaway render with the shadow map forced), then
 * disposes the throwaway models. The cached geometry + materials the builders
 * keep are never disposed, so they — and their now-compiled GPU programs — stay
 * warm for every real spawn that follows.
 *
 * Must run against the same scene the game renders (it holds the sun light that
 * decides which program variant compiles) and after that light exists.
 */
export function prewarmEntityModels(
  renderer: PrewarmRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera
): void {
  const models = buildAllEntityVariants();
  for (const model of models) scene.add(model.group);
  // Force the shadow depth pass this once so the cast-shadow program compiles too
  // (the frame loop owns needsUpdate the rest of the time — autoUpdate is off).
  renderer.shadowMap.needsUpdate = true;
  renderer.compile(scene, camera);
  renderer.render(scene, camera);
  for (const model of models) disposeEnemyModel(model);
}
