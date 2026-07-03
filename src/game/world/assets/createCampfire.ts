import * as THREE from 'three';
import type { SeededRandom, WorldAsset } from './types';
import { lambert, randomBetween, randomIntBetween } from './assetHelpers';

const STONE_COLOR = 0x5a6678;
const LOG_COLOR = 0x6b4a2f;
const FLAME_OUTER_COLOR = 0xe8722f;
const FLAME_INNER_COLOR = 0xffe066;
const GLOW_COLOR = 0xffb84a;

export function createCampfire(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();

  const stoneCount = randomIntBetween(random, 5, 6);
  const ringRadius = 0.65;
  for (let index = 0; index < stoneCount; index += 1) {
    const stoneAngle = (index / stoneCount) * Math.PI * 2 + random() * 0.4;
    const stoneRadius = randomBetween(random, 0.12, 0.2);
    const stone = new THREE.Mesh(
      new THREE.DodecahedronGeometry(stoneRadius, 0),
      lambert(STONE_COLOR)
    );
    stone.position.set(
      Math.cos(stoneAngle) * ringRadius,
      stoneRadius * 0.6,
      Math.sin(stoneAngle) * ringRadius
    );
    stone.rotation.y = random() * Math.PI * 2;
    group.add(stone);
  }

  const logMaterial = lambert(LOG_COLOR);
  const logCount = 3;
  for (let index = 0; index < logCount; index += 1) {
    const logAngle = (index / logCount) * Math.PI + random() * 0.3;
    const log = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.14, 0.14), logMaterial);
    log.position.y = 0.12 + index * 0.05;
    log.rotation.set(0, logAngle, randomBetween(random, -0.12, 0.12));
    group.add(log);
  }

  const outerFlame = new THREE.Mesh(
    new THREE.ConeGeometry(0.32, 0.85, 6),
    new THREE.MeshBasicMaterial({ color: FLAME_OUTER_COLOR })
  );
  outerFlame.position.y = 0.62;
  const innerFlame = new THREE.Mesh(
    new THREE.ConeGeometry(0.17, 0.5, 6),
    new THREE.MeshBasicMaterial({ color: FLAME_INNER_COLOR })
  );
  innerFlame.position.y = 0.5;
  group.add(outerFlame, innerFlame);

  const fireLight = new THREE.PointLight(GLOW_COLOR, 2.5, 9, 2);
  fireLight.position.y = 1;
  group.add(fireLight);

  return { group };
}
