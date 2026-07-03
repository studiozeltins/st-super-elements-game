import * as THREE from 'three';
import { ELEMENTS } from '../data/elements';
import type { CharacterDefinition } from '../data/characters';
import type { WeaponId } from '../data/weapons';

export interface CharacterModel {
  group: THREE.Group;
  animate(elapsedSeconds: number, isMoving: boolean): void;
  dispose(): void;
}

const SKIN_COLOR = 0xf0c8a0;
const PANTS_COLOR = 0x3a3a4a;

function createWeaponMesh(weaponId: WeaponId, accentColor: number): THREE.Object3D {
  const accentMaterial = new THREE.MeshLambertMaterial({
    color: accentColor,
    emissive: accentColor,
    emissiveIntensity: 0.25,
  });
  const gripMaterial = new THREE.MeshLambertMaterial({ color: 0x4a3a2a });

  if (weaponId === 'sword') {
    const sword = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.22), accentMaterial);
    blade.position.y = 0.55;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.08), gripMaterial);
    sword.add(blade, grip);
    return sword;
  }
  if (weaponId === 'greatsword') {
    const greatsword = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.3, 0.34), accentMaterial);
    blade.position.y = 0.75;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.1), gripMaterial);
    greatsword.add(blade, grip);
    return greatsword;
  }
  if (weaponId === 'spear') {
    const spear = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.7, 6), gripMaterial);
    shaft.position.y = 0.5;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 6), accentMaterial);
    tip.position.y = 1.55;
    spear.add(shaft, tip);
    return spear;
  }
  if (weaponId === 'bow') {
    const bow = new THREE.Mesh(
      new THREE.TorusGeometry(0.45, 0.05, 6, 12, Math.PI),
      accentMaterial
    );
    bow.rotation.z = -Math.PI / 2;
    return bow;
  }
  const book = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.44, 0.1), accentMaterial);
  return book;
}

export function createCharacterModel(character: CharacterDefinition): CharacterModel {
  const element = ELEMENTS[character.element];
  const group = new THREE.Group();

  const torsoMaterial = new THREE.MeshLambertMaterial({ color: element.color });
  const skinMaterial = new THREE.MeshLambertMaterial({ color: SKIN_COLOR });
  const hairMaterial = new THREE.MeshLambertMaterial({ color: character.hairColor });
  const pantsMaterial = new THREE.MeshLambertMaterial({ color: PANTS_COLOR });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.42), torsoMaterial);
  torso.position.y = 1.05;
  torso.castShadow = true;

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.48, 0.48), skinMaterial);
  head.position.y = 1.75;
  head.castShadow = true;

  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.2, 0.54), hairMaterial);
  hair.position.y = 2.02;

  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.66, 0.26), pantsMaterial);
  leftLeg.position.set(-0.18, 0.33, 0);
  const rightLeg = leftLeg.clone();
  rightLeg.position.x = 0.18;

  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.2), torsoMaterial);
  leftArm.position.set(-0.46, 1.08, 0);
  const rightArm = leftArm.clone();
  rightArm.position.x = 0.46;

  const weapon = createWeaponMesh(character.weapon, element.color);
  weapon.position.set(0.55, 0.9, 0.15);

  const visionGem = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.14),
    new THREE.MeshBasicMaterial({ color: element.color })
  );
  visionGem.position.y = 2.45;

  group.add(torso, head, hair, leftLeg, rightLeg, leftArm, rightArm, weapon, visionGem);

  return {
    group,
    animate(elapsedSeconds, isMoving) {
      const swing = isMoving ? Math.sin(elapsedSeconds * 10) * 0.5 : 0;
      leftLeg.rotation.x = swing;
      rightLeg.rotation.x = -swing;
      leftArm.rotation.x = -swing * 0.7;
      rightArm.rotation.x = swing * 0.7;
      visionGem.rotation.y = elapsedSeconds * 2;
      visionGem.position.y = 2.45 + Math.sin(elapsedSeconds * 3) * 0.06;
    },
    dispose() {
      group.removeFromParent();
    },
  };
}

export function createNameSprite(name: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const context = canvas.getContext('2d')!;
  context.font = 'bold 34px monospace';
  context.textAlign = 'center';
  context.fillStyle = 'rgba(10, 14, 12, 0.55)';
  const textWidth = context.measureText(name).width + 24;
  context.fillRect((256 - textWidth) / 2, 8, textWidth, 48);
  context.fillStyle = '#e8f5e0';
  context.fillText(name, 128, 44);

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.set(2.6, 0.65, 1);
  sprite.position.y = 3;
  return sprite;
}
