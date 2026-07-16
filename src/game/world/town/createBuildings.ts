import * as THREE from 'three';
import type { SeededRandom } from '../assets/types';
import { createWallMaterial } from './buildingMaterials';
import { createFlatRoof, createPitchedRoof } from './createRoof';

const TIMBER = 0x4a3524;
const GLASS = 0x33507a;
const PLINTH = 0x8f8578;
const STORY_HEIGHT = 3.0;
const WALL_WOOD = [0xe8dcc0, 0xdccfb4, 0xf0e6d0, 0xd8c2a0, 0xc9b48e];
const ROOF_COLORS = [0xb0452f, 0x3d7a78, 0x8a5a3a, 0x9c6b3a, 0x6a7a8a];

function pick<T>(random: SeededRandom, arr: readonly T[]): T {
  return arr[Math.min(arr.length - 1, Math.floor(random() * arr.length))];
}

/** A framed glass window on the `axis` face (thin along that axis). */
function addWindow(parent: THREE.Group, x: number, y: number, z: number, axis: 'x' | 'z'): void {
  const fw = 0.8;
  const fh = 0.95;
  const t = 0.12;
  const frameGeo = axis === 'z' ? new THREE.BoxGeometry(fw, fh, t) : new THREE.BoxGeometry(t, fh, fw);
  const glassGeo =
    axis === 'z'
      ? new THREE.BoxGeometry(fw * 0.66, fh * 0.66, t * 1.3)
      : new THREE.BoxGeometry(t * 1.3, fh * 0.66, fw * 0.66);
  const frame = new THREE.Mesh(frameGeo, new THREE.MeshLambertMaterial({ color: TIMBER }));
  frame.position.set(x, y, z);
  parent.add(frame);
  const glass = new THREE.Mesh(glassGeo, new THREE.MeshLambertMaterial({ color: GLASS }));
  glass.position.set(x, y, z);
  parent.add(glass);
}

/**
 * A textured, 1–2 story village house: varied-tone brick walls (never a flat
 * monolith color), a stone plinth, a door + randomized windows on EVERY face
 * (so no blank back), a chimney, and a tiled pitched roof (occasionally a flat
 * modern roof for variety). Front (local −Z) faces the given street target.
 */
export function createHouse(
  random: SeededRandom,
  x: number,
  z: number,
  faceTargetX: number,
  faceTargetZ: number,
  scale = 1
): THREE.Group {
  const house = new THREE.Group();
  const stories = random() < 0.4 ? 2 : 1;
  const width = 3.8 + random() * 0.8;
  const depth = 3.8 + random() * 0.6;
  const wallHeight = stories * STORY_HEIGHT + 0.3;
  const wallColor = pick(random, WALL_WOOD);
  const wallMat = createWallMaterial(wallColor, 'brick');

  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.3, 0.5, depth + 0.3),
    new THREE.MeshLambertMaterial({ color: PLINTH })
  );
  plinth.position.y = 0.25;
  house.add(plinth);

  const walls = new THREE.Mesh(new THREE.BoxGeometry(width, wallHeight, depth), wallMat);
  walls.position.y = 0.5 + wallHeight / 2;
  walls.castShadow = true;
  walls.receiveShadow = true;
  house.add(walls);

  const frontZ = -depth / 2 - 0.02;
  const backZ = depth / 2 + 0.02;
  const rightX = width / 2 + 0.02;
  const leftX = -width / 2 - 0.02;

  // Door on the front, ground floor.
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.95, 1.7, 0.16),
    new THREE.MeshLambertMaterial({ color: TIMBER })
  );
  door.position.set(random() < 0.5 ? -0.7 : 0.7, 1.35, frontZ);
  house.add(door);

  // Windows on every story and face, each face independently randomized so the
  // house is detailed all round — never a blank monolith wall.
  for (let story = 0; story < stories; story += 1) {
    const wy = 0.5 + 1.9 + story * STORY_HEIGHT;
    // Front: 1–2 windows flanking the door line.
    for (const wx of [-1.1, 1.1]) if (story > 0 || random() < 0.7) addWindow(house, wx, wy, frontZ, 'z');
    if (random() < 0.8) addWindow(house, random() < 0.5 ? -1.0 : 1.0, wy, backZ, 'z');
    if (random() < 0.7) addWindow(house, rightX, wy, (random() - 0.5) * depth * 0.6, 'x');
    if (random() < 0.7) addWindow(house, leftX, wy, (random() - 0.5) * depth * 0.6, 'x');
  }

  // Roof: mostly pitched/tiled, occasionally flat modern.
  const roofColor = pick(random, ROOF_COLORS);
  const roofY = 0.5 + wallHeight;
  if (random() < 0.82) {
    const roof = createPitchedRoof(width, depth, 1.5 + random() * 0.6, 0.45, roofColor, wallMat);
    roof.position.y = roofY;
    house.add(roof);
    // Brick chimney poking through the slope.
    const chimney = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 1.5, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x7a5a48 })
    );
    chimney.position.set(width * 0.28, roofY + 1.0, depth * 0.28);
    house.add(chimney);
  } else {
    const roof = createFlatRoof(width, depth, roofColor);
    roof.position.y = roofY;
    house.add(roof);
  }

  house.position.set(x, 0, z);
  house.lookAt(faceTargetX, 0, faceTargetZ);
  house.rotation.y += (random() - 0.5) * 0.1;
  house.scale.setScalar(scale);
  return house;
}

