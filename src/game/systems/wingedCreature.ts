import * as THREE from 'three';

/**
 * GPU wing-flap shader helpers for the butterfly pool. Wing verts carry an `aWing`
 * attribute (-1 left, +1 right, 0 hinge) and per-INSTANCE `aFlapPhase` (decorrelates
 * the flock) + `aFlapAmp` (0 = folded, 1 = full flap). The flap is done ENTIRELY in
 * the vertex shader — wings rotate about the local +Z (forward) spine by
 * `aWing·sin(uFlapTime·speed + aFlapPhase)·uFlapAmp·aFlapAmp` — so animating a whole
 * flock costs ZERO CPU per-vertex work and renders in one draw call.
 *
 * (Ground birds are the CC-BY crow GLTF model — see createBirdFlush/crowModel — and
 * no longer use this module.)
 */

export interface FlapMaterial {
  material: THREE.Material;
  /** Advance the shared wing-beat clock (seconds). Call once per frame. */
  setTime(seconds: number): void;
}

export interface FlapAttrs {
  phases: Float32Array;
  amps: Float32Array;
  phaseAttr: THREE.InstancedBufferAttribute;
  ampAttr: THREE.InstancedBufferAttribute;
}

/**
 * Patch a material's vertex shader to flap wings on the GPU: wings (aWing = ±1)
 * rotate about the forward (+Z) spine by `aWing·sin(uFlapTime·speed + aFlapPhase)
 * ·uFlapAmp·aFlapAmp`. Shared by the vertex-colored (bird) and textured (butterfly)
 * flap materials so the beat math lives in exactly one place.
 */
function patchFlapShader(material: THREE.Material, flapSpeed: number, flapAmp: number): { value: number } {
  const uFlapTime = { value: 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFlapTime = uFlapTime;
    shader.uniforms.uFlapSpeed = { value: flapSpeed };
    shader.uniforms.uFlapAmp = { value: flapAmp };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         attribute float aWing;
         attribute float aFlapPhase;
         attribute float aFlapAmp;
         uniform float uFlapTime;
         uniform float uFlapSpeed;
         uniform float uFlapAmp;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         // Retract wing verts toward the spine as aFlapAmp falls to 0 (crow tucks
         // its wings when grounded). Body verts (aWing=0) are untouched; the
         // butterfly always runs amp=1, so this is a no-op there.
         transformed.x *= mix(1.0, aFlapAmp, abs(aWing));
         float flapAngle = aWing * sin(uFlapTime * uFlapSpeed + aFlapPhase) * uFlapAmp * aFlapAmp;
         float cf = cos(flapAngle);
         float sf = sin(flapAngle);
         transformed = vec3(transformed.x * cf - transformed.y * sf,
                            transformed.x * sf + transformed.y * cf,
                            transformed.z);`
      );
  };
  return uFlapTime;
}

/**
 * An UNLIT (MeshBasicMaterial) textured flap material — a wing texture with an
 * alpha cutout, so a painted butterfly reads vividly regardless of the dusk light,
 * and the same GPU wing-flap folds it. `map` carries the wing art (alpha = shape).
 */
export function createTexturedFlapMaterial(opts: {
  flapSpeed: number;
  flapAmp: number;
  map: THREE.Texture;
}): FlapMaterial {
  const material = new THREE.MeshBasicMaterial({
    map: opts.map,
    side: THREE.DoubleSide,
    transparent: false,
    alphaTest: 0.5,
  });
  const uFlapTime = patchFlapShader(material, opts.flapSpeed, opts.flapAmp);
  return { material, setTime: (s) => { uFlapTime.value = s; } };
}

/**
 * A solid-colour lit (MeshLambert) flap material — for the crow's procedural wings,
 * which tuck against the body when grounded (aFlapAmp 0) and spread + beat in flight
 * (aFlapAmp 1). `color` matches the crow's dark plumage.
 */
export function createSolidFlapMaterial(opts: {
  flapSpeed: number;
  flapAmp: number;
  color: number;
}): FlapMaterial {
  const material = new THREE.MeshLambertMaterial({ color: opts.color, side: THREE.DoubleSide });
  const uFlapTime = patchFlapShader(material, opts.flapSpeed, opts.flapAmp);
  return { material, setTime: (s) => { uFlapTime.value = s; } };
}

/** Attach the per-instance flap buffers (phase + amplitude) to an InstancedMesh. */
export function attachFlapAttrs(mesh: THREE.InstancedMesh, poolSize: number): FlapAttrs {
  const phases = new Float32Array(poolSize);
  const amps = new Float32Array(poolSize); // default 0 = folded until a bird flies
  const phaseAttr = new THREE.InstancedBufferAttribute(phases, 1);
  const ampAttr = new THREE.InstancedBufferAttribute(amps, 1);
  phaseAttr.setUsage(THREE.DynamicDrawUsage);
  ampAttr.setUsage(THREE.DynamicDrawUsage);
  mesh.geometry.setAttribute('aFlapPhase', phaseAttr);
  mesh.geometry.setAttribute('aFlapAmp', ampAttr);
  return { phases, amps, phaseAttr, ampAttr };
}
