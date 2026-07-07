import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { createCharacterModel } from '../game/entities/createCharacterModel';
import { CHARACTERS } from '../game/data/characters';

// Purple transcend-shard colour (matches --shard) for the orbiting Būsts stars.
const SHARD_COLOR = 0x9333ea;

/** A small self-contained THREE scene that slowly spins a character + weapon, with
 *  one orbiting purple shard-star per installed transcend (Būsts) level. */
export function CharacterPreview({
  characterId,
  transcendLevel = 0,
}: {
  characterId: string;
  transcendLevel?: number;
}) {
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

    // Render at a low internal resolution and let CSS upscale it with nearest-
    // neighbour so the character reads as chunky pixel-art (matches the game).
    const PIXEL_SCALE = 0.32;
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    renderer.setPixelRatio(PIXEL_SCALE);
    renderer.setSize(width, height);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.imageRendering = 'pixelated';
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(3, 6, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x7ec8ff, 0.55);
    rim.position.set(-4, 2.5, -3);
    scene.add(rim);

    const model = createCharacterModel(character);
    // Sit the model a touch lower in frame (closer to the ground) across every card.
    model.group.position.y = -0.3;
    scene.add(model.group);

    // Būsts orbit — one purple shard diamond per transcend level, circling in 3D.
    const orbitGroup = new THREE.Group();
    const starGeo = transcendLevel > 0 ? new THREE.OctahedronGeometry(0.1) : null;
    const starMat =
      transcendLevel > 0
        ? new THREE.MeshBasicMaterial({ color: SHARD_COLOR, transparent: true, opacity: 0.95 })
        : null;
    if (starGeo && starMat) {
      for (let i = 0; i < transcendLevel; i++) {
        const star = new THREE.Mesh(starGeo, starMat);
        const angle = (i / transcendLevel) * Math.PI * 2;
        star.position.set(Math.cos(angle) * 1.15, 1.0, Math.sin(angle) * 1.15);
        orbitGroup.add(star);
      }
      scene.add(orbitGroup);
    }

    let raf = 0;
    let elapsed = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      elapsed += dt;
      model.group.rotation.y = elapsed * 0.6;
      model.animate(elapsed, dt, false);
      // Stars orbit the character and each spins on its own axis.
      orbitGroup.rotation.y = elapsed * 0.9;
      for (const star of orbitGroup.children) star.rotation.y = elapsed * 2.4;
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
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      model.dispose();
      starGeo?.dispose();
      starMat?.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [characterId, transcendLevel]);

  return <div ref={mountRef} className="banner__model" />;
}
