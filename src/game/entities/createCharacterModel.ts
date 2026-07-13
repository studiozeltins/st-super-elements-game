import * as THREE from 'three';
import { disposeObject } from '../engine/disposeObject';
import { ELEMENTS, type ElementId } from '../data/elements';
import { OVERLAY_LAYER } from '../data/constants';
import type { CharacterDefinition } from '../data/characters';
import type { WeaponId } from '../data/weapons';
import type { SwingProfile } from '../combat/comboSystem';

export interface CharacterModel {
  group: THREE.Group;
  animate(elapsedSeconds: number, deltaSeconds: number, isMoving: boolean): void;
  /** Starts a weapon swing whose shape and size come from the swing profile. */
  triggerAttack(profile: SwingProfile): void;
  dispose(): void;
}

const SKIN_COLOR = 0xf0c8a0;
const PANTS_COLOR = 0x3a3a4a;

export function createWeaponMesh(weaponId: WeaponId, accentColor: number): THREE.Object3D {
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

/** Eyes + mouth on the +Z front of the head so the facing is obvious. */
function createFace(): THREE.Group {
  const face = new THREE.Group();
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x1a1420 });
  const leftEye = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.04), eyeMaterial);
  leftEye.position.set(-0.12, 0.03, 0.25);
  const rightEye = leftEye.clone();
  rightEye.position.x = 0.12;
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.04), eyeMaterial);
  mouth.position.set(0, -0.13, 0.25);
  face.add(leftEye, rightEye, mouth);
  return face;
}

/** A small element-themed crest so each element reads as a distinct silhouette. */
function createElementCrest(element: ElementId, color: number): THREE.Object3D {
  const material = new THREE.MeshLambertMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.35,
  });
  const crest = new THREE.Group();

  if (element === 'pyro') {
    for (const offsetX of [-0.14, 0, 0.14]) {
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.34, 4), material);
      flame.position.set(offsetX, 0.24, 0);
      crest.add(flame);
    }
  } else if (element === 'cryo') {
    for (const angle of [-0.5, 0, 0.5]) {
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), material);
      shard.position.set(Math.sin(angle) * 0.2, 0.22, 0);
      crest.add(shard);
    }
  } else if (element === 'electro') {
    const bolt = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), material);
    bolt.scale.set(0.5, 1.3, 0.5);
    bolt.position.y = 0.26;
    crest.add(bolt);
  } else if (element === 'dendro') {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.24, 4), material);
    stem.position.y = 0.24;
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.24, 4), material);
    leaf.position.set(0.1, 0.34, 0);
    leaf.rotation.z = -0.9;
    crest.add(stem, leaf);
  } else if (element === 'hydro') {
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 3), material);
    fin.position.y = 0.28;
    fin.rotation.x = 0.3;
    crest.add(fin);
  } else if (element === 'geo') {
    for (const offsetX of [-0.16, 0.16]) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12), material);
      rock.position.set(offsetX, 0.16, 0);
      crest.add(rock);
    }
  } else {
    // anemo — two swept-back wing fins.
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 3), material);
      wing.position.set(side * 0.18, 0.2, -0.05);
      wing.rotation.z = side * 0.9;
      crest.add(wing);
    }
  }
  return crest;
}

