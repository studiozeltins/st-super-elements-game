import * as THREE from 'three';
import {
  INFLUENCE_WORLD_MIN,
  INFLUENCE_WORLD_SIZE,
  wearDecayForDelta,
  worldToInfluenceUv,
} from './groundInfluenceMath';

/**
 * World-space top-down SCORCH map — where attack skills struck the ground.
 * Deliberately separate from the ground-influence WEAR channel: wear is grass
 * trampling (walking writes it every frame), scorch is exposed burnt soil.
 * The split is what keeps footpaths green while strike craters brown.
 *
 * Single channel (R) 0..1, additive: each strike adds SCORCH_PER_STRIKE, so
 * five hits on the same spot saturate to full char. The terrain shader
 * quantizes the value into 5 pixel-art brown bands; decay runs on the same
 * slow regrow clock as wear (~1 minute).
 *
 * Same ping-pong / textureUniform contract as createGroundInfluence: hold the
 * uniform OBJECT, never cache `.value`.
 */
export interface ScorchMapUniforms {
  textureUniform: { value: THREE.Texture };
  /** (minX, minZ, 1/size, 1/size) for world→UV in consuming shaders. */
  boundsUniform: { value: THREE.Vector4 };
}

export interface ScorchMap extends ScorchMapUniforms {
  /** Queue a scorch stamp: `amount` 0..1 ADDS into the map (stacks darken). */
  stamp(x: number, z: number, radius: number, amount: number): void;
  /** Fade + apply queued stamps. Call once per frame BEFORE the world render. */
  update(renderer: THREE.WebGLRenderer, deltaSeconds: number): void;
  dispose(): void;
}

/** One strike's scorch: 5 stacked hits on the same spot reach full char. */
export const SCORCH_PER_STRIKE = 0.21;

const MAX_STAMPS_PER_FRAME = 16;

interface QueuedStamp {
  x: number;
  z: number;
  radius: number;
  amount: number;
}

function createTarget(resolution: number): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(resolution, resolution, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
  });
}

const PASS_VERTEX = /* glsl */ `
  attribute vec3 position;
  attribute vec2 uv;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FADE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D uPrevious;
  uniform float uDecay;
  varying vec2 vUv;
  void main() {
    gl_FragColor = vec4(texture2D(uPrevious, vUv).r * uDecay, 0.0, 0.0, 1.0);
  }
`;

const STAMP_VERTEX = /* glsl */ `
  attribute vec3 position;
  attribute vec2 uv;
  attribute mat4 instanceMatrix;
  attribute vec3 instanceColor;
  varying vec2 vUv;
  varying float vAmount;
  void main() {
    vUv = uv;
    vAmount = instanceColor.x;
    gl_Position = instanceMatrix * vec4(position, 1.0);
  }
`;

/** Solid core, soft rim — the terrain shader's cell dither tears the edge. */
const STAMP_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  varying float vAmount;
  void main() {
    float dist = length(vUv - 0.5) * 2.0;
    float falloff = 1.0 - smoothstep(0.5, 1.0, dist);
    gl_FragColor = vec4(falloff * vAmount, 0.0, 0.0, 0.0);
  }
`;

export function createScorchMap(resolution: number): ScorchMap {
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

  const fadeMaterial = new THREE.RawShaderMaterial({
    vertexShader: PASS_VERTEX,
    fragmentShader: FADE_FRAGMENT,
    uniforms: {
      uPrevious: { value: front.texture },
      uDecay: { value: 1 },
    },
    depthTest: false,
    depthWrite: false,
  });
  const fadeScene = new THREE.Scene();
  const fadeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fadeMaterial);
  fadeQuad.frustumCulled = false;
  fadeScene.add(fadeQuad);

  const stampMaterial = new THREE.RawShaderMaterial({
    vertexShader: STAMP_VERTEX,
    fragmentShader: STAMP_FRAGMENT,
    transparent: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
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

  const queue: QueuedStamp[] = [];
  const stampMatrix = new THREE.Matrix4();

  function writeStamps() {
    const count = Math.min(queue.length, MAX_STAMPS_PER_FRAME);
    for (let index = 0; index < count; index += 1) {
      const item = queue[index];
      const { u, v } = worldToInfluenceUv(item.x, item.z);
      const diameterNdc = (item.radius * 2) / INFLUENCE_WORLD_SIZE / 0.5;
      stampMatrix.makeScale(diameterNdc, diameterNdc, 1);
      stampMatrix.setPosition(u * 2 - 1, v * 2 - 1, 0);
      stampMesh.setMatrixAt(index, stampMatrix);
      stampMesh.instanceColor!.setXYZ(index, item.amount, 0, 0);
    }
    stampMesh.count = count;
    stampMesh.instanceMatrix.needsUpdate = true;
    stampMesh.instanceColor!.needsUpdate = true;
    queue.length = 0;
  }

  return {
    textureUniform,
    boundsUniform,
    stamp(x, z, radius, amount) {
      if (queue.length >= MAX_STAMPS_PER_FRAME) return;
      queue.push({ x, z, radius, amount });
    },
    update(renderer, deltaSeconds) {
      const previousAutoClear = renderer.autoClear;
      renderer.autoClear = false;

      if (!initialized) {
        initialized = true;
        renderer.getClearColor(savedClearColor);
        const savedClearAlpha = renderer.getClearAlpha();
        renderer.setClearColor(BLACK_CLEAR, 0);
        for (const target of [front, back]) {
          renderer.setRenderTarget(target);
          renderer.clear(true, false, false);
        }
        renderer.setClearColor(savedClearColor, savedClearAlpha);
      }

      fadeMaterial.uniforms.uPrevious.value = front.texture;
      fadeMaterial.uniforms.uDecay.value = wearDecayForDelta(deltaSeconds);
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
    },
  };
}

const BLACK_CLEAR = new THREE.Color(0, 0, 0);
const savedClearColor = new THREE.Color();
