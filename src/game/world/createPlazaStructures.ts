import * as THREE from 'three';
import type { SeededRandom } from './assets';

/**
 * The plaza's fixed structures — the cobblestone ground, houses, windmill and
 * fountain — in the voxel look: cones and cylinders are stepped box tiers, the
 * ground is a per-world-cell pixel-cobblestone shader (crisp square stones with
 * mortar seams, matching the terrain/scorch pixel style) with an irregular
 * discarded edge so it never reads as a plain flat color circle.
 */

const TIMBER = 0x4a3524;

/**
 * Pixel-cobblestone plaza ground — a SQUARE town square whose fragment shader
 * paints square stones per world cell (3-tone warm-grey palette + per-cell
 * speckle + dark mortar seams), darkens a border course of pavers, inlays a
 * lighter marker frame, and DISCARDS past a per-cell jittered square boundary so
 * the rim is a ragged cobbled edge, not a clean line. Receives shadows + drifts
 * with day/night (Lambert), like the terrain it sits on.
 */
export function createPlazaGround(halfExtent: number): THREE.Mesh {
  // A little larger than the town footprint so the ragged edge has room.
  const side = (halfExtent + 1.5) * 2;
  const geometry = new THREE.PlaneGeometry(side, side);
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const r = halfExtent.toFixed(1);
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec2 vPlazaXZ;
        `
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        vPlazaXZ = (modelMatrix * vec4(position, 1.0)).xz;
        `
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec2 vPlazaXZ;
        float phash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
        `
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
        #include <color_fragment>
        {
          vec2 world = vPlazaXZ;
          // Square "distance" (Chebyshev) so the plaza + its border are square.
          float R = max(abs(world.x), abs(world.z));
          float CELLS = 1.7;
          vec2 gp = world * CELLS;
          vec2 cell = floor(gp);
          vec2 f = fract(gp);
          float rnd = phash(cell);
          // Ragged cobbled edge: discard past a per-cell jittered square boundary.
          float rim = ${r} + (rnd - 0.5) * 1.4;
          if (R > rim) discard;
          // 3-tone warm stone, chosen per cell, plus a brightness speckle.
          vec3 s1 = vec3(0.80, 0.76, 0.67);
          vec3 s2 = vec3(0.70, 0.66, 0.57);
          vec3 s3 = vec3(0.61, 0.57, 0.49);
          vec3 stone = rnd < 0.34 ? s1 : (rnd < 0.67 ? s2 : s3);
          stone *= 0.92 + phash(cell + 3.1) * 0.16;
          // Dark mortar seams between cobbles.
          float edge = min(min(f.x, f.y), min(1.0 - f.x, 1.0 - f.y));
          float seam = smoothstep(0.0, 0.1, edge);
          stone = mix(vec3(0.34, 0.31, 0.26), stone, seam);
          // Darker paver course around the border.
          stone *= mix(0.78, 1.0, smoothstep(rim - 2.0, rim - 3.5, R));
          // Lighter inlaid marker frame, painted only on the stone faces (not seams).
          float ringDist = abs(R - (${r} - 4.0));
          stone = mix(stone, vec3(0.87, 0.81, 0.63), (1.0 - smoothstep(0.0, 0.45, ringDist)) * seam * 0.6);
          diffuseColor.rgb = stone;
        }
        `
      );
  };
  material.customProgramCacheKey = () => 'plazaCobble';

  const plaza = new THREE.Mesh(geometry, material);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.02;
  plaza.receiveShadow = true;
  return plaza;
}