export function createCharacterModel(character: CharacterDefinition): CharacterModel {
  const element = ELEMENTS[character.element];
  const group = new THREE.Group();
  const bodyPivot = new THREE.Group(); // spun independently of the facing direction
  group.add(bodyPivot);

  const torsoMaterial = new THREE.MeshLambertMaterial({ color: element.color });
  const skinMaterial = new THREE.MeshLambertMaterial({ color: SKIN_COLOR });
  const hairMaterial = new THREE.MeshLambertMaterial({ color: character.hairColor });
  const pantsMaterial = new THREE.MeshLambertMaterial({ color: PANTS_COLOR });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.42), torsoMaterial);
  torso.position.y = 1.05;
  torso.castShadow = true;

  const head = new THREE.Group();
  head.position.y = 1.75;
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.48, 0.48), skinMaterial);
  skull.castShadow = true;
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.2, 0.54), hairMaterial);
  hair.position.y = 0.27;
  head.add(skull, hair, createFace(), createElementCrest(character.element, element.color));

  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.66, 0.26), pantsMaterial);
  leftLeg.position.set(-0.18, 0.33, 0);
  const rightLeg = leftLeg.clone();
  rightLeg.position.x = 0.18;

  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.2), torsoMaterial);
  leftArm.position.set(-0.46, 1.08, 0);

  // Right arm + weapon hang from a shoulder pivot so swings rotate both.
  const rightShoulder = new THREE.Group();
  rightShoulder.position.set(0.46, 1.4, 0);
  const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.2), torsoMaterial);
  rightArm.position.y = -0.32;
  const weapon = createWeaponMesh(character.weapon, element.color);
  weapon.position.set(0, -0.5, 0.15);
  rightShoulder.add(rightArm, weapon);
  const restShoulderRotation = -0.15;
  rightShoulder.rotation.x = restShoulderRotation;

  const cape = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.9, 0.06),
    new THREE.MeshLambertMaterial({ color: element.color })
  );
  cape.position.set(0, 1.0, -0.26);

  const aura = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.62, 20),
    new THREE.MeshBasicMaterial({
      color: element.color,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      // Depth-tested so the ring never overlays character sprites (self or
      // others). The ring is small and rides the flat ground the character
      // stands on, so terrain burial isn't a concern here.
      depthWrite: false,
    })
  );
  aura.rotation.x = -Math.PI / 2;
  aura.position.y = 0.05;

  bodyPivot.add(torso, head, leftLeg, rightLeg, leftArm, rightShoulder, cape, aura);

  let swingRemaining = 0;
  let swingDuration = 0;
  let activeProfile: SwingProfile | null = null;

  function applySwing(progress: number) {
    if (!activeProfile) return;
    const eased = Math.sin(progress * Math.PI); // 0 → 1 → 0 over the swing
    const arc = activeProfile.swingArc;

    if (activeProfile.swingKind === 'spin') {
      bodyPivot.rotation.y = progress * Math.PI * 2;
      rightShoulder.rotation.x = restShoulderRotation - eased * 1.6;
      rightShoulder.rotation.z = -eased * 1.1;
      return;
    }
    if (activeProfile.swingKind === 'thrust') {
      rightShoulder.rotation.x = restShoulderRotation - eased * 1.6;
      rightShoulder.position.z = eased * 0.5;
      return;
    }
    // slashLeft / slashRight — overhead diagonal arc, direction by side.
    const side = activeProfile.swingKind === 'slashLeft' ? -1 : 1;
    rightShoulder.rotation.x = restShoulderRotation - eased * 1.9;
    rightShoulder.rotation.z = side * (progress - 0.5) * arc;
  }

  function resetSwingPose() {
    bodyPivot.rotation.y = 0;
    rightShoulder.rotation.set(restShoulderRotation, 0, 0);
    rightShoulder.position.z = 0;
  }

  return {
    group,
    animate(elapsedSeconds, deltaSeconds, isMoving) {
      if (swingRemaining > 0) {
        swingRemaining = Math.max(0, swingRemaining - deltaSeconds);
        applySwing(1 - swingRemaining / swingDuration);
        if (swingRemaining === 0) {
          activeProfile = null;
          resetSwingPose();
        }
      } else {
        const swing = isMoving ? Math.sin(elapsedSeconds * 10) * 0.5 : 0;
        leftLeg.rotation.x = swing;
        rightLeg.rotation.x = -swing;
        leftArm.rotation.x = -swing * 0.7;
        rightShoulder.rotation.x = restShoulderRotation + swing * 0.7;
      }
      head.position.y = 1.75 + Math.sin(elapsedSeconds * 3) * 0.02;
      (aura.material as THREE.MeshBasicMaterial).opacity = 0.4 + Math.sin(elapsedSeconds * 4) * 0.12;
    },
    triggerAttack(profile) {
      activeProfile = profile;
      swingDuration = profile.swingDurationSeconds;
      swingRemaining = profile.swingDurationSeconds;
    },
    dispose() {
      disposeObject(group);
    },
  };
}

export function createNameSprite(name: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const context = canvas.getContext('2d')!;
  // "Pixelify Sans" matches the UI display font; monospace fallback still carries
  // Latvian diacritics if the webfont hasn't finished loading when this bakes.
  context.font = 'bold 34px "Pixelify Sans", monospace';
  context.textAlign = 'center';
  context.fillStyle = 'rgba(10, 14, 12, 0.55)';
  const textWidth = context.measureText(name).width + 24;
  context.fillRect((256 - textWidth) / 2, 8, textWidth, 48);
  context.fillStyle = '#e8f5e0';
  context.fillText(name, 128, 44);

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.layers.set(OVERLAY_LAYER); // crisp: rendered in the native-res overlay pass
  sprite.scale.set(2.6, 0.65, 1);
  sprite.position.y = 3;
  return sprite;
}
