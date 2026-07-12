import * as THREE from 'three';
import { acquireDebrisSlot, debrisScale, stepDebris, type DebrisParticle } from './debrisMath';

/**
 * Cube-debris shatter FX: one globally pooled InstancedMesh (a single draw
 * call, no allocation at combat time). Cubes fly out of impacts, bounce off
 * the walkable ground, spin, and shrink away.
 */
export interface DebrisSystem {
  spawn(position: THREE.Vector3, color: number, count?: number, speed?: number): void;
  update(deltaSeconds: number): void;
  dispose(): void;
}

const MAX_DEBRIS = 96;

export function createDebrisSystem(
  scene: THREE.Scene,
  getGroundHeight: (x: number, z: number) => number
): DebrisSystem {
  const pool: DebrisParticle[] = Array.from({ length: MAX_DEBRIS }, () => ({
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    spinX: 0,
    spinZ: 0,
    rotX: 0,
    rotZ: 0,
    age: 0,
    life: 1,
    baseScale: 0,
    active: false,
  }));

  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial(),
    MAX_DEBRIS
  );
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let index = 0; index < MAX_DEBRIS; index += 1) {
    mesh.setMatrixAt(index, zeroMatrix);
    mesh.setColorAt(index, new THREE.Color(1, 1, 1));
  }
  scene.add(mesh);

  const shade = new THREE.Color();
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Euler();
  const quaternion = new THREE.Quaternion();
  const positionVector = new THREE.Vector3();
  const scaleVector = new THREE.Vector3();

  return {
    spawn(position, color, count = 10, speed = 5.5) {
      // Non-deterministic Math.random is fine here — purely cosmetic, local-only.
      for (let spawned = 0; spawned < Math.min(count, MAX_DEBRIS); spawned += 1) {
        const slot = acquireDebrisSlot(pool);
        const particle = pool[slot];
        const angle = Math.random() * Math.PI * 2;
        const lateral = speed * (0.4 + Math.random() * 0.6);
        particle.x = position.x;
        particle.y = position.y + 0.3;
        particle.z = position.z;
        particle.vx = Math.cos(angle) * lateral;
        particle.vy = speed * (0.7 + Math.random() * 0.6);
        particle.vz = Math.sin(angle) * lateral;
        particle.spinX = (Math.random() - 0.5) * 12;
        particle.spinZ = (Math.random() - 0.5) * 12;
        particle.rotX = Math.random() * Math.PI;
        particle.rotZ = Math.random() * Math.PI;
        particle.age = 0;
        particle.life = 1.8 + Math.random() * 0.8;
        particle.baseScale = 0.12 + Math.random() * 0.1;
        particle.active = true;
        shade.setHex(color).offsetHSL(0, 0, (Math.random() - 0.5) * 0.3);
        mesh.setColorAt(slot, shade);
      }
      mesh.instanceColor!.needsUpdate = true;
    },
    update(deltaSeconds) {
      let anyActive = false;
      for (let index = 0; index < MAX_DEBRIS; index += 1) {
        const particle = pool[index];
        if (!particle.active) continue;
        anyActive = true;
        const alive = stepDebris(particle, deltaSeconds, getGroundHeight(particle.x, particle.z));
        if (!alive) {
          mesh.setMatrixAt(index, zeroMatrix);
          continue;
        }
        const scale = debrisScale(particle);
        rotation.set(particle.rotX, 0, particle.rotZ);
        matrix.compose(
          positionVector.set(particle.x, particle.y + scale / 2, particle.z),
          quaternion.setFromEuler(rotation),
          scaleVector.set(scale, scale, scale)
        );
        mesh.setMatrixAt(index, matrix);
      }
      if (anyActive) mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    },
  };
}
