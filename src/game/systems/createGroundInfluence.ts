import * as THREE from 'three';
import {
  INFLUENCE_WORLD_MIN,
  INFLUENCE_WORLD_SIZE,
  decayForDelta,
  encodeBendDirection,
  wearDecayForDelta,
  worldToInfluenceUv,
} from './groundInfluenceMath';

/**
 * World-space top-down "ground influence" map — an RGBA8 ping-pong render
 * target covering the whole terrain. Anything that moves stamps into it;
 * the grass shader samples it to bend/flatten blades, and the fade pass makes
 * every mark decay into a trail over a few seconds.
 *
 * Channel contract:
 *   R,G = bend direction, encoded dir*0.5+0.5 (0.5,0.5 = neutral)
 *   B   = flatten strength 0..1 (springy bend, fades in seconds)
 *   A   = accumulated WEAR 0..1: trampled grass. Additive per stamp, regrows
 *         on a slow (~1 minute) clock. 1 = destroyed (attack strikes).
 *
 * IMPORTANT: the target ping-pongs every frame, so consumers must hold the
 * shared `textureUniform` OBJECT (its .value is swapped internally) — caching
 * `.value`/`.texture` directly reads a stale frame forever.
 *
 * RGBA8 on purpose: renderable on every mobile GPU. Do not upgrade to
 * half-float (Android renderability is uneven) — 8 bits is plenty for 0..1.
 */
export interface GroundInfluenceUniforms {
  textureUniform: { value: THREE.Texture };
  /** (minX, minZ, 1/size, 1/size) for world→UV in consuming shaders. */
  boundsUniform: { value: THREE.Vector4 };
}

export interface GroundInfluence extends GroundInfluenceUniforms {
  /**
   * Queue a stamp for the next update(). Omit dirX/dirZ for a radial thump.
   * `wear` (0..1) additionally ADDS to the slow-regrow wear channel — small
   * per-frame values for walkers (accumulates into a trail), 1 to destroy.
   */
  stamp(
    x: number,
    z: number,
    radius: number,
    strength: number,
    dirX?: number,
    dirZ?: number,
    wear?: number
  ): void;
  /** Fade + apply queued stamps. Call once per frame BEFORE the world render. */
  update(renderer: THREE.WebGLRenderer, deltaSeconds: number): void;
  dispose(): void;
}

const MAX_STAMPS_PER_FRAME = 64;

interface QueuedStamp {
  x: number;
  z: number;
  radius: number;
  strength: number;
  dirX: number;
  dirZ: number;
  wear: number;
}

function createTarget(resolution: number): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(resolution, resolution, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
  });
}

const FADE_VERTEX = /* glsl */ `
  attribute vec3 position;
  attribute vec2 uv;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/** RG relax toward neutral 0.5, B decays fast, A (wear) regrows slowly. */
const FADE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D uPrevious;
  uniform float uDecay;
  uniform float uWearDecay;
  varying vec2 vUv;
  void main() {
    vec4 previous = texture2D(uPrevious, vUv);
    gl_FragColor = vec4(
      mix(vec2(0.5), previous.rg, uDecay),
      previous.b * uDecay,
      previous.a * uWearDecay
    );
  }
`;

const STAMP_VERTEX = /* glsl */ `
  attribute vec3 position;
  attribute vec2 uv;
  attribute mat4 instanceMatrix;
  attribute vec3 instanceColor;
  varying vec2 vUv;
  varying vec3 vData;
  void main() {
    vUv = uv;
    vData = instanceColor;
    gl_Position = instanceMatrix * vec4(position, 1.0);
  }
`;

/** vData = (encodedDirX, encodedDirZ, strength); alpha lerps RGB toward the stamp. */
const STAMP_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  varying vec3 vData;
  void main() {
    float dist = length(vUv - 0.5) * 2.0;
    float falloff = 1.0 - smoothstep(0.35, 1.0, dist);
    gl_FragColor = vec4(vData.x, vData.y, 1.0, falloff * vData.z);
  }
`;

/** vData.x = wear; written ADDITIVELY into dst alpha only (RGB preserved). */
const WEAR_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  varying vec3 vData;
  void main() {
    float dist = length(vUv - 0.5) * 2.0;
    float falloff = 1.0 - smoothstep(0.35, 1.0, dist);
    gl_FragColor = vec4(0.0, 0.0, 0.0, falloff * vData.x);
  }
`;

