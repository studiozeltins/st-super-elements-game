import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { createCharacterModel } from '../game/entities/createCharacterModel';
import { CHARACTERS } from '../game/data/characters';

/** A small self-contained THREE scene that slowly spins a character + weapon. */
export function CharacterPreview({ characterId }: { characterId: string }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const character = CHARACTERS[characterId];
    const mount = mountRef.current;
    if (!character || !mount) return;

    const width = mount.clientWidth || 320;
    const height = mount.clientHeight || 440;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 100);
    camera.position.set(0, 1.35, 6.2);
    camera.lookAt(0, 1.15, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(3, 6, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x7ec8ff, 0.55);
    rim.position.set(-4, 2.5, -3);
    scene.add(rim);

    const model = createCharacterModel(character);
    scene.add(model.group);

    let raf = 0;
    let elapsed = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      elapsed += dt;
      model.group.rotation.y = elapsed * 0.6;
      model.animate(elapsed, dt, false);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      model.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [characterId]);

  return <div ref={mountRef} className="banner__model" />;
}