/**
 * The town church — a stone nave with a tall bell tower, arched windows, tiled
 * pitched roofs and a rooftop cross. A detailed pixel-art landmark; front faces
 * the given target.
 */
export function createChurch(
  random: SeededRandom,
  x: number,
  z: number,
  faceTargetX: number,
  faceTargetZ: number
): THREE.Group {
  const church = new THREE.Group();
  const stoneMat = createWallMaterial(0xcac2b2, 'stone');

  const naveW = 6;
  const naveD = 9;
  const naveH = 5;
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(naveW + 0.4, 0.6, naveD + 0.4),
    new THREE.MeshLambertMaterial({ color: PLINTH })
  );
  plinth.position.y = 0.3;
  church.add(plinth);

  const nave = new THREE.Mesh(new THREE.BoxGeometry(naveW, naveH, naveD), stoneMat);
  nave.position.y = 0.6 + naveH / 2;
  nave.castShadow = true;
  nave.receiveShadow = true;
  church.add(nave);

  const naveRoof = createPitchedRoof(naveW, naveD, 2.2, 0.4, 0x5a6b7a, stoneMat);
  naveRoof.position.y = 0.6 + naveH;
  church.add(naveRoof);

  // Tall arched windows down each side of the nave.
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i += 1) {
      const zz = -naveD / 3 + i * (naveD / 3);
      const win = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 2.4, 0.9),
        new THREE.MeshLambertMaterial({ color: 0x3a5a8c })
      );
      win.position.set(sx * (naveW / 2 + 0.02), 3.0, zz);
      church.add(win);
    }
  }

  // Bell tower at the front (local −Z end).
  const towerW = 2.6;
  const towerH = 9;
  const tower = new THREE.Mesh(new THREE.BoxGeometry(towerW, towerH, towerW), stoneMat);
  tower.position.set(0, 0.6 + towerH / 2, -naveD / 2 - towerW / 2 + 0.5);
  tower.castShadow = true;
  church.add(tower);
  const towerRoof = createPitchedRoof(towerW, towerW, 2.2, 0.3, 0x5a6b7a, stoneMat);
  towerRoof.position.set(0, 0.6 + towerH, tower.position.z);
  towerRoof.rotation.y = Math.PI / 2;
  church.add(towerRoof);
  // Rooftop cross.
  const crossMat = new THREE.MeshLambertMaterial({ color: 0xd8c98a });
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.1, 0.14), crossMat);
  crossV.position.set(0, 0.6 + towerH + 2.6, tower.position.z);
  church.add(crossV);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.14, 0.14), crossMat);
  crossH.position.set(0, 0.6 + towerH + 2.75, tower.position.z);
  church.add(crossH);

  church.position.set(x, 0, z);
  church.lookAt(faceTargetX, 0, faceTargetZ);
  return church;
}

/**
 * A small cafe building: a single textured story with a striped awning over an
 * open counter and a hanging sign — the anchor of the cafe district. Front faces
 * the given target.
 */
export function createCafeBuilding(
  random: SeededRandom,
  x: number,
  z: number,
  faceTargetX: number,
  faceTargetZ: number
): THREE.Group {
  const cafe = new THREE.Group();
  const wallMat = createWallMaterial(0xe4d2b0, 'brick');
  const width = 4.5;
  const depth = 4;
  const height = 3.2;

  const walls = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), wallMat);
  walls.position.y = height / 2;
  walls.castShadow = true;
  cafe.add(walls);

  const roof = createPitchedRoof(width, depth, 1.4, 0.4, 0x9c6b3a, wallMat);
  roof.position.y = height;
  cafe.add(roof);

  // Open counter under a striped awning on the front (local −Z).
  const frontZ = -depth / 2;
  const counter = new THREE.Mesh(
    new THREE.BoxGeometry(width - 0.6, 1.0, 0.5),
    new THREE.MeshLambertMaterial({ color: 0x7a5230 })
  );
  counter.position.set(0, 0.5, frontZ - 0.4);
  cafe.add(counter);
  const stripeW = (width - 0.4) / 5;
  for (let i = 0; i < 5; i += 1) {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(stripeW, 0.1, 1.3),
      new THREE.MeshLambertMaterial({ color: i % 2 ? 0xdcc9a8 : 0xb5482f })
    );
    stripe.position.set(-(width - 0.4) / 2 + stripeW * (i + 0.5), 2.3, frontZ - 0.7);
    stripe.rotation.x = -0.3;
    cafe.add(stripe);
  }
  // Hanging sign.
  const signArm = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.08, 0.9),
    new THREE.MeshLambertMaterial({ color: TIMBER })
  );
  signArm.position.set(width / 2 - 0.2, 2.6, frontZ - 0.4);
  cafe.add(signArm);
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.7, 0.9),
    new THREE.MeshLambertMaterial({ color: 0x8a5a3a })
  );
  sign.position.set(width / 2 - 0.2, 2.15, frontZ - 0.8);
  cafe.add(sign);

  cafe.position.set(x, 0, z);
  cafe.lookAt(faceTargetX, 0, faceTargetZ);
  return cafe;
}
