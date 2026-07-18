import * as THREE from 'three';

/**
 * Shared winged-creature geometry + a GPU wing-flap shader, used by both the
 * butterfly and the bird-flush pools. A creature is a slim body along +Z with two
 * wings fanning out along ±X in the XZ plane; each vertex carries an `aWing`
 * attribute (-1 left, +1 right, 0 body). A per-INSTANCE `aFlapPhase` attribute
 * decorrelates the flock, and a single shared `uFlapTime` uniform drives the beat.
 *
 * PERFORMANCE: the flap is done ENTIRELY in the vertex shader — the wings rotate
 * about the local +Z (forward) axis by `aWing * sin(uFlapTime*speed + aFlapPhase)
 * * amp`, so animating a whole flock costs ZERO CPU per-vertex work and stays one
 * draw call. The creature keeps one InstancedMesh; the CPU only writes the
 * per-instance transform (position/heading/scale) it already computed.
 */

export interface FlapMaterial {
  material: THREE.MeshLambertMaterial;
  /** Advance the shared wing-beat clock (seconds). Call once per frame. */
  setTime(seconds: number): void;
}

/** Build the merged wings+body geometry (non-indexed, carries the `aWing` attr). */
export function createWingedGeometry(opts: {
  wingSpan: number;
  wingChord: number;
  bodyLength: number;
  bodyWidth: number;
}): THREE.BufferGeometry {
  const { wingSpan: s, wingChord: c, bodyLength: bl, bodyWidth: bw } = opts;
  const positions: number[] = [];
  const wings: number[] = [];

  // A wing is two triangles in the XZ plane; `side` = -1 (left) or +1 (right).
  // Root sits on the body spine (x=0); tip fans out to x = side*s, swept back.
  const pushWing = (side: number) => {
    const rootF = [0, 0, c * 0.5];
    const rootB = [0, 0, -c * 0.5];
    const tipF = [side * s, 0, c * 0.2];
    const tipB = [side * s, 0, -c * 0.6];
    // Wind triangles so both wings face up consistently.
    const tris = side < 0 ? [rootF, rootB, tipB, rootF, tipB, tipF] : [rootB, rootF, tipF, rootB, tipF, tipB];
    for (const v of tris) {
      positions.push(v[0], v[1], v[2]);
      wings.push(side);
    }
  };
  pushWing(-1);
  pushWing(1);

  // Body: a slim box along Z, tagged aWing=0 (never flaps). Built as 12 tris.
  const hx = bw * 0.5;
  const hy = bw * 0.5;
  const zf = bl * 0.5;
  const zb = -bl * 0.5;
  const corners = [
    [-hx, -hy, zb], [hx, -hy, zb], [hx, hy, zb], [-hx, hy, zb], // back face
    [-hx, -hy, zf], [hx, -hy, zf], [hx, hy, zf], [-hx, hy, zf], // front face
  ];
  const quads = [
    [0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0],
  ];
  for (const [a, b, d, e] of quads) {
    for (const idx of [a, b, d, a, d, e]) {
      positions.push(corners[idx][0], corners[idx][1], corners[idx][2]);
      wings.push(0);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('aWing', new THREE.Float32BufferAttribute(wings, 1));
  geo.computeVertexNormals();
  return geo;
}

/**
 * A MeshLambertMaterial patched to flap wings in the vertex shader. `flapSpeed` is
 * radians/sec of the beat, `flapAmp` the peak wing rotation (radians).
 */
export function createFlapMaterial(opts: {
  flapSpeed: number;
  flapAmp: number;
}): FlapMaterial {
  const material = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  const uFlapTime = { value: 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFlapTime = uFlapTime;
    shader.uniforms.uFlapSpeed = { value: opts.flapSpeed };
    shader.uniforms.uFlapAmp = { value: opts.flapAmp };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         attribute float aWing;
         attribute float aFlapPhase;
         uniform float uFlapTime;
         uniform float uFlapSpeed;
         uniform float uFlapAmp;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         float flapAngle = aWing * sin(uFlapTime * uFlapSpeed + aFlapPhase) * uFlapAmp;
         float cf = cos(flapAngle);
         float sf = sin(flapAngle);
         // Rotate the wing about the +Z (forward) spine → dihedral up/down beat.
         transformed = vec3(transformed.x * cf - transformed.y * sf,
                            transformed.x * sf + transformed.y * cf,
                            transformed.z);`
      );
  };
  return {
    material,
    setTime(seconds) {
      uFlapTime.value = seconds;
    },
  };
}

/** Attach the per-instance `aFlapPhase` buffer to an InstancedMesh geometry. */
export function attachFlapPhases(mesh: THREE.InstancedMesh, poolSize: number): Float32Array {
  const phases = new Float32Array(poolSize);
  const attr = new THREE.InstancedBufferAttribute(phases, 1);
  attr.setUsage(THREE.DynamicDrawUsage);
  mesh.geometry.setAttribute('aFlapPhase', attr);
  return phases;
}
