import * as THREE from 'three';
import type { SeededRandom, WorldAsset } from './types';
import { randomBetween, shiny } from './assetHelpers';

const POST_COLOR = 0x6d4c2c; // lighter warm wood so the post reads against the ground
const CAGE_COLOR = 0x2b2118;
const BRASS_COLOR = 0xb08a3c; // highlight collars — catch light, pop off the cobble
const LAMP_COLOR = 0xffd27a;
const GLOW_COLOR = 0xffb04a;

const POST_HEIGHT = 4.2;
const LAMP_HEIGHT = 3.6;
// The lantern hangs off the cross-arm end, offset from the post on +x.
const HANG_X = 0.28;

/** Base intensity of a fully-lit lantern. Plan 04 scales this by lanternLevel. */
export const LANTERN_BASE_INTENSITY = 1.8;

/** Name of the lantern PointLight — the day/night cycle fades these by intensity. */
export const LANTERN_LIGHT_NAME = 'lanternLight';

/** Name of the emissive lamp-body mesh — the cycle fades its glow so the lantern
 *  reads as OFF (dark glass) by day and lit by night, in step with the light. */
export const LANTERN_LAMP_NAME = 'lanternLamp';

/** The lamp's fully-lit warm glow hex. The cycle scales toward black by day. */
export const LANTERN_LAMP_COLOR = LAMP_COLOR;

/**
 * Voxel lantern post: a wooden pole with a cross-arm, and a hanging CAGED lantern
 * — a warm emissive glowing body left VISIBLE inside a thin dark cage (4 corner
 * bars + a dark roof cap + base plate), not sealed inside a solid dark box. The
 * warm PointLight is added ONCE at build (campfire pattern) and only ever drifts
 * via `.intensity` — never added/removed at runtime (D-07 / recompile ban).
 * `layers.enableAll()` is mandatory: a light hidden from a pass flips the
 * renderer's lights-state hash and re-inits every lit material.
 */
/**
 * `withLight: false` builds a lantern with NO PointLight — just the emissive
 * glowing lamp body (which still fades day/night). Used for the many decorative
 * road lanterns: every real light is looped per-fragment by EVERY lit material in
 * the whole scene (three's forward renderer), so a dozen extra point lights tax
 * the terrain/grass everywhere. Only the plaza lanterns carry actual light.
 */
export function createLantern(
  random: SeededRandom,
  opts: { withLight?: boolean } = {}
): WorldAsset {
  const withLight = opts.withLight ?? true;
  const group = new THREE.Group();
  const postMat = shiny(POST_COLOR, 22);
  const cageMat = shiny(CAGE_COLOR, 45, 0x333333);

  // Wooden post.
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, POST_HEIGHT, 0.16), postMat);
  post.position.y = POST_HEIGHT / 2;
  post.rotation.y = randomBetween(random, -0.08, 0.08);
  group.add(post);

  // Brass collars — a wider base + banding that catch light so the post pops.
  const brassMat = shiny(BRASS_COLOR, 70, 0x6a561e);
  const footing = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.34), brassMat);
  footing.position.y = 0.15;
  group.add(footing);
  for (const y of [0.5, POST_HEIGHT - 0.5]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.22), brassMat);
    band.position.y = y;
    band.rotation.y = post.rotation.y;
    group.add(band);
  }

  // Cross-arm the lantern hangs from.
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.1), postMat);
  arm.position.set(HANG_X / 2, POST_HEIGHT - 0.15, 0);
  group.add(arm);

  // Short chain link from the arm end to the roof cap (connects them visually).
  const link = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.04), cageMat);
  link.position.set(HANG_X, POST_HEIGHT - 0.28, 0);
  group.add(link);

  // Dark roof cap + base plate — bookend the glowing body top and bottom.
  const roof = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.34), cageMat);
  roof.position.set(HANG_X, LAMP_HEIGHT + 0.24, 0);
  group.add(roof);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.3), cageMat);
  base.position.set(HANG_X, LAMP_HEIGHT - 0.24, 0);
  group.add(base);

  // Four THIN corner bars — the cage. Warm body shows between them.
  const barGeo = new THREE.BoxGeometry(0.04, 0.44, 0.04);
  for (let i = 0; i < 4; i += 1) {
    const bar = new THREE.Mesh(barGeo, cageMat);
    const cx = i < 2 ? -0.13 : 0.13;
    const cz = i % 2 === 0 ? -0.13 : 0.13;
    bar.position.set(HANG_X + cx, LAMP_HEIGHT, cz);
    group.add(bar);
  }

  // Warm glowing lamp body (unlit basic so it reads as emissive at any hour) —
  // now the LARGEST, most visible element, exposed through the cage.
  const lamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.4, 0.24),
    new THREE.MeshBasicMaterial({ color: LAMP_COLOR })
  );
  lamp.name = LANTERN_LAMP_NAME;
  lamp.position.set(HANG_X, LAMP_HEIGHT, 0);
  group.add(lamp);

  // Warm point light at the lamp — ONLY when withLight (plaza lanterns). Modest
  // distance/decay: a soft pool, not a combat flare. Base intensity is the lit
  // value; the day/night cycle fades it.
  if (withLight) {
    const light = new THREE.PointLight(GLOW_COLOR, LANTERN_BASE_INTENSITY, 12, 2);
    light.name = LANTERN_LIGHT_NAME;
    // Visible to all camera layers — a pass that culls lights flips the renderer's
    // lights-state hash and re-inits every lit material per frame (RESEARCH Pattern 6).
    light.layers.enableAll();
    light.position.set(HANG_X, LAMP_HEIGHT, 0);
    group.add(light);
  }

  return { group };
}
