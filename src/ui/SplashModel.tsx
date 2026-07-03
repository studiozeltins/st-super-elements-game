import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { createCharacterModel, createWeaponMesh } from '../game/entities/createCharacterModel';
import { disposeObject } from '../game/engine/disposeObject';
import { CHARACTERS } from '../game/data/characters';
import { WEAPONS_BY_ID, RARITY_HEX } from '../game/data/gacha';

/** A spinning 3D reveal of a pulled item — a character (with weapon) or a lone weapon. */
export function SplashModel({ kind, itemId }: { kind: string; itemId: string }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || 360;
    const height = mount.clientHeight || 460;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 100);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(3, 6, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x9ad0ff, 0.6);
    rim.position.set(-4, 3, -3);
    scene.add(rim);

    const spin = new THREE.Group();
    scene.add(spin);

    let characterModel: ReturnType<typeof createCharacterModel> | null = null;
    if (kind === 'character') {
      const character = CHARACTERS[itemId];
      characterModel = createCharacterModel(character ?? CHARACTERS.zibo);
      spin.add(characterModel.group);
      camera.position.set(0, 1.35, 6.2);
      camera.lookAt(0, 1.15, 0);
    } else {
      const weapon = WEAPONS_BY_ID[itemId];
      const mesh = createWeaponMesh(weapon?.type ?? 'sword', RARITY_HEX[weapon?.rarity ?? 3]);
      mesh.scale.setScalar(2.2);
      mesh.position.y = -1.1;
      spin.add(mesh);
      camera.position.set(0, 0.2, 4.4);
      camera.lookAt(0, 0.2, 0);
    }

    let raf = 0;
    let elapsed = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      elapsed += dt;
      spin.rotation.y = elapsed * 0.8;
      characterModel?.animate(elapsed, dt, false);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      if (characterModel) characterModel.dispose();
      else disposeObject(spin);
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [kind, itemId]);

  return <div ref={mountRef} className="splash__canvas" />;
}