export function createHouse(
  random: SeededRandom,
  x: number,
  z: number,
  faceTargetX: number,
  faceTargetZ: number,
  scale = 1
): THREE.Group {
  const house = new THREE.Group();
  const wallColors = [0xe8dcc0, 0xdccfb4, 0xf0e6d0];
  const roofColors = [0xb0452f, 0x3d7a78, 0x8a5a3a];
  const wallColor = wallColors[Math.floor(random() * wallColors.length)];
  const roofColor = roofColors[Math.floor(random() * roofColors.length)];
  const timberMat = new THREE.MeshLambertMaterial({ color: TIMBER });

  // Stone plinth the house sits on — grounds it instead of floating on grass.
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(4.3, 0.5, 4.3),
    new THREE.MeshLambertMaterial({ color: 0x8f8578 })
  );
  plinth.position.y = 0.25;
  plinth.castShadow = true;
  house.add(plinth);

  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(4, 3.4, 4),
    new THREE.MeshLambertMaterial({ color: wallColor })
  );
  walls.position.y = 2.2;
  walls.castShadow = true;
  house.add(walls);

  // Timber corner posts + top beam — half-timbered framing detail.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.4, 0.2), timberMat);
      post.position.set(sx * 1.95, 2.2, sz * 1.95);
      house.add(post);
    }
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(4.15, 0.28, 4.15), timberMat);
  beam.position.y = 3.75;
  house.add(beam);

  // Front face = local -Z (house.lookAt aims -Z at the plaza center). Door +
  // two glass windows sit slightly proud of that wall.
  const frontZ = -2.03;
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.7, 0.16), timberMat);
  door.position.set(0, 1.35, frontZ);
  house.add(door);
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x33507a });
  for (const wx of [-1.1, 1.1]) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.1), timberMat);
    frame.position.set(wx, 2.3, frontZ + 0.01);
    house.add(frame);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.14), glassMat);
    glass.position.set(wx, 2.3, frontZ);
    house.add(glass);
  }

  // Stepped pyramid roof: three shrinking box tiers.
  const roofMaterial = new THREE.MeshLambertMaterial({ color: roofColor });
  const roofTiers = 3;
  let tierY = 3.9;
  for (let index = 0; index < roofTiers; index += 1) {
    const spread = 4.4 * (1 - index / roofTiers);
    const tier = new THREE.Mesh(new THREE.BoxGeometry(spread, 0.8, spread), roofMaterial);
    tier.position.y = tierY + 0.4;
    tier.castShadow = true;
    house.add(tier);
    tierY += 0.8;
  }

  // Brick chimney with a dark cap, off to one corner of the roof.
  const chimney = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 1.6, 0.55),
    new THREE.MeshLambertMaterial({ color: 0x7a5a48 })
  );
  chimney.position.set(1.2, 4.6, 1.2);
  chimney.castShadow = true;
  house.add(chimney);
  const chimneyCap = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.7), timberMat);
  chimneyCap.position.set(1.2, 5.5, 1.2);
  house.add(chimneyCap);

  house.position.set(x, 0, z);
  // Front (local -Z) faces the street target; a tiny yaw jitter + size variance
  // keeps the grid from looking machine-stamped.
  house.lookAt(faceTargetX, 0, faceTargetZ);
  house.rotation.y += (random() - 0.5) * 0.12;
  house.scale.setScalar(scale);
  return house;
}

export function createWindmill(): { group: THREE.Group; blades: THREE.Group } {
  const windmill = new THREE.Group();

  // Tapering box tiers instead of the old 8-sided cylinder tower.
  const towerMaterial = new THREE.MeshLambertMaterial({ color: 0xd8cfc0 });
  const towerTiers = 4;
  const towerHeight = 10;
  for (let index = 0; index < towerTiers; index += 1) {
    const width = 3.6 - (index * 2) / towerTiers;
    const tierHeight = towerHeight / towerTiers;
    const tier = new THREE.Mesh(new THREE.BoxGeometry(width, tierHeight, width), towerMaterial);
    tier.position.y = tierHeight * (index + 0.5);
    tier.castShadow = true;
    windmill.add(tier);
  }

  const blades = new THREE.Group();
  const bladeMaterial = new THREE.MeshLambertMaterial({ color: 0xf5efe0 });
  for (let bladeIndex = 0; bladeIndex < 4; bladeIndex++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5.4, 0.12), bladeMaterial);
    blade.position.y = 2.7;
    const bladeArm = new THREE.Group();
    bladeArm.add(blade);
    bladeArm.rotation.z = (bladeIndex * Math.PI) / 2;
    blades.add(bladeArm);
  }
  blades.position.set(0, 9, 2.1);
  windmill.add(blades);

  windmill.position.set(0, 0, -10);
  return { group: windmill, blades };
}

export function createFountain(): THREE.Group {
  const fountain = new THREE.Group();

  // Octagon of basin blocks around the water disc.
  const basinMaterial = new THREE.MeshLambertMaterial({ color: 0x9a9284 });
  const basinSegments = 8;
  const basinRadius = 2.55;
  for (let index = 0; index < basinSegments; index += 1) {
    const angle = (index / basinSegments) * Math.PI * 2;
    const block = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.8, 0.7), basinMaterial);
    block.position.set(Math.cos(angle) * basinRadius, 0.4, Math.sin(angle) * basinRadius);
    block.rotation.y = -angle + Math.PI / 2;
    block.castShadow = true;
    fountain.add(block);
  }

  const water = new THREE.Mesh(
    new THREE.CircleGeometry(2.3, 12),
    new THREE.MeshBasicMaterial({ color: 0x3aa0ff })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.72;
  fountain.add(water);
  return fountain;
}
