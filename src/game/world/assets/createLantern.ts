import * as THREE from 'three';
import type { SeededRandom, WorldAsset } from './types';
import { lambert, randomBetween } from './assetHelpers';

const POST_COLOR = 0x4a3826;
const FRAME_COLOR = 0x2b2118;
const LAMP_COLOR = 0xffd27a;
const GLOW_COLOR = 0xffb04a;

const POST_HEIGHT = 2.2;
const LAMP_HEIGHT = 1.7;

/** Base intensity of a fully-lit lantern. Plan 04 scales this by lanternLevel. */
export const LANTERN_BASE_INTENSITY = 1.8;

/** Name of the lantern PointLight — the day/night cycle fades these by intensity. */
export const LANTERN_LIGHT_NAME = 'lanternLight';

/**
 * Simple voxel lantern post: a wooden pole capped by a warm lamp box and one
 * named warm PointLight. The light is added ONCE at build (campfire pattern) and
 * only ever drifts via `.intensity` — never added/removed at runtime (D-07 /
 * recompile ban). `layers.enableAll()` is mandatory: a light hidden from a pass
 * flips the renderer's lights-state hash and re-inits every lit material.
 */
export function createLantern(random: SeededRandom): WorldAsset {
  const group = new THREE.Group();

  // Wooden post.
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, POST_HEIGHT, 0.16), lambert(POST_COLOR));
  post.position.y = POST_HEIGHT / 2;
  post.rotation.y = randomBetween(random, -0.08, 0.08);
  group.add(post);

  // Small cross-arm the lamp hangs from.
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.1), lambert(POST_COLOR));
  arm.position.set(0.14, POST_HEIGHT - 0.15, 0);
  group.add(arm);

  // Dark lantern frame.
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.5, 0.36), lambert(FRAME_COLOR));
  frame.position.set(0.28, LAMP_HEIGHT, 0);
  group.add(frame);

  // Warm glowing lamp box (unlit basic so it reads as emissive at any hour).
  const lamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.34, 0.24),
    new THREE.MeshBasicMaterial({ color: LAMP_COLOR })
  );
  lamp.position.set(0.28, LAMP_HEIGHT, 0);
  group.add(lamp);

  // Warm point light at the lamp. Modest distance/decay — a soft pool of light,
  // not a combat flare. Base intensity is the lit value; Plan 04 fades it.
  const light = new THREE.PointLight(GLOW_COLOR, LANTERN_BASE_INTENSITY, 8, 2);
  light.name = LANTERN_LIGHT_NAME;
  // Visible to all camera layers — a pass that culls lights flips the renderer's
  // lights-state hash and re-inits every lit material per frame (RESEARCH Pattern 6).
  light.layers.enableAll();
  light.position.set(0.28, LAMP_HEIGHT, 0);
  group.add(light);

  return { group };
}
