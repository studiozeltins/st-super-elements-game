import * as THREE from 'three';

/**
 * Shared winged-creature geometry + a GPU wing-flap shader, used by both the
 * butterfly and the ground-bird pools. A creature is a slim body along +Z with
 * two wings fanning out along ±X; each vertex carries an `aWing` attribute
 * (-1 left, +1 right, 0 body) and a baked vertex COLOR (wing tint vs body tint).
 * Per-INSTANCE `aFlapPhase` decorrelates the flock and per-instance `aFlapAmp`
 * scales the beat (0 = wings folded/at rest, 1 = full flap), so pecking and flying
 * birds share ONE InstancedMesh / one draw call.
 *
 * PERFORMANCE: the flap is done ENTIRELY in the vertex shader — wings rotate about
 * the local +Z (forward) spine by `aWing * sin(uFlapTime*speed + aFlapPhase) *
 * uFlapAmp * aFlapAmp`, so animating a whole flock costs ZERO CPU per-vertex work.
 */

export interface FlapMaterial {
  material: THREE.MeshLambertMaterial;
  /** Advance the shared wing-beat clock (seconds). Call once per frame. */
  setTime(seconds: number): void;
}

export interface FlapAttrs {
  phases: Float32Array;
  amps: Float32Array;
  phaseAttr: THREE.InstancedBufferAttribute;
  ampAttr: THREE.InstancedBufferAttribute;
}

/** Build the merged wings+body geometry (non-indexed; carries aWing + vertex color). */
export function createWingedGeometry(opts: {
  wingSpan: number;
  wingChord: number;
  bodyLength: number;
  bodyWidth: number;
  wingColor: number;
  bodyColor: number;
}): THREE.BufferGeometry {
  const { wingSpan: s, wingChord: c, bodyLength: bl, bodyWidth: bw } = opts;
  const positions: number[] = [];
  const wings: number[] = [];
  const colors: number[] = [];
  const wingCol = new THREE.Color(opts.wingColor);
  const bodyCol = new THREE.Color(opts.bodyColor);

  const pushVert = (x: number, y: number, z: number, side: number, col: THREE.Color) => {
    positions.push(x, y, z);
    wings.push(side);
    colors.push(col.r, col.g, col.b);
  };

  // A wing is two triangles fanning from the body spine (x=0) out to x=side*s,
  // swept back. `side` = -1 (left) / +1 (right).
  const pushWing = (side: number) => {
    const rootF: [number, number, number] = [0, 0, c * 0.5];
    const rootB: [number, number, number] = [0, 0, -c * 0.55];
    const tipF: [number, number, number] = [side * s, 0, c * 0.25];
    const tipB: [number, number, number] = [side * s, 0, -c * 0.75];
    const tris =
      side < 0 ? [rootF, rootB, tipB, rootF, tipB, tipF] : [rootB, rootF, tipF, rootB, tipF, tipB];
    for (const v of tris) pushVert(v[0], v[1], v[2], side, wingCol);
  };
  pushWing(-1);
  pushWing(1);

  // Body: a slim box along Z, aWing=0 (never flaps), body color. 12 tris.
  const hx = bw * 0.5;
  const hy = bw * 0.5;
  const zf = bl * 0.5;
  const zb = -bl * 0.5;
  const corners: [number, number, number][] = [
    [-hx, -hy, zb], [hx, -hy, zb], [hx, hy, zb], [-hx, hy, zb],
    [-hx, -hy, zf], [hx, -hy, zf], [hx, hy, zf], [-hx, hy, zf],
  ];
  const quads = [
    [0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0],
  ];
  for (const [a, b, d, e] of quads) {
    for (const idx of [a, b, d, a, d, e]) {
      pushVert(corners[idx][0], corners[idx][1], corners[idx][2], 0, bodyCol);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('aWing', new THREE.Float32BufferAttribute(wings, 1));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * A MeshLambertMaterial (vertex-colored) patched to flap wings in the vertex
 * shader. `flapSpeed` = radians/sec of the beat, `flapAmp` = peak wing rotation
 * (radians) scaled per-instance by aFlapAmp.
 */
export function createFlapMaterial(opts: { flapSpeed: number; flapAmp: number }): FlapMaterial {
  const material = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, vertexColors: true });
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
         attribute float aFlapAmp;
         uniform float uFlapTime;
         uniform float uFlapSpeed;
         uniform float uFlapAmp;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         float flapAngle = aWing * sin(uFlapTime * uFlapSpeed + aFlapPhase) * uFlapAmp * aFlapAmp;
         float cf = cos(flapAngle);
         float sf = sin(flapAngle);
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