export function createGroundInfluence(resolution: number): GroundInfluence {
  let front = createTarget(resolution);
  let back = createTarget(resolution);
  let initialized = false;

  const textureUniform = { value: front.texture as THREE.Texture };
  const boundsUniform = {
    value: new THREE.Vector4(
      INFLUENCE_WORLD_MIN,
      INFLUENCE_WORLD_MIN,
      1 / INFLUENCE_WORLD_SIZE,
      1 / INFLUENCE_WORLD_SIZE
    ),
  };

  const passCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // Fade: fullscreen quad rewriting front → back with decayed values.
  const fadeMaterial = new THREE.RawShaderMaterial({
    vertexShader: FADE_VERTEX,
    fragmentShader: FADE_FRAGMENT,
    uniforms: {
      uPrevious: { value: front.texture },
      uDecay: { value: 1 },
      uWearDecay: { value: 1 },
    },
    depthTest: false,
    depthWrite: false,
  });
  const fadeScene = new THREE.Scene();
  const fadeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fadeMaterial);
  fadeQuad.frustumCulled = false;
  fadeScene.add(fadeQuad);

  // Stamps: one instanced unit quad, positioned directly in clip space.
  // Custom blending lerps RGB toward the stamp by src alpha while leaving the
  // destination alpha (the wear channel — written by the pass below) untouched.
  const stampMaterial = new THREE.RawShaderMaterial({
    vertexShader: STAMP_VERTEX,
    fragmentShader: STAMP_FRAGMENT,
    transparent: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    depthTest: false,
    depthWrite: false,
  });
  const stampMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    stampMaterial,
    MAX_STAMPS_PER_FRAME
  );
  stampMesh.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(MAX_STAMPS_PER_FRAME * 3),
    3
  );
  stampMesh.frustumCulled = false;
  const stampScene = new THREE.Scene();
  stampScene.add(stampMesh);

  // Wear stamps: same quad, second pass adding ONLY into dst alpha (the wear
  // channel) — the bend pass above can't, because its RGB lerp factor is the
  // src alpha, which would couple bend strength to wear amount.
  const wearMaterial = new THREE.RawShaderMaterial({
    vertexShader: STAMP_VERTEX,
    fragmentShader: WEAR_FRAGMENT,
    transparent: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.ZeroFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneFactor,
    depthTest: false,
    depthWrite: false,
  });
  const wearMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    wearMaterial,
    MAX_STAMPS_PER_FRAME
  );
  wearMesh.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(MAX_STAMPS_PER_FRAME * 3),
    3
  );
  wearMesh.frustumCulled = false;
  stampScene.add(wearMesh);

  const queue: QueuedStamp[] = [];
  const stampMatrix = new THREE.Matrix4();

  function writeStamps() {
    const count = Math.min(queue.length, MAX_STAMPS_PER_FRAME);
    let wearCount = 0;
    for (let index = 0; index < count; index += 1) {
      const item = queue[index];
      const { u, v } = worldToInfluenceUv(item.x, item.z);
      const diameterNdc = (item.radius * 2) / INFLUENCE_WORLD_SIZE / 0.5;
      stampMatrix.makeScale(diameterNdc, diameterNdc, 1);
      stampMatrix.setPosition(u * 2 - 1, v * 2 - 1, 0);
      stampMesh.setMatrixAt(index, stampMatrix);
      const direction = encodeBendDirection(item.dirX, item.dirZ);
      stampMesh.instanceColor!.setXYZ(index, direction.r, direction.g, item.strength);
      if (item.wear > 0) {
        wearMesh.setMatrixAt(wearCount, stampMatrix);
        wearMesh.instanceColor!.setXYZ(wearCount, item.wear, 0, 0);
        wearCount += 1;
      }
    }
    stampMesh.count = count;
    stampMesh.instanceMatrix.needsUpdate = true;
    stampMesh.instanceColor!.needsUpdate = true;
    wearMesh.count = wearCount;
    if (wearCount > 0) {
      wearMesh.instanceMatrix.needsUpdate = true;
      wearMesh.instanceColor!.needsUpdate = true;
    }
    queue.length = 0;
  }

  return {
    textureUniform,
    boundsUniform,
    stamp(x, z, radius, strength, dirX = 0, dirZ = 0, wear = 0) {
      if (queue.length >= MAX_STAMPS_PER_FRAME) return;
      queue.push({ x, z, radius, strength, dirX, dirZ, wear });
    },
    update(renderer, deltaSeconds) {
      const previousAutoClear = renderer.autoClear;
      renderer.autoClear = false;

      if (!initialized) {
        initialized = true;
        // Neutral state: no bend (0.5, 0.5), no flatten, empty reserved channel.
        renderer.getClearColor(savedClearColor);
        const savedClearAlpha = renderer.getClearAlpha();
        renderer.setClearColor(NEUTRAL_CLEAR, 0);
        for (const target of [front, back]) {
          renderer.setRenderTarget(target);
          renderer.clear(true, false, false);
        }
        renderer.setClearColor(savedClearColor, savedClearAlpha);
      }

      fadeMaterial.uniforms.uPrevious.value = front.texture;
      fadeMaterial.uniforms.uDecay.value = decayForDelta(deltaSeconds);
      fadeMaterial.uniforms.uWearDecay.value = wearDecayForDelta(deltaSeconds);
      renderer.setRenderTarget(back);
      renderer.render(fadeScene, passCamera);

      if (queue.length > 0) {
        writeStamps();
        renderer.render(stampScene, passCamera);
      }

      const swapped = front;
      front = back;
      back = swapped;
      textureUniform.value = front.texture;

      renderer.setRenderTarget(null);
      renderer.autoClear = previousAutoClear;
    },
    dispose() {
      front.dispose();
      back.dispose();
      fadeMaterial.dispose();
      fadeQuad.geometry.dispose();
      stampMaterial.dispose();
      stampMesh.geometry.dispose();
      wearMaterial.dispose();
      wearMesh.geometry.dispose();
    },
  };
}

const NEUTRAL_CLEAR = new THREE.Color(0.5, 0.5, 0);
const savedClearColor = new THREE.Color();
